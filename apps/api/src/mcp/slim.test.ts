import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { brief, briefTool, hoistShared, slimManifest } from './slim.js';
import { loadSpec, type JsonObject } from './spec.js';
import { generateTools } from './tools.js';

const SURFACE = JSON.parse(
  readFileSync(new URL('./tool-surface.json', import.meta.url), 'utf8'),
) as Record<string, { properties: string[]; required: string[] }>;

const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

/* The tools an agent sees: the ones in tool-surface.json, in spec order. */
const core = generateTools(loadSpec()).filter((t) => t.name in SURFACE);
const slim = slimManifest(core);

function expandRefs(node: unknown, defs: JsonObject): unknown {
  if (Array.isArray(node)) return node.map((n) => expandRefs(n, defs));
  if (!isObject(node)) return node;
  const ref = node['$ref'];
  if (typeof ref === 'string') return expandRefs(defs[ref.replace('#/$defs/', '')], defs);
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, expandRefs(v, defs)]));
}

/* What a call can contain: everything but prose and the spellings slim.ts normalises. */
function skeleton(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(skeleton);
  if (!isObject(node)) return node;
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'description' && typeof value === 'string') continue;
    if (key === 'discriminator' || (key === 'additionalProperties' && value === true)) continue;
    if (key === 'default' && value === false) continue;
    if (key === 'properties' && isObject(value)) {
      out[key] = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, skeleton(v)]));
    } else {
      out[key] = key === 'enum' || key === 'default' || key === 'required' ? value : skeleton(value);
    }
  }
  const members = out['allOf'];
  if (Array.isArray(members) && members.length === 1) {
    const { allOf: _drop, ...rest } = out;
    void _drop;
    return { ...(members[0] as JsonObject), ...rest };
  }
  return out;
}

describe('slimManifest', () => {
  it('stays under the size cap for the agent-facing tools', () => {
    expect(slim.length).toBe(Object.keys(SURFACE).length);
    expect(JSON.stringify({ tools: slim }).length).toBeLessThan(37_000);
  });

  it('keeps every tool and the argument names and required list it had before', () => {
    for (const tool of slim) {
      const want = SURFACE[tool.name]!;
      const schema = tool.inputSchema;
      expect(Object.keys(schema['properties'] as object).sort(), tool.name).toEqual(want.properties);
      expect([...((schema['required'] as string[] | undefined) ?? [])].sort(), tool.name).toEqual(want.required);
    }
  });

  it('keeps every type, bound and enum value, nested ones included', () => {
    for (const [i, tool] of slim.entries()) {
      const schema = tool.inputSchema;
      const defs = (schema['$defs'] ?? {}) as JsonObject;
      const { $defs: _drop, ...body } = schema;
      void _drop;
      expect(skeleton(expandRefs(body, defs)), tool.name).toEqual(skeleton(core[i]!.inputSchema));
    }
  });

  it('keeps an option repeated across tools fully described once', () => {
    const props = (name: string): JsonObject =>
      slim.find((t) => t.name === name)!.inputSchema['properties'] as JsonObject;
    const crawl = props('helix_crawl');
    const bare = Object.keys(props('helix_scrape')).filter(
      (k) => k in crawl && JSON.stringify(props('helix_scrape')[k]).includes('"description"') && !JSON.stringify(crawl[k]).includes('"description"'),
    );
    expect(bare.length).toBeGreaterThan(0);
    expect(slim.find((t) => t.name === 'helix_crawl')!.description).toContain('helix_scrape');
  });

  it('leaves a lone description untouched when it already fits', () => {
    const [only] = slimManifest([
      { name: 't', description: 'Short.', inputSchema: { type: 'object', properties: { a: { type: 'string', description: 'Fits.' } } } },
    ]);
    expect(only).toEqual({
      name: 't',
      description: 'Short',
      inputSchema: { type: 'object', properties: { a: { type: 'string', description: 'Fits.' } } },
    });
  });
});

describe('brief', () => {
  it('keeps whole sentences and never ends mid-thought', () => {
    expect(brief('One. Two is a bit longer. Three.', 20)).toBe('One.');
    expect(brief('When the flag is set, every delivery is signed with a secret key.', 20)).toBe('');
    expect(brief('Globs over the pathname, e.g. `/blog/*`. Only these are crawled.', 50)).toBe(
      'Globs over the pathname, e.g. `/blog/*`.',
    );
  });

  it('splits at a semicolon and keeps the first clause', () => {
    expect(brief('A bare URL subscribes to every event; the object form adds headers and filters.', 40)).toBe(
      'A bare URL subscribes to every event.',
    );
  });

  it('keeps the summary and one lead sentence of a tool and drops Returns', () => {
    expect(briefTool('Crawl a site\n\nReads pages. More detail follows here.\n\nReturns: Job.', 40)).toBe(
      'Crawl a site. Reads pages.',
    );
  });
});

describe('hoistShared', () => {
  it('writes a repeated object once and refers to it', () => {
    const shared = { type: 'object', properties: { schema: { type: 'object' }, prompt: { type: 'string', maxLength: 4000 } } };
    const out = hoistShared({ type: 'object', properties: { a: shared, b: shared, c: { type: 'string' } } });
    expect(out['$defs']).toEqual({ d1: shared });
    expect((out['properties'] as JsonObject)['a']).toEqual({ $ref: '#/$defs/d1' });
    expect((out['properties'] as JsonObject)['c']).toEqual({ type: 'string' });
  });

  it('does not turn a `properties` map into a reference', () => {
    const props = { x: { type: 'string', enum: ['aaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbb', 'cccccccccccccccccccc'] } };
    const out = hoistShared({ type: 'object', properties: { a: { type: 'object', properties: props }, b: { type: 'array', items: { type: 'object', properties: props } } } });
    const body = JSON.stringify(out);
    expect(body).not.toContain('"properties":{"$ref"');
  });
});
