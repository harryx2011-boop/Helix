import { auth } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfigured } from '@/lib/supabase/server';
import { ensureProfileForCurrentUser, resolveDashboardApiKey } from '@/lib/profiles';
import { HelixClient, HelixApiError } from '@/lib/api';
import type { ProviderName, SaveProviderRequest } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Trailing slash stripped: DEPLOY.md documents the value without one, and a pasted URL that carries one yields `//v1`, which some proxies 404. */
function apiBaseUrl(): string {
  return `${(process.env.HELIX_HOSTED_API_URL ?? 'http://localhost:7400').replace(/\/$/, '')}/v1`;
}

const PROVIDERS: ProviderName[] = ['anthropic', 'openai', 'gemini', 'openrouter', 'ollama', 'vllm', 'openai-compatible'];

function isProviderName(value: string | null): value is ProviderName {
  return value !== null && (PROVIDERS as string[]).includes(value);
}

/** Mirrors keys/route.ts's `failed()`, adapted for a Helix API call rather than a Supabase one. */
function failed(op: string, err: unknown): NextResponse {
  if (err instanceof HelixApiError) {
    console.error(`[providers] ${op} failed`, { status: err.status, message: err.message });
    return NextResponse.json({ error: 'upstream_error', message: err.message }, { status: err.status || 502 });
  }
  console.error(`[providers] ${op} failed`, err);
  // Provider keys live in the API's own database, so an API that is not running
  // is the single most likely cause here — and "could not reach" alone sends
  // people looking at their credentials instead of at the service.
  return NextResponse.json(
    {
      error: 'proxy_error',
      message: `No answer from the Helix API at ${apiBaseUrl().replace(/\/v1$/, '')}. Model providers are stored there, so it needs to be running before a key can be saved.`,
    },
    { status: 502 },
  );
}

/** Every handler needs the same three things before it can call the instance on the user's behalf. */
async function authorize(): Promise<{ client: HelixClient } | NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  try {
    const profile = await ensureProfileForCurrentUser();
    if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const apiKey = await resolveDashboardApiKey(profile);
    return { client: new HelixClient({ apiKey, baseUrl: apiBaseUrl() }) };
  } catch (err) {
    console.error('[providers] key resolution failed', err);
    return NextResponse.json({ error: 'key_store_error', message: 'Could not reach the key store.' }, { status: 502 });
  }
}

/**
 * `?provider=` + `?models=1` rather than a `[provider]`/`models` segment tree —
 * see keys/route.ts DELETE for why a dynamic segment here trips Vercel's builder.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const authResult = await authorize();
  if (authResult instanceof NextResponse) return authResult;
  const { client } = authResult;

  const providerParam = req.nextUrl.searchParams.get('provider');
  const wantsModels = req.nextUrl.searchParams.get('models') === '1';

  if (wantsModels) {
    if (!isProviderName(providerParam)) return NextResponse.json({ error: 'invalid_provider' }, { status: 400 });
    try {
      return NextResponse.json(await client.listProviderModels(providerParam));
    } catch (err) {
      return failed('models', err);
    }
  }

  try {
    return NextResponse.json(await client.listProviders());
  } catch (err) {
    return failed('list', err);
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const authResult = await authorize();
  if (authResult instanceof NextResponse) return authResult;
  const { client } = authResult;

  const providerParam = req.nextUrl.searchParams.get('provider');
  if (!isProviderName(providerParam)) return NextResponse.json({ error: 'invalid_provider' }, { status: 400 });

  const body = (await req.json().catch(() => null)) as SaveProviderRequest | null;
  if (!body) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  try {
    return NextResponse.json(await client.saveProvider(providerParam, body));
  } catch (err) {
    return failed('save', err);
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const authResult = await authorize();
  if (authResult instanceof NextResponse) return authResult;
  const { client } = authResult;

  const providerParam = req.nextUrl.searchParams.get('provider');
  if (!isProviderName(providerParam)) return NextResponse.json({ error: 'invalid_provider' }, { status: 400 });

  try {
    return NextResponse.json(await client.removeProvider(providerParam));
  } catch (err) {
    return failed('remove', err);
  }
}
