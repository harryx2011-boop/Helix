import { getPool } from '../db/pool.js';
import { siteOf } from './url.js';

/**
 * Per-site crawl memory.
 *
 * Lets a scheduled re-crawl skip pages that have not changed. The saving is
 * real: on a documentation site most pages are static between crawls, and
 * re-fetching all of them to discover that is the bulk of the cost.
 *
 * Three signals, in descending order of trust:
 *
 * 1. **ETag** — the server's own assertion that content is identical.
 * 2. **Last-Modified** — a date the server chose. Usually honest.
 * 3. **Content hash** — ours, computed after extraction. Always available, but
 *    only knowable after fetching, so it saves re-processing rather than the
 *    request itself.
 *
 * Sitemap `<lastmod>` is deliberately absent from that list. It is frequently
 * stale or fabricated, so it may prioritise work but must never be the sole
 * evidence a page is unchanged.
 */

export interface CrawlStateRecord {
  url: string;
  contentHash: string | null;
  etag: string | null;
  lastModified: Date | null;
  statusCode: number | null;
  lastSeenAt: Date;
  unchangedStreak: number;
}

interface StateRow {
  url: string;
  content_hash: string | null;
  etag: string | null;
  last_modified: Date | null;
  status_code: number | null;
  last_seen_at: Date;
  unchanged_streak: number;
}

const toRecord = (row: StateRow): CrawlStateRecord => ({
  url: row.url,
  contentHash: row.content_hash,
  etag: row.etag,
  lastModified: row.last_modified,
  statusCode: row.status_code,
  lastSeenAt: row.last_seen_at,
  unchangedStreak: row.unchanged_streak,
});

/** Everything known about a set of URLs from previous crawls. */
export async function loadState(urls: string[]): Promise<Map<string, CrawlStateRecord>> {
  if (urls.length === 0) return new Map();

  const { rows } = await getPool().query<StateRow>(
    `SELECT url, content_hash, etag, last_modified, status_code, last_seen_at, unchanged_streak
       FROM crawl_state
      WHERE url = ANY($1)`,
    [urls],
  );

  return new Map(rows.map((row) => [row.url, toRecord(row)]));
}

export async function loadStateForSite(site: string): Promise<Map<string, CrawlStateRecord>> {
  const { rows } = await getPool().query<StateRow>(
    `SELECT url, content_hash, etag, last_modified, status_code, last_seen_at, unchanged_streak
       FROM crawl_state
      WHERE site = $1`,
    [site],
  );

  return new Map(rows.map((row) => [row.url, toRecord(row)]));
}

export interface RecordVisitInput {
  url: string;
  contentHash: string;
  etag?: string | undefined;
  lastModified?: string | undefined;
  statusCode?: number | undefined;
  /** Whether the content matched what was stored. */
  unchanged: boolean;
}

export async function recordVisit(input: RecordVisitInput): Promise<void> {
  const site = siteOf(input.url);
  if (!site) return;

  let lastModified: Date | null = null;
  if (input.lastModified) {
    const parsed = new Date(input.lastModified);
    if (!Number.isNaN(parsed.getTime())) lastModified = parsed;
  }

  await getPool().query(
    `INSERT INTO crawl_state
       (site, url, content_hash, etag, last_modified, status_code, last_seen_at, unchanged_streak)
     VALUES ($1, $2, $3, $4, $5, $6, now(), $7)
     ON CONFLICT (url) DO UPDATE SET
       content_hash     = EXCLUDED.content_hash,
       etag             = EXCLUDED.etag,
       last_modified    = EXCLUDED.last_modified,
       status_code      = EXCLUDED.status_code,
       last_seen_at     = now(),
       -- A run of unchanged visits is what a future scheduler would use to
       -- back off from a page that never moves.
       unchanged_streak = CASE
         WHEN $7 = 0 THEN 0
         ELSE crawl_state.unchanged_streak + 1
       END`,
    [
      site,
      input.url,
      input.contentHash,
      input.etag ?? null,
      lastModified,
      input.statusCode ?? null,
      input.unchanged ? 1 : 0,
    ],
  );
}

/**
 * Conditional-request headers for a URL we have seen before.
 *
 * This is the only mechanism that avoids the download itself: the server
 * answers 304 and sends no body. Everything else saves processing, not bandwidth.
 */
export function conditionalHeaders(
  state: CrawlStateRecord | undefined,
): Record<string, string> | undefined {
  if (!state) return undefined;

  const headers: Record<string, string> = {};
  if (state.etag) headers['if-none-match'] = state.etag;
  if (state.lastModified) headers['if-modified-since'] = state.lastModified.toUTCString();

  return Object.keys(headers).length > 0 ? headers : undefined;
}

/** Whether extracted content matches what was stored. */
export function isUnchanged(
  state: CrawlStateRecord | undefined,
  contentHash: string,
): boolean {
  return state?.contentHash === contentHash;
}
