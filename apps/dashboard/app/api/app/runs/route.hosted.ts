import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/session';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';
import type { Endpoint, RunRow, RunStatus } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export async function GET(request: Request): Promise<NextResponse> {
  const profile = await requireProfile();
  const url = new URL(request.url);
  const endpoint = url.searchParams.get('endpoint') as Endpoint | null;
  const status = url.searchParams.get('status') as RunStatus | null;
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const cursor = url.searchParams.get('cursor');

  if (!supabaseConfigured()) {
    return NextResponse.json({ runs: [], nextCursor: null });
  }

  let query = supabaseAdmin()
    .from('runs')
    .select('*')
    .eq('profile_id', profile.id)
    .order('started_at', { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (endpoint) query = query.eq('endpoint', endpoint);
  if (status) query = query.eq('status', status);
  if (from) query = query.gte('started_at', from);
  if (to) query = query.lte('started_at', to);
  if (cursor) query = query.lt('started_at', cursor);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data as RunRow[]) ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.started_at ?? null : null;

  return NextResponse.json({ runs: page, nextCursor });
}

interface CreateRunBody {
  endpoint: Endpoint;
  status: RunStatus;
  duration_ms?: number | null;
  tier_resolved?: string | null;
  formats?: string[];
  est_provider_cost_usd?: number;
  tokens_in?: number | null;
  tokens_out?: number | null;
  provider?: string | null;
  model?: string | null;
  request?: Record<string, unknown> | null;
  response_ref?: string | null;
  failure_reason?: string | null;
  job_id?: string | null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const profile = await requireProfile();
  const body = (await request.json()) as CreateRunBody;

  if (!body.endpoint || !body.status) {
    return NextResponse.json({ error: 'invalid_request', message: 'endpoint and status are required' }, { status: 400 });
  }

  if (!supabaseConfigured()) {
    return NextResponse.json({ id: 'local', ...body }, { status: 201 });
  }

  const { data, error } = await supabaseAdmin()
    .from('runs')
    .insert({
      profile_id: profile.id,
      endpoint: body.endpoint,
      status: body.status,
      duration_ms: body.duration_ms ?? null,
      tier_resolved: body.tier_resolved ?? null,
      formats: body.formats ?? [],
      est_provider_cost_usd: body.est_provider_cost_usd ?? 0,
      tokens_in: body.tokens_in ?? null,
      tokens_out: body.tokens_out ?? null,
      provider: body.provider ?? null,
      model: body.model ?? null,
      request: body.request ?? null,
      response_ref: body.response_ref ?? null,
      failure_reason: body.failure_reason ?? null,
      job_id: body.job_id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;

  return NextResponse.json(data as RunRow, { status: 201 });
}
