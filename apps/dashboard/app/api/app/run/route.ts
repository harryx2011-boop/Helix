import { auth } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfigured } from '@/lib/supabase/server';
import { ensureProfileForCurrentUser, resolveDashboardApiKey } from '@/lib/profiles';
import type { Endpoint } from '@/lib/endpoints';
import type { EndpointMode } from '@/lib/run-endpoint';

export const dynamic = 'force-dynamic';

const ENDPOINTS: Endpoint[] = ['scrape', 'parse', 'metadata', 'convert', 'map', 'search', 'crawl', 'interact', 'monitor'];

/** The agent panel's schema step isn't a playground tab, but it is the same "forward to the instance with the user's key" shape as the rest, so it rides the same route rather than earning its own. */
type ProxyEndpoint = Endpoint | 'agent-schema';

function isProxyEndpoint(value: string | null): value is ProxyEndpoint {
  return value !== null && ((ENDPOINTS as string[]).includes(value) || value === 'agent-schema');
}

/** Where each playground tab lands on the instance; `metadata` forks on `mode` rather than getting its own entry. */
function upstreamPath(endpoint: ProxyEndpoint, mode: EndpointMode): string {
  if (endpoint === 'agent-schema') return '/agent/schema';
  if (endpoint === 'metadata') return mode === 'scrub' ? '/metadata/scrub' : '/metadata';
  return `/${endpoint}`;
}

function apiBaseUrl(): string {
  return (process.env.HELIX_HOSTED_API_URL ?? 'http://localhost:7400').replace(/\/$/, '') + '/v1';
}

/**
 * Proxies one playground run. Not `HelixClient`, deliberately: metadata scrub
 * answers with file bytes and a header the browser needs verbatim, and a typed
 * client that parses JSON has nowhere to put raw bytes. Every other endpoint
 * happens to want the same "forward body, forward response" treatment, so one
 * fetch does all eight rather than special-casing scrub alone.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const endpointParam = req.nextUrl.searchParams.get('endpoint');
  if (!isProxyEndpoint(endpointParam)) return NextResponse.json({ error: 'invalid_endpoint' }, { status: 400 });
  const modeParam = req.nextUrl.searchParams.get('mode');
  const mode: EndpointMode = modeParam === 'scrub' ? 'scrub' : 'scan';

  let apiKey: string;
  try {
    const profile = await ensureProfileForCurrentUser();
    if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    apiKey = await resolveDashboardApiKey(profile);
  } catch (err) {
    console.error('[run] key resolution failed', err);
    return NextResponse.json({ error: 'key_store_error', message: 'Could not reach the key store.' }, { status: 502 });
  }

  const contentType = req.headers.get('content-type') ?? '';
  const isFormData = contentType.includes('multipart/form-data');

  let upstream: Response;
  try {
    upstream = await fetch(`${apiBaseUrl()}${upstreamPath(endpointParam, mode)}`, {
      method: 'POST',
      headers: isFormData
        ? { Authorization: `Bearer ${apiKey}` }
        : { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: isFormData ? await req.formData() : await req.text(),
    });
  } catch (err) {
    console.error('[run] upstream request failed', err);
    const message = err instanceof Error ? err.message : 'Network request failed';
    return NextResponse.json({ error: 'proxy_error', message }, { status: 502 });
  }

  // Scan/JSON endpoints answer with a typed envelope the browser already parses;
  // scrub and convert answer with file bytes (scrub with a report header too),
  // and get forwarded byte-for-byte instead of round-tripped through JSON.
  if (endpointParam === 'metadata' && mode === 'scrub' && upstream.ok) {
    const headers = new Headers();
    for (const name of ['content-type', 'content-disposition', 'x-helix-metadata-report', 'x-helix-metadata-removed', 'x-helix-metadata-retained']) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  }
  if (endpointParam === 'convert' && upstream.ok && !upstream.headers.get('content-type')?.includes('application/json')) {
    const headers = new Headers();
    for (const name of ['content-type', 'content-disposition', 'x-helix-convert-pages', 'x-helix-convert-page']) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  }

  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
