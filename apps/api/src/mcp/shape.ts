import type { JsonObject } from './spec.js';


const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

const OPAQUE = new Set(['json', 'schema', 'jsonSources']);

const DIAGNOSTICS = new Set(['tier', 'tiersAttempted', 'escalations', 'timingMs', 'extractor', 'engine', 'contentHash', 'sourceUrl']);

const SHAPED = new Set([
  'helix_scrape', 'helix_search', 'helix_map', 'helix_crawl', 'helix_get_crawl', 'helix_cancel_crawl',
  'helix_batch_scrape', 'helix_get_batch_scrape', 'helix_extract', 'helix_get_job',
]);

const POLLS = new Set(['helix_get_crawl', 'helix_cancel_crawl', 'helix_get_batch_scrape', 'helix_get_job']);

interface Ctx {
  formats: Set<string>;
  polling: boolean;
}

const empty = (v: unknown): boolean =>
  v === null || v === undefined || (Array.isArray(v) && v.length === 0) || (isObject(v) && Object.keys(v).length === 0);

const sameUrl = (a: unknown, b: unknown): boolean =>
  typeof a === 'string' && typeof b === 'string' && a.replace(/\/$/, '') === b.replace(/\/$/, '');

const isPage = (v: JsonObject): boolean => {
  const meta = v['metadata'];
  return typeof v['markdown'] === 'string' || (isObject(meta) && ('statusCode' in meta || 'tier' in meta));
};

function requestedFormats(args: JsonObject): Set<string> {
  const formats = new Set<string>();
  for (const source of [args, args['scrapeOptions'], args['scrape']]) {
    const list = isObject(source) ? source['formats'] : undefined;
    if (Array.isArray(list)) for (const f of list) if (typeof f === 'string') formats.add(f);
  }
  return formats;
}

function shapeMetadata(meta: JsonObject, pageUrl: unknown): JsonObject {
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(meta)) {
    if (DIAGNOSTICS.has(key) || empty(value)) continue;
    if ((key === 'mobile' || key === 'fromCache') && value === false) continue;
    if (key === 'favicon' && typeof value === 'string' && value.startsWith('data:')) continue;
    out[key] = value;
  }
  if (sameUrl(out['finalUrl'], pageUrl ?? meta['sourceUrl'])) delete out['finalUrl'];
  return out;
}

function shapePage(page: JsonObject, ctx: Ctx): JsonObject {
  const hasContent = typeof page['markdown'] === 'string';
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(page)) {
    if (OPAQUE.has(key)) {
      out[key] = value;
    } else if (key === 'metadata' && isObject(value)) {
      const meta = shapeMetadata(value, page['url']);
      if (!empty(meta)) out['metadata'] = meta;
    } else if (hasContent && key === 'text' && !ctx.formats.has('text')) {
      continue;
    } else if (hasContent && key === 'links' && !ctx.formats.has('links') && !ctx.polling) {
      continue;
    } else if (!empty(value)) {
      out[key] = value;
    }
  }
  return out;
}

function shapeRows(data: unknown, ctx: Ctx): unknown {
  if (Array.isArray(data)) return data.map((row) => (isObject(row) && isPage(row) ? shapePage(row, ctx) : row));
  return shape(data, ctx);
}

function shape(node: unknown, ctx: Ctx): unknown {
  if (Array.isArray(node)) return node.map((n) => shape(n, ctx));
  if (!isObject(node)) return node;
  if (isPage(node)) return shapePage(node, ctx);

  const out: JsonObject = {};
  for (const [key, value] of Object.entries(node)) {
    if (empty(value) || key === 'tierBreakdown') continue;
    if (key === 'jobId' && value === node['id']) continue;
    if (key === 'url' && typeof value === 'string' && typeof node['id'] === 'string' && value.startsWith('/') && value.endsWith(node['id'])) continue;
    if (OPAQUE.has(key)) out[key] = value;
    else if (key === 'data') out[key] = shapeRows(value, ctx);
    else out[key] = shape(value, ctx);
  }
  return out;
}

export interface ImageBlock {
  type: 'image';
  data: string;
  mimeType: string;
}

const DATA_IMAGE = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/;

export function pullImages(node: unknown, images: ImageBlock[]): unknown {
  if (typeof node === 'string') {
    const match = node.length > 200 ? DATA_IMAGE.exec(node) : null;
    if (!match) return node;
    images.push({ type: 'image', data: match[2]!, mimeType: match[1]! });
    return `[image ${images.length} attached]`;
  }
  if (Array.isArray(node)) return node.map((n) => pullImages(n, images));
  if (!isObject(node)) return node;
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, pullImages(v, images)]));
}

export function shapeResponse(tool: string, body: unknown, args: JsonObject): unknown {
  return SHAPED.has(tool) ? shape(body, { formats: requestedFormats(args), polling: POLLS.has(tool) }) : body;
}
