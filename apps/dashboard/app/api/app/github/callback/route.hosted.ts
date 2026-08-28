import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireProfile } from '@/lib/session';
import { exchangeCode, fetchViewer, saveConnection, stateMatches } from '@/lib/github';
import { supabaseConfigured } from '@/lib/supabase/server';
import { STATE_COOKIE } from '../connect/route.hosted';

export const dynamic = 'force-dynamic';

/** Back to the tab the user started from, with a result to render. */
function settings(request: Request, params: Record<string, string>): NextResponse {
  const url = new URL('/app/settings', new URL(request.url).origin);
  url.searchParams.set('tab', 'integrations');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const profile = await requireProfile();
  const url = new URL(request.url);
  const jar = await cookies();

  /* The cookie is cleared on EVERY path out of here, success or not: a state
     that survives its flow is one a later callback can present back. */
  const expected = jar.get(STATE_COOKIE)?.value ?? '';
  jar.delete({ name: STATE_COOKIE, path: '/api/app/github' });

  const error = url.searchParams.get('error');
  if (error) return settings(request, { github: 'error', reason: error });

  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  /* Binds this callback to the flow this server started. Without it, a code
     from anywhere could be walked into the user's session. */
  if (!code || !expected || !stateMatches(expected, state)) {
    return settings(request, { github: 'error', reason: 'state' });
  }
  if (!supabaseConfigured()) {
    return settings(request, { github: 'error', reason: 'not_configured' });
  }

  try {
    const redirectUri = new URL('/api/app/github/callback', url.origin).toString();
    const granted = await exchangeCode(code, redirectUri);
    const viewer = await fetchViewer(granted.token);
    await saveConnection({
      profileId: profile.id,
      login: viewer.login,
      githubUserId: viewer.id,
      avatarUrl: viewer.avatarUrl,
      token: granted.token,
      refresh: granted.refresh,
      expiresIn: granted.expiresIn,
      scopes: granted.scopes,
    });
    return settings(request, { github: 'connected' });
  } catch {
    /* The reason is deliberately not echoed: it can carry provider text, and
       this lands in a URL the browser keeps in history. */
    return settings(request, { github: 'error', reason: 'exchange' });
  }
}
