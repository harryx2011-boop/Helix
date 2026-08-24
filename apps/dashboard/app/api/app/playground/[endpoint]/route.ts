import { NextResponse } from 'next/server';
import { requireProfile } from '@/lib/session';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';
import { byteaToBuffer, listApiKeys } from '@/lib/profiles';
import { decryptApiKey } from '@/lib/keys';
import { HOSTED_API_URL } from '@/lib/mode';
import { endpointById } from '@/lib/catalog';
import type { Endpoint, RunStatus } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

/** Resolves the profile's default (first non-revoked) key, decrypted. Self-host falls back to a bootstrap key. */
async function resolveApiKey(profileId: string): Promise<string> {
  if (!supabaseConfigured()) return process.env.HELIX_BOOTSTRAP_KEY ?? '';
  const keys = await listApiKeys(profileId);
  const active = keys.find((k) => !k.revoked_at);
  if (!active) return process.env.HELIX_BOOTSTRAP_KEY ?? '';
  return decryptApiKey(byteaToBuffer(active.key_ciphertext), byteaToBuffer(active.key_iv));
}

interface UpstreamMeta {
  tier?: string;
  tiersAttempted?: string[];
}

function extractTier(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const data = (body as { data?: { metadata?: UpstreamMeta } }).data;
  return data?.metadata?.tier ?? null;
}

function extractUsage(body: unknown): { costUsd: number; tokensIn: number | null; tokensOut: number | null } {
  if (!body || typeof body !== 'object') return { costUsd: 0, tokensIn: null, tokensOut: null };
  const usage = (body as { usage?: { providerCost?: { amount?: number }; tokens?: { input?: number; output?: number } } }).usage;
  return {
    costUsd: usage?.providerCost?.amount ?? 0,
    tokensIn: usage?.tokens?.input ?? null,
    tokensOut: usage?.tokens?.output ?? null,
  };
}

function extractFailureReason(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const failure = (body as { failure?: { reason?: string } }).failure;
  return failure?.reason ?? null;
}

function extractJobId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const id = (body as { id?: string }).id;
  return typeof id === 'string' ? id : null;
}

async function recordRun(input: {
  profileId: string;
  endpoint: Endpoint;
  status: RunStatus;
  durationMs: number;
  tierResolved: string | null;
  formats: string[];
  estProviderCostUsd: number;
  tokensIn: number | null;
  tokensOut: number | null;
  request: Record<string, unknown> | null;
  failureReason: string | null;
  jobId: string | null;
}): Promise<void> {
  if (!supabaseConfigured()) return;
  await supabaseAdmin()
    .from('runs')
    .insert({
      profile_id: input.profileId,
      endpoint: input.endpoint,
      status: input.status,
      duration_ms: input.durationMs,
      tier_resolved: input.tierResolved,
      formats: input.formats,
      est_provider_cost_usd: input.estProviderCostUsd,
      tokens_in: input.tokensIn,
      tokens_out: input.tokensOut,
      request: input.request,
      failure_reason: input.failureReason,
      job_id: input.jobId,
    })
    .then(({ error }) => {
      if (error) throw error;
    });
}

export async function POST(request: Request, { params }: { params: Promise<{ endpoint: string }> }): Promise<NextResponse> {
  const profile = await requireProfile();
  const { endpoint: endpointParam } = await params;
  const def = endpointById(endpointParam);

  if (!def) {
    return NextResponse.json({ success: false, failure: { reason: 'unsupported_type', message: 'Unknown endpoint.' } }, { status: 400 });
  }

  if (def.status === 'coming') {
    return NextResponse.json(
      { success: false, failure: { reason: 'coming', message: 'This endpoint is not available yet.' } },
      { status: 501 },
    );
  }

  const contentType = request.headers.get('content-type') ?? '';
  const isMultipart = contentType.includes('multipart/form-data');
  const bodyForRequest: Record<string, unknown> | null = isMultipart ? null : ((await request.json()) as Record<string, unknown>);
  const formats = Array.isArray(bodyForRequest?.['formats']) ? (bodyForRequest?.['formats'] as string[]) : [];

  const apiKey = await resolveApiKey(profile.id);
  const upstreamUrl = `${HOSTED_API_URL}${def.path}`;

  const started = Date.now();
  let upstreamResponse: Response;
  try {
    if (isMultipart) {
      const formData = await request.formData();
      upstreamResponse = await fetch(upstreamUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });
    } else {
      upstreamResponse = await fetch(upstreamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(bodyForRequest),
      });
    }
  } catch (error) {
    const durationMs = Date.now() - started;
    await recordRun({
      profileId: profile.id,
      endpoint: def.id,
      status: 'failure',
      durationMs,
      tierResolved: null,
      formats,
      estProviderCostUsd: 0,
      tokensIn: null,
      tokensOut: null,
      request: bodyForRequest,
      failureReason: 'service_unavailable',
      jobId: null,
    }).catch(() => undefined);
    return NextResponse.json(
      {
        success: false,
        failure: {
          reason: 'service_unavailable',
          detail: error instanceof Error ? error.message : 'Upstream request failed.',
        },
      },
      { status: 502 },
    );
  }

  const durationMs = Date.now() - started;
  const upstreamBody = await upstreamResponse.json().catch(() => ({ success: false }));
  const success = Boolean((upstreamBody as { success?: boolean }).success) && upstreamResponse.ok;

  await recordRun({
    profileId: profile.id,
    endpoint: def.id,
    status: success ? 'success' : upstreamResponse.status === 202 ? 'running' : 'failure',
    durationMs,
    tierResolved: extractTier(upstreamBody),
    formats,
    estProviderCostUsd: extractUsage(upstreamBody).costUsd,
    tokensIn: extractUsage(upstreamBody).tokensIn,
    tokensOut: extractUsage(upstreamBody).tokensOut,
    request: bodyForRequest,
    failureReason: extractFailureReason(upstreamBody),
    jobId: extractJobId(upstreamBody),
  }).catch(() => undefined);

  return NextResponse.json(upstreamBody, { status: upstreamResponse.status });
}
