import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

/**
 * openapi.yaml is the source of truth for the MCP tool surface. It lives at the
 * repo root in development and beside `dist/` in the container image, so the
 * loader walks upward from this module until it finds one. HELIX_OPENAPI_PATH
 * overrides the search.
 */

export type JsonObject = Record<string, unknown>;

export interface OpenApiSpec {
  info?: { title?: string; version?: string; description?: string };
  paths: Record<string, JsonObject>;
  components?: { schemas?: Record<string, JsonObject>; parameters?: Record<string, JsonObject> };
}

export function findSpecPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env['HELIX_OPENAPI_PATH'];
  if (override) return resolve(override);

  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'openapi.yaml');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('openapi.yaml not found; set HELIX_OPENAPI_PATH');
}

export function loadSpec(path = findSpecPath()): OpenApiSpec {
  return parseSpec(readFileSync(path, 'utf8'));
}

export function parseSpec(source: string): OpenApiSpec {
  const parsed = yaml.load(source);
  if (!parsed || typeof parsed !== 'object' || !('paths' in parsed)) {
    throw new Error('openapi.yaml has no `paths`');
  }
  return parsed as OpenApiSpec;
}

const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

function resolvePointer(root: OpenApiSpec, ref: string): unknown {
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref: ${ref}`);
  let node: unknown = root;
  for (const segment of ref.slice(2).split('/')) {
    if (!isObject(node)) return undefined;
    node = node[segment.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return node;
}

/**
 * Inline every `$ref` so a tool's input schema stands alone: MCP clients never
 * see the `components` section. A reference that points back into itself is
 * replaced by a bare object rather than recursing forever.
 */
export function deref<T = unknown>(node: T, root: OpenApiSpec, stack: readonly string[] = []): T {
  if (Array.isArray(node)) {
    return node.map((item) => deref(item, root, stack)) as T;
  }
  if (!isObject(node)) return node;

  const ref = node['$ref'];
  if (typeof ref === 'string') {
    if (stack.includes(ref)) return { type: 'object', description: `Recursive: ${ref.split('/').pop()}` } as T;
    const target = resolvePointer(root, ref);
    if (target === undefined) throw new Error(`unresolved $ref: ${ref}`);
    const { $ref: _drop, ...siblings } = node;
    void _drop;
    const resolved = deref(target, root, [...stack, ref]);
    return (isObject(resolved) ? { ...resolved, ...deref(siblings, root, stack) } : resolved) as T;
  }

  const out: JsonObject = {};
  for (const [key, value] of Object.entries(node)) out[key] = deref(value, root, stack);
  return out as T;
}

/**
 * Collapse a top-level `allOf` of object schemas into one object schema so the
 * tool's `properties` are visible without the client having to merge them.
 */
export function flattenAllOf(schema: JsonObject): JsonObject {
  const members = schema['allOf'];
  if (!Array.isArray(members)) return schema;

  const properties: JsonObject = {};
  const required = new Set<string>();
  let description: string | undefined = typeof schema['description'] === 'string' ? schema['description'] : undefined;

  for (const raw of members) {
    if (!isObject(raw)) continue;
    const member = flattenAllOf(raw);
    if (isObject(member['properties'])) Object.assign(properties, member['properties']);
    if (Array.isArray(member['required'])) {
      for (const r of member['required']) if (typeof r === 'string') required.add(r);
    }
    if (!description && typeof member['description'] === 'string') description = member['description'];
  }

  if (isObject(schema['properties'])) Object.assign(properties, schema['properties']);
  if (Array.isArray(schema['required'])) {
    for (const r of schema['required']) if (typeof r === 'string') required.add(r);
  }

  const { allOf: _allOf, ...rest } = schema;
  void _allOf;
  return {
    ...rest,
    type: 'object',
    ...(description ? { description } : {}),
    properties,
    ...(required.size > 0 ? { required: [...required] } : {}),
  };
}
