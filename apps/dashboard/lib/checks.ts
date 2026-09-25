'use client';

import { HelixClient, HelixApiError } from '@/lib/api';
import type {
  DiffRequest,
  DiffResponse,
  PdfAssessRequest,
  PdfAssessResponse,
  RobotsCheckRequest,
  RobotsCheckResponse,
} from '@/lib/api';
function requireClient(apiKey: string | null): HelixClient {
  if (!apiKey) throw new HelixApiError('No API key configured.', 401);
  return new HelixClient({ apiKey });
}

export async function runRobotsCheck(request: RobotsCheckRequest, apiKey: string | null): Promise<RobotsCheckResponse> {
  return requireClient(apiKey).robotsCheck(request);
}

export async function runDiff(request: DiffRequest, apiKey: string | null): Promise<DiffResponse> {
  return requireClient(apiKey).diff(request);
}

export async function runPdfAssess(request: PdfAssessRequest | FormData, apiKey: string | null): Promise<PdfAssessResponse> {
  return requireClient(apiKey).pdfAssess(request);
}

/**
 * A browser cannot fetch an arbitrary third-party page: that site's CORS
 * policy decides, and it will not name this origin. `/scrape` exists for
 * exactly this — the server fetches, the browser matches selectors against
 * what comes back.
 */
export async function fetchHtmlForSelectors(url: string, apiKey: string | null): Promise<string> {
  const body = { url, formats: ['rawHtml'] };
  const response = await requireClient(apiKey).scrape(body as never);
  if (!response.success) {
    throw new HelixApiError(response.failure.detail ?? response.failure.reason, 502);
  }
  const html = response.data.rawHtml ?? response.data.html;
  if (!html) throw new HelixApiError('That page returned no HTML to match against.', 502);
  return html;
}

export interface SelectorMatch {
  index: number;
  tagName: string;
  outerHtml: string;
  textContent: string;
}

export type SelectorKind = 'css' | 'xpath';

export interface SelectorResult {
  matches: SelectorMatch[];
  error: string | null;
}

const MAX_MATCHES = 200;
const MAX_SNIPPET = 2000;

function toMatch(element: Element, index: number): SelectorMatch {
  const outer = element.outerHTML;
  return {
    index,
    tagName: element.tagName.toLowerCase(),
    outerHtml: outer.length > MAX_SNIPPET ? `${outer.slice(0, MAX_SNIPPET)}…` : outer,
    textContent: (element.textContent ?? '').trim().replace(/\s+/g, ' '),
  };
}

/** Runs the selector in the browser against already-fetched HTML, so typing re-matches without another request. */
export function matchSelector(html: string, selector: string, kind: SelectorKind): SelectorResult {
  if (!selector.trim()) return { matches: [], error: null };
  const doc = new DOMParser().parseFromString(html, 'text/html');

  if (kind === 'css') {
    try {
      const found = Array.from(doc.querySelectorAll(selector)).slice(0, MAX_MATCHES);
      return { matches: found.map(toMatch), error: null };
    } catch {
      return { matches: [], error: 'Not a valid CSS selector.' };
    }
  }

  try {
    const evaluated = doc.evaluate(selector, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    const found: SelectorMatch[] = [];
    for (let i = 0; i < evaluated.snapshotLength && found.length < MAX_MATCHES; i += 1) {
      const node = evaluated.snapshotItem(i);
      if (node instanceof Element) found.push(toMatch(node, found.length));
    }
    return { matches: found, error: null };
  } catch {
    return { matches: [], error: 'Not a valid XPath expression.' };
  }
}

/**
 * The point of the tab: turn a working selector into the request body that
 * uses it. `ScrapeOptions` takes `includeSelectors`, which is CSS — an XPath
 * expression has nowhere to go there, so that case is reported rather than
 * emitted as a body the API would reject.
 */
export function selectorAsScrapeBody(url: string, selector: string, kind: SelectorKind): string | null {
  if (kind === 'xpath') return null;
  return JSON.stringify({ url, formats: ['markdown'], includeSelectors: [selector] }, null, 2);
}
