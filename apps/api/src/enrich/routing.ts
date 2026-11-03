
export const EXTRACTOR_PHASES = ['metadata', 'structural', 'model'] as const;

export type ExtractorPhase = (typeof EXTRACTOR_PHASES)[number];

export interface FieldSpec {
  name: string;
  description?: string | undefined;
  type: 'string' | 'number' | 'boolean';
}

export interface PhaseHit {
  value: string | number | boolean;
  citation: string;
  sourceUrl: string;
  phase: ExtractorPhase;
  locator: string;
}

export interface PageEvidence {
  url: string;
  text: string;
  title?: string | undefined;
  html?: string | undefined;
}

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

function jsonLdScalar(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.length > 0 ? jsonLdScalar(value[0]) : undefined;
  if (value && typeof value === 'object') {
    const named = (value as Record<string, unknown>)['name'];
    if (typeof named === 'string') return named;
  }
  return undefined;
}

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
