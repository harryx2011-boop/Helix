import { auth } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';
import { ensureProfileForCurrentUser, listApiKeys } from '@/lib/profiles';

/**
 * Request usage for the signed-in profile.
 *
 * Read straight from `request_usage` rather than through the instance's
 * `/v1/usage`: that endpoint scopes to the calling key by design, and the
 * proxy only ever holds the profile's single dashboard key, so it would report
 * the dashboard's own traffic and none of the user's. The dashboard and the
 * hosted API share one Postgres (0001), so the profile's keys and their usage
 * rows are both right here.
 *
 * Every number returned is a stored count. Nothing is estimated, extrapolated
 * or filled in — a window with no rows returns zeroes and an empty series, and
 * the panel says so rather than drawing a flat line that looks like data.
 */
export const dynamic = 'force-dynamic';

const MIN_HOURS = 1;
const MAX_HOURS = 24 * 90;
const DEFAULT_HOURS = 24 * 7;

interface UsageRow {
  bucket_start: string;
  endpoint: string;
  status_class: string;
  requests: number;
}

type Postgrestish = { code?: string; message?: string; details?: string; hint?: string };

function failed(op: string, err: unknown): NextResponse {
  const e = (err ?? {}) as Postgrestish;
  console.error(`[usage] ${op} failed`, {
    code: e.code,
    message: e.message ?? String(err),
    details: e.details,
    hint: e.hint,
  });

  // 42P01 specifically means 011_request_usage.sql has not been applied to this
  // database. That is an operator task, not a client error, and the panel
  // renders it as "unavailable" rather than as zero usage.
  if (e.code === '42P01') {
    return NextResponse.json(
      {
        error: 'usage_unavailable',
        message: 'Usage recording is not set up on this instance.',
      },
      { status: 503 },
    );
  }

  if (e.code && ['42501', '28P01', '3D000'].includes(e.code)) {
    return NextResponse.json(
      { error: 'usage_unavailable', message: 'The usage store rejected the request.' },
      { status: 503 },
    );
  }

  return NextResponse.json({ error: 'usage_error', message: 'Could not reach the usage store.' }, { status: 502 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const raw = req.nextUrl.searchParams.get('hours');
  const hours = raw === null ? DEFAULT_HOURS : Number(raw);
  if (!Number.isInteger(hours) || hours < MIN_HOURS || hours > MAX_HOURS) {
    return NextResponse.json(
      { error: 'invalid_request', message: `hours must be an integer between ${MIN_HOURS} and ${MAX_HOURS}` },
      { status: 400 },
    );
  }

  try {
    const profile = await ensureProfileForCurrentUser();
    if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    // Revoked keys included deliberately: their past traffic is still this
    // profile's usage, and dropping it would make the total shrink whenever a
    // key is retired.
    const keys = await listApiKeys(profile.id);
    const keyIds = keys.map((k) => k.id);
    if (profile.dashboard_key_id) keyIds.push(profile.dashboard_key_id);

    const until = new Date();
    const since = new Date(until.getTime() - hours * 60 * 60 * 1000);

    if (keyIds.length === 0) {
      return NextResponse.json({
        since: since.toISOString(),
        until: until.toISOString(),
        hours,
        total: 0,
        rateLimited: 0,
        errors: 0,
        series: [],
        byEndpoint: [],
        keys: [],
      });
    }

    // PostgREST cannot GROUP BY, so the hourly rows come back and are folded
    // here. Bounded by construction rather than by hope: hours is capped at 90
    // days, the row count is (keys x endpoints x 4 status classes x hours), and
    // the range filter is served by the (api_key_id, bucket_start) index from
    // 011. The explicit limit is the backstop.
    const { data, error } = await supabaseAdmin()
      .from('request_usage')
      .select('bucket_start, endpoint, status_class, requests')
      .in('api_key_id', keyIds)
      .gte('bucket_start', since.toISOString())
      .lt('bucket_start', until.toISOString())
      .order('bucket_start', { ascending: true })
      .limit(50_000);
    if (error) throw error;

    const rows = (data ?? []) as UsageRow[];

    const byBucket = new Map<string, number>();
    const byEndpoint = new Map<string, number>();
    let total = 0;
    let rateLimited = 0;
    let errors = 0;

    for (const row of rows) {
      const count = Number(row.requests) || 0;
      total += count;
      if (row.status_class === '429') rateLimited += count;
      if (row.status_class === '4xx' || row.status_class === '5xx') errors += count;

      const bucket = new Date(row.bucket_start).toISOString();
      byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + count);
      byEndpoint.set(row.endpoint, (byEndpoint.get(row.endpoint) ?? 0) + count);
    }

    return NextResponse.json({
      since: since.toISOString(),
      until: until.toISOString(),
      hours,
      total,
      rateLimited,
      errors,
      // Only hours that actually have rows. The chart fills the gaps, so an
      // absent hour reads as zero traffic rather than as missing data.
      series: [...byBucket.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([bucketStart, requests]) => ({ bucketStart, requests })),
      byEndpoint: [...byEndpoint.entries()]
        .sort(([, a], [, b]) => b - a)
        .map(([endpoint, requests]) => ({ endpoint, requests })),
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.key_prefix,
        rateLimit: k.rate_limit,
        createdAt: k.created_at,
        lastUsedAt: k.last_used_at,
        revokedAt: k.revoked_at,
      })),
    });
  } catch (err) {
    return failed('read', err);
  }
}
