import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireProfile } from '@/lib/session';
import { authorizeUrl, newState, githubConfigured } from '@/lib/github';

export const dynamic = 'force-dynamic';

/** The `state` cookie. Short-lived: a value that outlives its flow is one that
    can be presented back later. */
export const STATE_COOKIE = 'helix_gh_state';
const STATE_TTL_S = 600;

function redirectUri(request: Request): string {
  /* Built from the request's own origin rather than a configured base URL, so
     the value sent to GitHub always matches the host the user is actually on
     — a mismatch is what GitHub rejects the callback for. */
  return new URL('/api/app/github/callback', new URL(request.url).origin).toString();
}

export async function GET(request: Request) {
  /* Establishes the session before anything is minted: an unauthenticated
     caller must not be able to set a state cookie at all. */
  await requireProfile();
  if (!githubConfigured()) {
    return NextResponse.json(
      { error: 'not_configured', message: 'GitHub is not configured on this instance.' },
      { status: 400 },
    );
  }

  const state = newState();
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: new URL(request.url).protocol === 'https:',
    path: '/api/app/github',
    maxAge: STATE_TTL_S,
  });

  return NextResponse.redirect(authorizeUrl(state, redirectUri(request)));
}
