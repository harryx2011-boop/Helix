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
    purpose: 'Convert a document (PDF, DOCX, PPTX, XLSX) into markdown, and optionally into JSON against a schema or prompt, in the same envelope Scrape returns for web pages. Send the file as a multipart `file` part or point at a `url` and Helix fetches it first.',
    whenToUse: 'Reach for Parse when the input is a file: an upload from your own system, or a URL that serves a document rather than a page. Use Scrape for HTML pages (Parse refuses them with `unsupported_type` and says so). `ocr: auto` runs OCR only when the text layer is missing or garbled; `force` and `off` override that call. The same file sent twice parses once, keyed by content hash.',
    responseShape: '`{ success, data: { markdown, json, usage, metadata: { filename, pageCount, fileType, ocrUsed, needsOcr, suspectedGarbledText, parser, sizeBytes, contentHash, sourceUrl, fromCache } }, warnings }` on success. A remote fetch problem, an unsupported type or an unreachable parser is `{ success: false, failure: { reason, detail, statusCode } }`; a file over the operator\'s upload ceiling is HTTP 413. A missing `jsonOptions` with `formats: [json]` is HTTP 400.',
    failureReasons: ['unsupported_type', 'http_error', 'dns', 'tls', 'timeout', 'empty', 'service_unavailable'],
  },
  search: {
    id: 'search',
    purpose: 'Search the web and read every result in the same call, instead of searching then scraping each URL yourself. The backend is yours: a self-hosted SearXNG instance, or a Serper or SerpAPI key.',
    whenToUse: 'Reach for Search when you have a query, not a URL. Omit `scrapeOptions` to get url, title and description only; set it to read each page with the same formats Scrape offers. Once you have the URL you want, a direct Scrape call is cheaper for that one page. Narrow with `lang`, `country` and `tbs` (qdr:d, qdr:w, qdr:m, qdr:y) instead of a second request.',
    responseShape: '`{ success, data: { web: [{ url, title, description, position, markdown, metadata }] }, warnings, metadata: { backend, fromCache } }`. A result page that cannot be read keeps its row with a typed `failure` and adds a line to `warnings`; the search itself still succeeds. No backend configured is a 503 `search_unavailable`; a backend error is a 502 `search_failed`.',
    failureReasons: ['blocked', 'challenge', 'timeout', 'dns', 'tls', 'http_error', 'empty', 'service_unavailable'],
  },
  crawl: {
    id: 'crawl',
    purpose: 'Discover and read every page under a starting URL, with depth, page-count and glob path controls. Asynchronous: the call returns a job id, and pages arrive as the crawl walks the site. Pass `estimate: true` to see the projected page count before anything is fetched.',
    whenToUse: 'Reach for Crawl when you need many pages from one site and do not have their URLs ahead of time. For a single page, use Scrape. To list URLs without reading them, use Map. If you only need to know when pages change later, Monitor is the better fit once it ships.',
    responseShape: 'Start: `202 { success, id, jobId, url }` where `url` is `/v1/crawl/{jobId}`. Poll `GET /v1/crawl/{jobId}`: `{ status, total, completed, failed, data: [{ url, markdown, metadata }], next, usage }`, `status` one of `queued | running | completed | failed | cancelled`; follow `next` for the remaining pages. `DELETE /v1/crawl/{jobId}` cancels and keeps finished results. With `webhook` set, `started`, `page`, `completed` and `failed` events are POSTed with retries.',
    failureReasons: ['robots_denied', 'blocked', 'challenge', 'timeout', 'http_error', 'service_unavailable'],
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
