/**
 * Field routing: answer from structure before paying a model.
 *
 * A model call is the most expensive and least trustworthy way to learn
 * something the page already states in a machine-readable form. A JSON-LD
 * Organization block names the company; an og:title names the page; a mailto:
 * link names the email. Reading those costs microseconds, cannot hallucinate,
 * and yields a citation that is exact by construction.
 *
 * So each field is offered to the phases in order — metadata, then DOM
 * structure, then the model — and the model is asked only for the fields the
 * cheap phases could not fill. On a page with good structured data this is the
 * difference between one model call and none.
 *
 * The phases are not equally trustworthy and are not treated as such. A
 * structural hit is a fact read out of a named element; a model hit is a claim
 * that must then survive grounding. Both carry the phase that produced them, so
 * the difference is visible in the response rather than averaged away.
 */

export const EXTRACTOR_PHASES = ['metadata', 'structural', 'model'] as const;

export type ExtractorPhase = (typeof EXTRACTOR_PHASES)[number];

export interface FieldSpec {
  /** Field name as it appears in the caller schema and the response. */
  name: string;
  /** What is wanted, in the caller own words. Travels to the model when the cheap phases miss. */
  description?: string | undefined;
  type: 'string' | 'number' | 'boolean';
}

export interface PhaseHit {
  value: string | number | boolean;
  /** The exact text the value was read out of, used as the citation. */
  citation: string;
  sourceUrl: string;
  phase: ExtractorPhase;
  /** The element or key the value came from, named so a caller can re-read it. */
  locator: string;
}

export interface PageEvidence {
  url: string;
  /** Extracted main-content text. What the model reads and what citations are checked against. */
  text: string;
  title?: string | undefined;
  /** Raw HTML, when the pipeline was asked for it. The metadata and structural phases need it; the model phase does not. */
  html?: string | undefined;
}

/** JSON-LD blocks on the page, parsed and flattened. Invalid blocks are skipped rather than failing the page. */
export function jsonLdNodes(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const script = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(script)) {
    const raw = match[1];
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    const queue: unknown[] = [parsed];
    while (queue.length > 0) {
      const node = queue.shift();
      if (Array.isArray(node)) {
        queue.push(...node);
        continue;
      }
      if (node && typeof node === 'object') {
        const record = node as Record<string, unknown>;
        nodes.push(record);
        const graph = record['@graph'];
        if (Array.isArray(graph)) queue.push(...graph);
      }
    }
  }

  return nodes;
}

/** `<meta name|property=... content=...>` pairs, keyed lowercase. */
export function metaTags(html: string): Map<string, string> {
  const tags = new Map<string, string>();
  const meta = /<meta\s+([^>]*?)\/?>/gi;
  const attr = /([a-z0-9:_-]+)\s*=\s*["']([^"']*)["']/gi;

  for (const match of html.matchAll(meta)) {
    const body = match[1];
    if (!body) continue;
    const attrs = new Map<string, string>();
    for (const a of body.matchAll(attr)) {
      if (a[1] && a[2] !== undefined) attrs.set(a[1].toLowerCase(), a[2]);
    }
    const key = attrs.get('property') ?? attrs.get('name') ?? attrs.get('itemprop');
    const content = attrs.get('content');
    if (key && content) tags.set(key.toLowerCase(), decodeEntities(content));
  }

  return tags;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Which metadata keys and JSON-LD properties answer a given field name.
 *
 * Deliberately a small, explicit table rather than a fuzzy matcher. A wrong
 * structural hit is worse than a miss, because it skips the model phase and
 * arrives with high confidence; the cost of missing a mapping is only that the
 * model gets asked, which is the behaviour without this table at all.
 */
const FIELD_SOURCES: Record<string, { meta: string[]; jsonLd: string[] }> = {
  name: { meta: ['og:site_name', 'application-name'], jsonLd: ['name', 'legalName'] },
  companyname: { meta: ['og:site_name', 'application-name'], jsonLd: ['name', 'legalName'] },
  title: { meta: ['og:title', 'twitter:title'], jsonLd: ['headline', 'name'] },
  description: { meta: ['og:description', 'description', 'twitter:description'], jsonLd: ['description'] },
  email: { meta: [], jsonLd: ['email'] },
  telephone: { meta: [], jsonLd: ['telephone'] },
  phone: { meta: [], jsonLd: ['telephone'] },
  foundingdate: { meta: [], jsonLd: ['foundingDate'] },
  founded: { meta: [], jsonLd: ['foundingDate'] },
  logo: { meta: ['og:image'], jsonLd: ['logo'] },
  industry: { meta: [], jsonLd: ['industry'] },
  numberofemployees: { meta: [], jsonLd: ['numberOfEmployees'] },
  employeecount: { meta: [], jsonLd: ['numberOfEmployees'] },
  author: { meta: ['author', 'article:author'], jsonLd: ['author'] },
  publisheddate: { meta: ['article:published_time'], jsonLd: ['datePublished'] },
  language: { meta: ['og:locale'], jsonLd: ['inLanguage'] },
};

function normaliseFieldKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Coerce a JSON-LD leaf to a scalar. Nested objects yield their `name`, which is how schema.org nests an Organization or Person. */
function jsonLdScalar(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.length > 0 ? jsonLdScalar(value[0]) : undefined;
  if (value && typeof value === 'object') {
    const named = (value as Record<string, unknown>)['name'];
    if (typeof named === 'string') return named;
  }
  return undefined;
}

/** Coerce a scalar to the type the field asked for, or reject it. */
function coerce(value: string | number | boolean, type: FieldSpec['type']): string | number | boolean | undefined {
  if (type === 'string') return typeof value === 'string' ? value : String(value);
  if (type === 'number') {
    const n = typeof value === 'number' ? value : Number(String(value).replace(/[,\s]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof value === 'boolean') return value;
  const text = String(value).toLowerCase();
  if (text === 'true' || text === 'yes') return true;
  if (text === 'false' || text === 'no') return false;
  return undefined;
}

/**
 * The metadata phase: `<meta>` tags and JSON-LD.
 *
 * The citation for a structural hit is the key and its value written out, not a
 * span of body text, because that is literally where the value was read from and
 * a caller re-reading the page will find it there.
 *
 * Such a hit needs no grounding check and deliberately does not get one. The
 * value was parsed out of the fetched document by this process, so there is no
 * model claim to disbelieve; a re-derivation step was written, found by mutation
 * testing to change no outcome, and removed rather than left in place reading as
 * protection it did not provide.
 */
export function runMetadataPhase(field: FieldSpec, page: PageEvidence): PhaseHit | undefined {
  if (!page.html) return undefined;
  const sources = FIELD_SOURCES[normaliseFieldKey(field.name)];
  if (!sources) return undefined;

  const tags = metaTags(page.html);
  for (const key of sources.meta) {
    const raw = tags.get(key);
    if (raw === undefined || raw.trim() === '') continue;
    const value = coerce(raw, field.type);
    if (value === undefined) continue;
    return {
      value,
      citation: `<meta ${key}> ${raw}`,
      sourceUrl: page.url,
      phase: 'metadata',
      locator: `meta[${key}]`,
    };
  }

  for (const node of jsonLdNodes(page.html)) {
    for (const key of sources.jsonLd) {
      const scalar = jsonLdScalar(node[key]);
      if (scalar === undefined || String(scalar).trim() === '') continue;
      const value = coerce(scalar, field.type);
      if (value === undefined) continue;
      const type = typeof node['@type'] === 'string' ? (node['@type'] as string) : 'Thing';
      return {
        value,
        citation: `JSON-LD ${type}.${key}: ${String(scalar)}`,
        sourceUrl: page.url,
        phase: 'metadata',
        locator: `ld+json ${type}.${key}`,
      };
    }
  }

  return undefined;
}
