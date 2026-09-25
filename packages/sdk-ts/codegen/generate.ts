import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deref, flattenAllOf, loadSpec, type JsonObject, type OpenApiSpec } from '../../../apps/api/src/mcp/spec.js';
import { NOT_IN_SDK, SDK_METHODS, type SdkMethod } from './methods.js';

/**
 * Generates src/client.ts from openapi.yaml and codegen/methods.ts.
 *
 * The spec is read through the loader the MCP tools use (apps/api/src/mcp),
 * so the SDK and the MCP surface are two derivations of one document.
 *
 *   tsx codegen/generate.ts          write src/client.ts
 *   tsx codegen/generate.ts --check  exit 1 if src/client.ts is stale
 */

const here = dirname(fileURLToPath(import.meta.url));
export const SPEC_PATH = resolve(here, '..', '..', '..', 'openapi.yaml');
export const OUTPUT_PATH = join(here, '..', 'src', 'client.ts');

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
const HTTP_METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const NOT_IMPORTED = new Set(['AbortSignal', 'FormData', 'unknown', 'void', 'string', 'number', 'boolean']);

interface Operation {
  method: HttpMethod;
  path: string;
  pathItem: JsonObject;
  op: JsonObject;
}

interface Param {
  name: string;
  required: boolean;
  type: string;
}

const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

function operationsById(spec: OpenApiSpec): Map<string, Operation> {
  const ops = new Map<string, Operation>();
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!isObject(pathItem)) continue;
    for (const method of HTTP_METHODS) {
      const op = pathItem[method.toLowerCase()];
      if (!isObject(op)) continue;
      const id = op['operationId'];
      if (typeof id !== 'string') throw new Error(`${method} ${path} has no operationId`);
      ops.set(id, { method, path, pathItem, op });
    }
  }
  return ops;
}

function tsType(schema: unknown): string {
  const type = isObject(schema) ? schema['type'] : undefined;
  return type === 'integer' || type === 'number' ? 'number' : type === 'boolean' ? 'boolean' : 'string';
}

function params(spec: OpenApiSpec, o: Operation, where: 'path' | 'query'): Param[] {
  const merged = new Map<string, Param>();
  for (const source of [o.pathItem['parameters'], o.op['parameters']]) {
    if (!Array.isArray(source)) continue;
    for (const raw of source) {
      const p = deref(raw, spec);
      if (!isObject(p) || p['in'] !== where || typeof p['name'] !== 'string') continue;
      merged.set(p['name'], { name: p['name'], required: where === 'path' || p['required'] === true, type: tsType(p['schema']) });
    }
  }
  const list = [...merged.values()];
  if (where === 'path') {
    // Path order, not declaration order, fixes the argument order.
    const order = [...o.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    list.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  }
  return list;
}

const refName = (node: unknown): string | undefined =>
  isObject(node) && typeof node['$ref'] === 'string' ? node['$ref'].split('/').pop() : undefined;

function content(node: unknown): JsonObject | undefined {
  return isObject(node) && isObject(node['content']) ? node['content'] : undefined;
}

function successCodes(o: Operation): string[] {
  const responses = isObject(o.op['responses']) ? o.op['responses'] : {};
  return Object.keys(responses).filter((code) => /^2\d\d$/.test(code)).sort();
}

function responseRef(o: Operation): string | undefined {
  const responses = o.op['responses'] as JsonObject;
  for (const code of successCodes(o)) {
    const json = content(responses[code])?.['application/json'];
    const name = isObject(json) ? refName(json['schema']) : undefined;
    if (name) return name;
  }
  return undefined;
}

function multipartFields(spec: OpenApiSpec, o: Operation): string[] {
  const multipart = content(o.op['requestBody'])?.['multipart/form-data'];
  if (!isObject(multipart)) throw new Error(`${String(o.op['operationId'])} takes an upload but has no multipart/form-data body`);
  const schema = flattenAllOf(deref(multipart['schema'], spec) as JsonObject);
  return Object.keys(isObject(schema['properties']) ? schema['properties'] : {}).filter((f) => f !== 'file');
}

function jsdoc(doc: string | undefined): string {
  if (!doc) return '';
  const lines = doc.split('\n');
  if (lines.length === 1) return `  /** ${doc} */\n`;
  return `  /**\n${lines.map((l) => (l ? `   * ${l}` : '   *')).join('\n')}\n   */\n`;
}

function signature(head: string, args: string[], tail: string): string {
  const oneLine = `  ${head}(${args.join(', ')})${tail} {`;
  if (oneLine.length <= 120) return oneLine;
  return `  ${head}(\n${args.map((a) => `    ${a},`).join('\n')}\n  )${tail} {`;
}

function emitMethod(spec: OpenApiSpec, row: SdkMethod, o: Operation, types: Set<string>): string {
  const fail = (why: string): never => {
    throw new Error(`${row.name} (${row.op}): ${why}`);
  };
  const use = (type: string): string => {
    for (const id of type.match(/[A-Za-z_]\w*/g) ?? []) if (!NOT_IMPORTED.has(id)) types.add(id);
    return type;
  };

  const args: string[] = [];
  const pathParams = params(spec, o, 'path');
  const argFor = new Map(pathParams.map((p, i) => [p.name, row.pathArgs?.[i] ?? p.name]));
  for (const p of pathParams) args.push(`${argFor.get(p.name)}: ${use(row.pathTypes?.[p.name] ?? p.type)}`);
  const path = o.path.replace(/\{(\w+)\}/g, (_, name: string) => `\${encodeURIComponent(${argFor.get(name)})}`);
  const pathExpr = path.includes('${') ? `\`${path}\`` : `'${path}'`;

  const lines: string[] = [];
  let body: string | undefined;
  if (row.bodyFrom) {
    args.push(`${row.bodyFrom.arg}: ${use(row.bodyFrom.type)}`);
    body = `{ ${row.bodyFrom.field}: ${row.bodyFrom.arg} }`;
  } else if (o.op['requestBody'] !== undefined) {
    const requestBody = deref(o.op['requestBody'], spec) as JsonObject;
    const json = content(o.op['requestBody'])?.['application/json'];
    const request = row.request ?? (isObject(json) ? refName(json['schema']) : undefined) ?? fail('inline request schema; set `request`');
    const name = row.bodyArg ?? 'request';
    const optional = requestBody['required'] !== true;
    args.push(`${name}${optional ? '?' : ''}: ${use(row.upload ? `${request} | ${row.upload}` : request)}`);
    if (row.upload) {
      const fields = multipartFields(spec, o).map((f) => `'${f}'`).join(', ');
      lines.push(`    const body = 'file' in ${name} ? toFormData(${name}, [${fields}]) : ${name};`);
      body = 'body';
    } else {
      body = name;
    }
  }

  const queryParams = params(spec, o, 'query');
  const mode = queryParams.length === 0 ? 'none' : (row.query ?? 'options');
  let query: string | undefined;
  if (mode === 'positional') {
    for (const q of queryParams) args.push(`${q.name}${q.required ? '' : '?'}: ${q.type}`);
    query = `{ ${queryParams.map((q) => q.name).join(', ')} }`;
  } else if (mode === 'options') {
    const inline = `{ ${queryParams.map((q) => `${q.name}?: ${q.type}`).join('; ')} }`;
    args.push(`options?: ${row.queryType ? use(row.queryType) : inline}`);
    query = `{ ${queryParams.map((q) => `${q.name}: options?.${q.name}`).join(', ')} }`;
  }

  if (row.url) {
    return `${jsdoc(row.doc)}${signature(row.name, args, ': string')}\n    return this.url(${pathExpr}${query ? `, ${query}` : ''});\n  }\n`;
  }

  args.push('signal?: AbortSignal');
  const codes = successCodes(o);
  const isVoid = codes.length > 0 && codes.every((c) => c === '204');
  const response = row.response ?? (isVoid ? 'void' : responseRef(o)) ?? fail('inline response schema; set `response`');
  use(response);

  const noAuth = Array.isArray(o.op['security']) && o.op['security'].length === 0;
  const options = [query && `query: ${query}`, body && (body === 'body' ? 'body' : `body: ${body}`), 'signal', noAuth && 'auth: false']
    .filter(Boolean)
    .join(', ');
  const call = `this.${row.decode ? 'raw' : isVoid ? 'raw' : `send<${response}>`}('${o.method}', ${pathExpr}, { ${options} })`;

  if (row.decode) lines.push(`    return ${row.decode}(await ${call});`);
  else if (isVoid) lines.push(`    await ${call};`);
  else lines.push(`    return ${call};`);

  return `${jsdoc(row.doc)}${signature(`async ${row.name}`, args, `: Promise<${response}>`)}\n${lines.join('\n')}\n  }\n`;
}

/** Render src/client.ts. Throws when the spec and the method table disagree. */
export function render(spec: OpenApiSpec, methods: readonly SdkMethod[] = SDK_METHODS, skipped: Readonly<Record<string, string>> = NOT_IN_SDK): string {
  const ops = operationsById(spec);
  const covered = new Set([...methods.map((m) => m.op), ...Object.keys(skipped)]);
  const unaccounted = [...ops.keys()].filter((id) => !covered.has(id));
  if (unaccounted.length) {
    throw new Error(`openapi.yaml operations with no SDK decision: ${unaccounted.join(', ')}. Add a row to codegen/methods.ts or list them in NOT_IN_SDK.`);
  }
  const unknown = [...covered].filter((id) => !ops.has(id));
  if (unknown.length) throw new Error(`codegen/methods.ts names operations openapi.yaml does not have: ${unknown.join(', ')}`);
  const both = methods.filter((m) => m.op in skipped).map((m) => m.op);
  if (both.length) throw new Error(`Operations both generated and listed in NOT_IN_SDK: ${both.join(', ')}`);

  const types = new Set<string>();
  const bodies = methods.map((row) => emitMethod(spec, row, ops.get(row.op)!, types));
  const runtime = ['HelixTransport', ...new Set(methods.flatMap((m) => [m.upload ? 'toFormData' : '', m.decode ?? '']).filter(Boolean))].sort();

  return [
    '// GENERATED from openapi.yaml by codegen/generate.ts, with names and types from',
    '// codegen/methods.ts. Do not edit: change either of those and run `npm run generate`.',
    '',
    `import { ${runtime.join(', ')} } from './transport.js';`,
    `import type {\n${[...types].sort().map((t) => `  ${t},`).join('\n')}\n} from './types.js';`,
    '',
    "export type { HelixClientOptions } from './transport.js';",
    '',
    'export class HelixClient extends HelixTransport {',
    bodies.join('\n').trimEnd(),
    '}',
    '',
  ].join('\n');
}

export const README_PATH = join(here, '..', 'README.md');
const SURFACE_START = '<!-- api-surface:start (generated by codegen/generate.ts) -->';
const SURFACE_END = '<!-- api-surface:end -->';

/** The README's method table, between its markers. */
export function renderReadme(readme: string, spec: OpenApiSpec, methods: readonly SdkMethod[] = SDK_METHODS): string {
  const start = readme.indexOf(SURFACE_START);
  const end = readme.indexOf(SURFACE_END);
  if (start < 0 || end < start) throw new Error(`README.md needs the ${SURFACE_START} and ${SURFACE_END} markers`);
  const ops = operationsById(spec);
  const rows = methods.map((row) => {
    const o = ops.get(row.op)!;
    const names = params(spec, o, 'path').map((p, i) => [p.name, row.pathArgs?.[i] ?? p.name] as const);
    const path = names.reduce((p, [from, to]) => p.replace(`{${from}}`, `{${to}}`), o.path);
    return `| \`${row.name}\` | ${row.url ? `builds the \`${o.method} ${path}\` URL` : `\`${o.method} ${path}\``} |`;
  });
  const table = ['| Method | Endpoint |', '|---|---|', ...rows].join('\n');
  return `${readme.slice(0, start + SURFACE_START.length)}\n${table}\n${readme.slice(end)}`;
}

const normalize = (text: string): string => text.replace(/\r\n/g, '\n');

/** Each generated file, with what it holds now and what it should hold. */
export function outputs(spec: OpenApiSpec = loadSpec(SPEC_PATH)): { path: string; current: string; expected: string }[] {
  const readme = normalize(readFileSync(README_PATH, 'utf8'));
  return [
    { path: OUTPUT_PATH, current: normalize(readFileSync(OUTPUT_PATH, 'utf8')), expected: render(spec) },
    { path: README_PATH, current: readme, expected: renderReadme(readme, spec) },
  ];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stale = outputs().filter((o) => o.current !== o.expected);
  if (process.argv.includes('--check')) {
    for (const o of stale) console.error(`${o.path} is stale against openapi.yaml or codegen/methods.ts.`);
    if (stale.length) {
      console.error('Run: npm run generate');
      process.exit(1);
    }
    console.log('SDK matches openapi.yaml');
  } else {
    for (const o of stale) {
      writeFileSync(o.path, o.expected);
      console.log(`wrote ${o.path}`);
    }
  }
}
