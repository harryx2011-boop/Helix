import { checkUrl } from '../core/url-guard.js';

/**
 * Source guardrails: what may become evidence for an enriched field.
 *
 * Enrichment is search-driven, so the candidate set is whatever a SERP returned
 * for a sparse identifier. That set reliably contains registrar parking pages,
 * "coming soon" placeholders and social profiles, none of which carry the facts
 * being asked for but all of which read as plausible prose to a model. Rejecting
 * them here is cheaper than un-inventing a value later, and it is the difference
 * between "no data" and a confident wrong answer.
 *
 * Every rejection names a reason, because the reason travels to the caller when
 * a field ends up null.
 */

export const SOURCE_REJECTIONS = [
  'parked_domain',
  'placeholder_page',
  'blocklisted_social',
  'below_content_floor',
  'unsafe_url',
  'unreadable',
] as const;

export type SourceRejection = (typeof SOURCE_REJECTIONS)[number];

export interface SourceVerdict {
  ok: boolean;
  reason?: SourceRejection | undefined;
  detail?: string | undefined;
}

const OK: SourceVerdict = { ok: true };

/**
 * Minimum characters of extracted text before a page counts as having said
 * anything. A real about/team/pricing page clears this several times over; a
 * placeholder rarely reaches it even counting its own boilerplate.
 */
export const CONTENT_FLOOR_CHARS = 300;

/**
 * Length above which the phrase-based parked and placeholder tests stop
 * applying. Those tests match short marketing phrases that a long, genuine page
 * may quote in passing; a real parking page is a few hundred characters of
 * nothing. Without this bound, "coming soon" in a product roadmap would discard
 * the roadmap.
 */
const SHORT_PAGE_CHARS = 2_000;

/**
 * Hosts whose pages are mostly interstitial, login-walled or infinite-scroll
 * chrome. They do carry facts, but the fraction that survives extraction is
 * noise, and a citation into one cannot be re-verified by a caller who is not
 * logged in.
 */
const SOCIAL_BLOCKLIST = [
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'pinterest.com',
  'reddit.com',
  'quora.com',
  'threads.net',
  'snapchat.com',
  'vk.com',
  'weibo.com',
];

/** Registrar and hosting parking services, matched on the host serving the page. */
const PARKING_HOSTS = [
  'sedoparking.com',
  'parkingcrew.net',
  'bodis.com',
  'afternic.com',
  'dan.com',
  'undeveloped.com',
  'hugedomains.com',
  'domainmarket.com',
  'buydomains.com',
  'parklogic.com',
  'cashparking.com',
];

/**
 * Phrases identifying a parked or for-sale domain, matched against a lowercased,
 * whitespace-collapsed body so markup and line wrapping cannot hide them.
 */
const PARKED_PHRASES = [
  'this domain is for sale',
  'this domain name is for sale',
  'buy this domain',
  'the domain is parked',
  'this domain is parked',
  'parked domain',
  'domain for sale',
  'inquire about this domain',
  'related searches',
];

/** Phrases identifying a site that exists but has not launched, or a default server page. */
const PLACEHOLDER_PHRASES = [
  'coming soon',
  'under construction',
  'launching soon',
  'site is being built',
  'website is under development',
  'this site is temporarily unavailable',
  'default web page',
  'if you are the site owner',
  'welcome to nginx',
  'apache2 ubuntu default page',
  'index of /',
  'account suspended',
];

function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return undefined;
  }
}

/** True when `host` is the blocked domain or a subdomain of it. */
function matchesHost(host: string, blocked: string): boolean {
  return host === blocked || host.endsWith(`.${blocked}`);
}

export function isBlocklistedSocial(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return SOCIAL_BLOCKLIST.some((blocked) => matchesHost(host, blocked));
}

export function isParkedPage(url: string, text: string): boolean {
  const host = hostOf(url);
  if (host && PARKING_HOSTS.some((parked) => matchesHost(host, parked))) return true;
  const body = normalise(text);
  if (body.length > SHORT_PAGE_CHARS) return false;
  return PARKED_PHRASES.some((phrase) => body.includes(phrase));
}

export function isPlaceholderPage(text: string): boolean {
  const body = normalise(text);
  if (body.length > SHORT_PAGE_CHARS) return false;
  return PLACEHOLDER_PHRASES.some((phrase) => body.includes(phrase));
}

export interface SourceCandidate {
  url: string;
  text: string;
}

/**
 * Whether one fetched page may become evidence.
 *
 * Order is most-specific-first where reasons overlap: a parked page is also
 * below the content floor, and "parked" is the more useful reason to hand back.
 */
export function screenSource(candidate: SourceCandidate): SourceVerdict {
  if (isBlocklistedSocial(candidate.url)) {
    return {
      ok: false,
      reason: 'blocklisted_social',
      detail: `${hostOf(candidate.url) ?? candidate.url} is on the social blocklist`,
    };
  }
  if (isParkedPage(candidate.url, candidate.text)) {
    return { ok: false, reason: 'parked_domain', detail: 'the page is a parked or for-sale domain' };
  }
  if (isPlaceholderPage(candidate.text)) {
    return { ok: false, reason: 'placeholder_page', detail: 'the page is a placeholder or default server page' };
  }
  const length = candidate.text.trim().length;
  if (length < CONTENT_FLOOR_CHARS) {
    return {
      ok: false,
      reason: 'below_content_floor',
      detail: `the page carries ${length} characters, below the ${CONTENT_FLOOR_CHARS} needed to count as evidence`,
    };
  }
  return OK;
}

/**
 * URL validation for a source before it is fetched.
 *
 * `checkUrl` is the same SSRF guard the scrape pipeline uses. Enrichment reaches
 * this path with URLs a search backend chose rather than URLs a caller typed, so
 * the guard applies with more force here, not less.
 */
export async function screenUrl(url: string): Promise<SourceVerdict> {
  // The blocklist is a URL-level decision and belongs before the fetch, not
  // after it. Screening it only on fetched content means a blocklisted page is
  // requested anyway, and - since these hosts serve an interstitial to a
  // non-browser client - it is then rejected for whatever the interstitial
  // looked like, reporting a reason that is true but not the actual one.
  if (isBlocklistedSocial(url)) {
    return {
      ok: false,
      reason: 'blocklisted_social',
      detail: `${new URL(url).hostname.replace(/^www\./, '')} is on the social blocklist`,
    };
  }
  const verdict = await checkUrl(url);
  if (!verdict.ok) return { ok: false, reason: 'unsafe_url', detail: verdict.reason };
  return OK;
}

/** Canonical form for dedupe: host lowercased, tracking params and fragment dropped, trailing slash normalised. */
export function canonicaliseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = '';
    url.hostname = url.hostname.replace(/^www\./, '').toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$)/i.test(key)) url.searchParams.delete(key);
    }
    const path = url.pathname.replace(/\/+$/, '');
    url.pathname = path === '' ? '/' : path;
    return url.toString();
  } catch {
    return raw;
  }
}

/** Drops repeat URLs, keeping first-seen order. */
export function dedupeByUrl<T extends { url: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = canonicaliseUrl(item.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
