'use client';

import { HelixClient, HelixApiError } from '@/lib/api';
import type {
  DiffRequest,
  DiffResponse,
  PdfAssessRequest,
  PdfAssessResponse,
  RobotsCheckRequest,
  RobotsCheckResponse,
  ScrapeResponse,
} from '@/lib/api';
import { HOSTED } from '@/lib/mode';

/**
 * These endpoints ship and are tested, but none is in `lib/endpoints.ts` —
 * that union is the playground's tab list, and adding them there would force
 * cases into its dispatcher and put them in its tabs. So they take the path
 * `lib/agent.ts` already takes: a call to `/api/app/run` by string literal,
 * which resolves the signed-in user's key server-side. See `shouldUseProxy`
 * for when this is used over a direct call.
 */
async function viaProxy<T>(endpoint: string, body: Record<string, unknown> | FormData): Promise<T> {
  const isFormData = body instanceof FormData;
  const response = await fetch(`/api/app/run?endpoint=${endpoint}`, {
    method: 'POST',
    ...(isFormData
      ? { body }
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const json = (await response.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!response.ok) {
    throw new HelixApiError(json?.message ?? `Request failed with status ${response.status}`, response.status);
  }
  return json as T;
}

function requireClient(apiKey: string | null): HelixClient {
  if (!apiKey) throw new HelixApiError('No API key configured.', 401);
  return new HelixClient({ apiKey });
}

/**
 * Unlike the Agent panel, Checks is a public page: a visitor may hold their own
 * key with no Clerk session, and a hosted build still serves self-host
 * operators. So a browser-held key wins wherever there is one, and the proxy —
 * which needs a signed-in user to resolve a key server-side — is the fallback.
 */
function shouldUseProxy(apiKey: string | null): boolean {
  return HOSTED && !apiKey;
}

export async function runRobotsCheck(request: RobotsCheckRequest, apiKey: string | null): Promise<RobotsCheckResponse> {
  if (shouldUseProxy(apiKey)) return viaProxy<RobotsCheckResponse>('robots-check', request as unknown as Record<string, unknown>);
  return requireClient(apiKey).robotsCheck(request);
}

export async function runDiff(request: DiffRequest, apiKey: string | null): Promise<DiffResponse> {
  if (shouldUseProxy(apiKey)) return viaProxy<DiffResponse>('diff', request as unknown as Record<string, unknown>);
  return requireClient(apiKey).diff(request);
}

export async function runPdfAssess(request: PdfAssessRequest | FormData, apiKey: string | null): Promise<PdfAssessResponse> {
  if (shouldUseProxy(apiKey)) {
    return viaProxy<PdfAssessResponse>('pdf-assess', request instanceof FormData ? request : (request as unknown as Record<string, unknown>));
  }
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
  const response = shouldUseProxy(apiKey)
    ? await viaProxy<ScrapeResponse>('scrape', body)
    : await requireClient(apiKey).scrape(body as never);
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
