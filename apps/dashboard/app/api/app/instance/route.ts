import { auth } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfigured } from '@/lib/supabase/server';
import { ensureProfileForCurrentUser, resolveDashboardApiKey } from '@/lib/profiles';
import { HelixClient, HelixApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

function apiBaseUrl(): string {
  return `${(process.env.HELIX_HOSTED_API_URL ?? 'http://localhost:7400').replace(/\/$/, '')}/v1`;
}

const JOB_ID = /^[A-Za-z0-9_-]{1,64}$/;

function failed(op: string, err: unknown): NextResponse {
  if (err instanceof HelixApiError) {
    console.error(`[instance] ${op} failed`, { status: err.status, message: err.message });
    return NextResponse.json({ error: 'upstream_error', message: err.message }, { status: err.status || 502 });
  }
  console.error(`[instance] ${op} failed`, err);
  return NextResponse.json({ error: 'proxy_error', message: 'Could not reach the Helix API.' }, { status: 502 });
}

/**
 * Read-only lookups the command palette makes on the signed-in user's behalf:
 * the monitor list and a job by id. Same shape as providers/route.ts, and a
 * `?resource=` switch rather than segments for the reason keys/route.ts gives.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  let client: HelixClient;
  try {
    const profile = await ensureProfileForCurrentUser();
    if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    client = new HelixClient({ apiKey: await resolveDashboardApiKey(profile), baseUrl: apiBaseUrl() });
  } catch (err) {
    console.error('[instance] key resolution failed', err);
    return NextResponse.json({ error: 'key_store_error', message: 'Could not reach the key store.' }, { status: 502 });
  }

  const resource = req.nextUrl.searchParams.get('resource');
  if (resource === 'monitors') {
    try {
      return NextResponse.json(await client.listMonitors());
    } catch (err) {
      return failed('list monitors', err);
    }
  }
  if (resource === 'job') {
    const id = req.nextUrl.searchParams.get('id');
    if (!id || !JOB_ID.test(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
    try {
      return NextResponse.json(await client.job(id));
    } catch (err) {
      return failed('get job', err);
    }
  }
  return NextResponse.json({ error: 'invalid_resource' }, { status: 400 });
}
