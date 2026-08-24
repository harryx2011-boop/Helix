import type { Endpoint } from './supabase/types';
import type { FailureReason } from './api';
import { endpointById, EXAMPLE_REQUEST, ENDPOINTS } from './catalog';
import { generateCode } from './codegen';

export interface EndpointDocs {
  id: Endpoint;
  purpose: string;
  whenToUse: string;
  responseShape: string;
  failureReasons: FailureReason[];
}

const ALL_FAILURE_REASONS: FailureReason[] = [
  'blocked',
  'challenge',
  'timeout',
  'dns',
  'tls',
  'http_error',
  'empty',
  'robots_denied',
  'unsupported_type',
  'service_unavailable',
];

/**
 * Purpose / when-to-use / response-shape / failure reasons per endpoint — the
 * single source for both `/docs/[slug]` and the generated SKILL.md (WEBSITE.md
 * §9.3), so the two surfaces cannot drift from each other.
 */
export const ENDPOINT_DOCS: Partial<Record<Endpoint, EndpointDocs>> = {
  scrape: {
    id: 'scrape',
    purpose: 'Read one URL and return it as markdown, sanitised or raw HTML, text, links, a screenshot, schema-shaped JSON or citation-ready chunks. One request, any combination of formats.',
    whenToUse: 'Reach for Scrape whenever you already have the URL. Use Search when you only have a query, Crawl when you need a whole site, Parse when the input is a file you are uploading, and Interact when the page needs clicks or typing across several calls before it can be read. For `json`, send a JSON Schema in `jsonOptions` and optionally pick `provider` and `model` per request; the key must already be configured on the instance. `proxy` takes `auto`, `stealth`, `none` or your own `{ url }`; `mobile: true` renders the phone layout.',
    responseShape: '`{ success: true, data: { markdown, html, rawHtml, text, links, screenshot, json, chunks, metadata }, warnings, usage }` where only requested formats are present, `warnings` is always an array, and `usage` (model, tokens, blocks kept) appears only when a model ran. A format that failed after the page was read comes back `null` with a warning naming it. Otherwise `{ success: false, failure: { reason, detail, statusCode, detectedBy, tier, tiersAttempted, profile, escalationAvailable }, warnings }` inside a 200; a 400 means the request itself was wrong (`invalid_request`, `invalid_schema`, `proxy_unavailable`).',
    failureReasons: ALL_FAILURE_REASONS,
  },
  parse: {
    id: 'parse',
    purpose: 'Convert an uploaded or linked document — PDF, DOCX, PPTX, XLSX — into the same markdown-or-JSON envelope Scrape returns for web pages.',
    whenToUse: 'Reach for Parse when the input is a file rather than a live page. If the file is reachable at a URL, Scrape on that URL returns the same shape — Parse exists for the multipart-upload path and explicit OCR control.',
    responseShape: '`{ success, data: { markdown, json, metadata: { filename, pageCount, fileType, ocrUsed } } }`.',
    failureReasons: ['unsupported_type', 'timeout', 'empty', 'service_unavailable'],
  },
  search: {
    id: 'search',
    purpose: 'Search the web and read every result in the same call, instead of searching then scraping each URL yourself.',
    whenToUse: 'Reach for Search when you have a query, not a URL. Once you have the URL you want, a direct Scrape call is cheaper for that one page.',
    responseShape: '`{ success, data: { web: [{ url, title, description, markdown, metadata }] } }`. Partial failures return the results that succeeded with a `warnings` array.',
    failureReasons: ['timeout', 'service_unavailable', 'empty'],
  },
  crawl: {
    id: 'crawl',
    purpose: 'Discover and read every page under a starting URL, with depth, page-count and path controls. Asynchronous — returns a job you poll.',
    whenToUse: 'Reach for Crawl when you need many pages from one site and do not have their URLs ahead of time. For a known, bounded set of URLs, `/batch/scrape` (planned) is cheaper. For a single page, use Scrape.',
    responseShape: 'Start: `{ success, jobId, url }`. Poll `GET /v1/crawl/{jobId}`: `{ status, total, completed, data: [...] }`, `status` one of `scraping | completed | failed | cancelled`.',
    failureReasons: ['robots_denied', 'timeout', 'service_unavailable'],
  },
  interact: {
    id: 'interact',
    purpose: 'Drive a stateful browser session: click, type, scroll, wait, screenshot, run JavaScript, then extract — across multiple calls against the same live page.',
    whenToUse: 'Reach for Interact when reading the page requires acting on it first — a login wall, a search box, an infinite-scroll feed. If the page is readable without interaction, Scrape with `actions` handles a single one-shot sequence more cheaply.',
    responseShape: '`{ success, sessionId, output, screenshot, liveViewUrl, interactiveLiveViewUrl, sessionOpen }`.',
    failureReasons: ['timeout', 'blocked', 'challenge', 'service_unavailable'],
  },
  monitor: {
    id: 'monitor',
    purpose: 'Watch a URL on a schedule and get a diff — word, line and character level — the moment it changes. Unchanged checks store a snapshot but trigger nothing.',
    whenToUse: 'Reach for Monitor when you need to know about future changes, not the current state. For a one-time read, use Scrape.',
    responseShape: 'Create: `{ success, monitorId, status, nextCheckAt }`. History: `{ checkedAt, changed, diff, snapshotUrl }[]`.',
    failureReasons: ['timeout', 'service_unavailable', 'empty'],
  },
};

/** Sections offered by the docs index and the SKILL.md generator (WEBSITE.md §9.3). */
export function docsEndpointList() {
  return ENDPOINTS.filter((e) => e.product);
}

/** curl example for an endpoint, used by both `/docs/[slug]` and SKILL.md. */
export function docsCurlExample(id: Endpoint, apiKey?: string): string {
  const body = EXAMPLE_REQUEST[id];
  return generateCode('curl', { endpoint: id, body, ...(apiKey ? { apiKey } : {}) });
}

export function docsEndpointOrThrow(id: string) {
  const def = endpointById(id);
  const docs = ENDPOINT_DOCS[id as Endpoint];
  if (!def || !docs) return undefined;
  return { def, docs };
}
