import { getPool } from '../db/pool.js';
import { siteOf } from './url.js';


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

export function conditionalHeaders(
  state: CrawlStateRecord | undefined,
): Record<string, string> | undefined {
  if (!state) return undefined;

  const headers: Record<string, string> = {};
  if (state.etag) headers['if-none-match'] = state.etag;
  if (state.lastModified) headers['if-modified-since'] = state.lastModified.toUTCString();

  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function isUnchanged(
  state: CrawlStateRecord | undefined,
  contentHash: string,
): boolean {
  return state?.contentHash === contentHash;
}
