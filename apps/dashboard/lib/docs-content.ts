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
    purpose: 'Read one URL and return it as markdown, HTML, JSON, a screenshot or links. Works identically for web pages and documents.',
    whenToUse: 'Reach for Scrape whenever you already have the URL. Use Search when you only have a query, Crawl when you need a whole site, and Interact when the page needs clicks or typing before it can be read.',
    responseShape: '`{ success, data: { markdown, html, json, screenshot, links, metadata }, warnings }` on success, or `{ success: false, failure: { reason, detail, tier, tiersAttempted, escalationAvailable } }`.',
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
    purpose: 'Watch one URL on a cron schedule and get a word, line or character diff when it changes. Unchanged checks store no snapshot and send nothing; `sensitivity: significant` ignores timestamps and tracking noise, and keyword triggers narrow it further without a model call.',
    whenToUse: 'Reach for Monitor when you need to know about future changes, not the current state. For a one-time read, use Scrape. For many pages at once, create one monitor per URL; a monitor watches a single page.',
    responseShape: 'Create: `{ success, id, monitorId, status, nextCheckAt, schedule, stats }` (201). History: `GET /v1/monitor/{id}/history` returns `{ entries: [{ checkedAt, changed, reason, diff, snapshotUrl }], next }`. Webhooks post `{ event, monitorId, url, checkedAt, changed, diff, snapshot, previousSnapshot }` signed with `Helix-Signature`.',
    failureReasons: ['blocked', 'challenge', 'timeout', 'dns', 'tls', 'http_error', 'empty', 'robots_denied', 'service_unavailable'],
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
