import { checkUrl } from '../core/url-guard.js';


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

export const CONTENT_FLOOR_CHARS = 300;

const SHORT_PAGE_CHARS = 2_000;

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

export async function screenUrl(url: string): Promise<SourceVerdict> {
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
