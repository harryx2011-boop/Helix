import type { JsonObject } from './spec.js';

/**
 * The MCP manifest is read by a model, and every listed schema is paid for in
 * context each time a tool loads. openapi.yaml serves docs and SDK codegen
 * too, so its prose stays long; this module shrinks only what `tools/list`
 * advertises. No property, type, bound, enum value or `required` entry is
 * removed, and the HTTP route validates the call whatever the manifest says.
 *
 * Four moves: terse wording (lead sentence, bounded), structure trims that
 * change no meaning (OpenAPI-only `discriminator`, the default
 * `additionalProperties: true` and `default: false`, a one-member `allOf`),
 * shared sub-schemas hoisted into `$defs` so an option object repeated inside
 * one tool is written once, and an option repeated across tools documented
 * once (see `slimManifest`).
 */

export interface Budget {
  tool: number;
  property: number;
  nested: number;
}

/* Characters of prose kept: tool summary plus lead sentence, a top-level option, an option nested inside one (none: names, types and enums say enough). */
export const DEFAULT_BUDGET: Budget = { tool: 130, property: 36, nested: 0 };

const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

const REF_LENGTH = '{"$ref":"#/$defs/d00"}'.length;

/* Below this a `$ref` costs readability and some clients' patience for no real saving. */
const MIN_SHARED = 80;

/* A repeated option loses its prose only when there is enough of it to be worth a pointer. */
const MIN_PROSE = 40;

/* A tool that lost this much prose to another tool says where it went. */
const POINTER_PROSE = 150;

const flatten = (text: string): string => text.replace(/\s+/g, ' ').trim();

/* A semicolon ends a clause that stands alone; "e.g." and "i.e." do not end a sentence. */
const SENTENCE = /.*?(?:(?<!\be\.g|\bi\.e)[.!?](?=\s|$)|;(?=\s))|.+$/g;

/* A sentence that opens this way is complete only with its main clause. */
const SUBORDINATE = /^(when|if|while|once|unless|with|after|before|because)\b/i;

/** Whole sentences of `text` that fit `max`; empty when not even the first does. */
function sentencesWithin(text: string, max: number): string {
  let out = '';
  for (const raw of text.match(SENTENCE) ?? [text]) {
    const s = raw.trim();
    if (out.length + s.length + (out ? 1 : 0) > max) break;
    out = out ? `${out} ${s}` : s;
  }
  return out.replace(/;$/, '.');
}

/**
 * First paragraph, whitespace collapsed, whole sentences up to `max` (the lead
 * sentence may run to 1.7x). A lone sentence longer than that is cut at its
 * last clause boundary, or dropped: a fragment that ends mid-thought misleads.
 */
export function brief(text: string, max: number): string {
  const first = flatten(text.split(/\n\s*\n/)[0] ?? '');
  if (first.length <= max) return first;
  const cap = Math.round(max * 1.7);
  const whole = sentencesWithin(first, max) || sentencesWithin(first, cap);
  if (whole) return whole;
  if (SUBORDINATE.test(first)) return '';
  const cut = [...first.matchAll(/, | — | \(/g)].map((m) => m.index).filter((i) => i >= 20 && i <= cap).pop();
  return cut === undefined ? '' : `${first.slice(0, cut)}.`;
}

/** Summary line plus whole sentences of the first body paragraph, up to `max`; the `Returns:` tail is dropped. */
export function briefTool(text: string, max: number): string {
  const [summary = '', body = ''] = text.split(/\n\s*\n/).filter((p) => !p.startsWith('Returns:'));
  const head = brief(summary, max).replace(/\.$/, '');
  const more = sentencesWithin(flatten(body), max - head.length - 2);
  return more ? `${head}. ${more}` : head;
}

const SUBSCHEMA_LISTS = ['oneOf', 'anyOf', 'allOf'] as const;

/* Values, not schemas: a `description` key inside them is data. */
const LITERAL_KEYS = new Set(['default', 'enum', 'const', 'example', 'examples', 'required']);

function stripDescriptions(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripDescriptions);
  if (!isObject(node)) return node;
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'description' && typeof value === 'string') continue;
    if (key === 'properties' && isObject(value)) {
      out[key] = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripDescriptions(v)]));
    } else {
      out[key] = LITERAL_KEYS.has(key) ? value : stripDescriptions(value);
    }
  }
  return out;
}

function trim(node: unknown, budget: Budget, depth: number): unknown {
  if (Array.isArray(node)) return node.map((n) => trim(n, budget, depth));
  if (!isObject(node)) return node;

  const out: JsonObject = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'discriminator') continue;
    if (key === 'additionalProperties' && value === true) continue;
    if (key === 'default' && value === false) continue;
    if (key === 'description' && typeof value === 'string') {
      const max = depth <= 1 ? budget.property : budget.nested;
      const text = max > 0 ? brief(value, max) : '';
      if (text.length > 1) out[key] = text;
    } else if (key === 'properties' && isObject(value)) {
      out[key] = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trim(v, budget, depth + 1)]));
    } else if (LITERAL_KEYS.has(key)) {
      out[key] = value;
    } else {
      out[key] = trim(value, budget, key === 'items' || SUBSCHEMA_LISTS.includes(key as 'oneOf') ? depth : depth + 1);
    }
  }

  const members = out['allOf'];
  if (Array.isArray(members) && members.length === 1 && isObject(members[0])) {
    const { allOf: _drop, ...rest } = out;
    void _drop;
    return { ...members[0], ...rest };
  }
  return out;
}

function childSchemas(node: JsonObject): JsonObject[] {
  const children: JsonObject[] = [];
  if (isObject(node['properties'])) children.push(...Object.values(node['properties']).filter(isObject));
  if (isObject(node['items'])) children.push(node['items']);
  if (isObject(node['additionalProperties'])) children.push(node['additionalProperties']);
  for (const list of SUBSCHEMA_LISTS) {
    const members = node[list];
    if (Array.isArray(members)) children.push(...members.filter(isObject));
  }
  return children;
}

function rewrite(node: JsonObject, replace: (n: JsonObject) => JsonObject | undefined): JsonObject {
  const swap = (n: JsonObject): JsonObject => replace(n) ?? rewrite(n, replace);
  const out: JsonObject = { ...node };
  if (isObject(node['properties'])) {
    out['properties'] = Object.fromEntries(
      Object.entries(node['properties']).map(([k, v]) => [k, isObject(v) ? swap(v) : v]),
    );
  }
  for (const key of ['items', 'additionalProperties'] as const) {
    const child = node[key];
    if (isObject(child)) out[key] = swap(child);
  }
  for (const list of SUBSCHEMA_LISTS) {
    const members = node[list];
    if (Array.isArray(members)) out[list] = members.map((m) => (isObject(m) ? swap(m) : m));
  }
  return out;
}

/** Hoist sub-schemas that occur twice or more into `$defs`, largest saving first. */
export function hoistShared(schema: JsonObject): JsonObject {
  let root = schema;
  const defs: Record<string, JsonObject> = {};

  for (let id = 1; ; id++) {
    const seen = new Map<string, { node: JsonObject; count: number }>();
    const visit = (node: JsonObject): void => {
      for (const child of childSchemas(node)) {
        if (child['$ref'] === undefined) {
          const key = JSON.stringify(child);
          const entry = seen.get(key);
          if (entry) entry.count++;
          else seen.set(key, { node: child, count: 1 });
        }
        visit(child);
      }
    };
    visit(root);
    for (const def of Object.values(defs)) visit(def);

    let best: { key: string; node: JsonObject } | undefined;
    let bestGain = 0;
    for (const [key, { node, count }] of seen) {
      if (count < 2 || key.length < MIN_SHARED) continue;
      const gain = (key.length - REF_LENGTH) * count - key.length - 8;
      if (gain > bestGain) {
        bestGain = gain;
        best = { key, node };
      }
    }
    if (!best) break;

    const name = `d${id}`;
    const ref = { $ref: `#/$defs/${name}` };
    const target = best.key;
    const replace = (n: JsonObject): JsonObject | undefined => (JSON.stringify(n) === target ? ref : undefined);
    root = rewrite(root, replace);
    for (const [k, def] of Object.entries(defs)) defs[k] = rewrite(def, replace);
    defs[name] = best.node;
  }

  return Object.keys(defs).length > 0 ? { ...root, $defs: defs } : root;
}

export interface ManifestTool {
  name: string;
  description: string;
  inputSchema: JsonObject;
}

/**
 * Slim a whole tool list. An option that several tools take with the same
 * schema and wording (the scrape options on scrape, crawl, batch, monitor...)
 * is documented on the first tool that lists it; later tools keep its name,
 * types, bounds and enum values and drop the repeated prose, and their
 * description says where the prose lives.
 */
export function slimManifest(tools: readonly ManifestTool[], budget: Budget = DEFAULT_BUDGET): ManifestTool[] {
  const documented = new Map<string, string>();

  return tools.map((tool) => {
    const trimmed = trim(tool.inputSchema, budget, 0) as JsonObject;
    const properties = trimmed['properties'];
    const sources = new Set<string>();
    let dropped = 0;

    if (isObject(properties)) {
      for (const [name, schema] of Object.entries(properties)) {
        const full = JSON.stringify(schema);
        const bare = stripDescriptions(schema);
        const prose = full.length - JSON.stringify(bare).length;
        if (prose < MIN_PROSE) continue;
        const key = `${name}:${full}`;
        const owner = documented.get(key);
        if (owner === undefined) {
          documented.set(key, tool.name);
        } else {
          properties[name] = bare;
          sources.add(owner);
          dropped += prose;
        }
      }
    }

    const description = briefTool(tool.description, budget.tool);
    const pointer = dropped >= POINTER_PROSE ? ` Option notes: ${[...sources].join(', ')}.` : '';
    return { name: tool.name, description: description + pointer, inputSchema: hoistShared(trimmed) };
  });
}
