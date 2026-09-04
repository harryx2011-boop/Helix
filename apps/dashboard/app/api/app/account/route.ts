import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfigured } from '@/lib/supabase/server';
import { ensureProfileForCurrentUser } from '@/lib/profiles';
import { answersFromProfile, parseAnswers, saveAnswers } from '@/lib/onboarding';
import type { ProfileRow } from '@/lib/supabase/types';

/**
 * The signed-in user's own profile: identity, and the onboarding answers made
 * editable after the fact.
 *
 * The profile is derived from the Clerk session on every call and a profile id
 * in the body is never read. That is the whole authorization model here — there
 * is no "which account" parameter to get wrong, because there is no parameter.
 */
export const dynamic = 'force-dynamic';

type Postgrestish = { code?: string; message?: string; details?: string; hint?: string };

/** Mirrors keys/route.ts: an uncaught throw from lib/profiles is an opaque 500 with nothing in the log. */
function failed(op: string, err: unknown): NextResponse {
  const e = (err ?? {}) as Postgrestish;
  console.error(`[account] ${op} failed`, {
    code: e.code,
    message: e.message ?? String(err),
    details: e.details,
    hint: e.hint,
  });

  // 42P01 unknown table, 42501 RLS denial, 28P01 bad credentials, 3D000 no
  // database: the store is misconfigured, not the request. 42501 in particular
  // is what a column missing from 0007's grant list looks like from here.
  if (e.code && ['42P01', '42501', '28P01', '3D000'].includes(e.code)) {
    return NextResponse.json(
      { error: 'key_store_unavailable', message: 'The account store rejected the request.' },
      { status: 503 },
    );
  }

  return NextResponse.json({ error: 'key_store_error', message: 'Could not reach the account store.' }, { status: 502 });
}

function toAccountJson(profile: ProfileRow, clerk: { name: string | null; avatarUrl: string | null } | null) {
  return {
    // Clerk owns name and avatar; the profile row is a mirror the webhook
    // updates, so a stale mirror should not outrank the live session.
    name: clerk?.name ?? profile.name,
    avatarUrl: clerk?.avatarUrl ?? profile.avatar_url,
    email: profile.email,
    memberSince: profile.created_at,
    onboardingCompletedAt: profile.onboarding_completed_at,
    answers: answersFromProfile(profile),
  };
}

export async function GET(): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  try {
    const profile = await ensureProfileForCurrentUser();
    if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const user = await currentUser();
    return NextResponse.json(
      toAccountJson(
        profile,
        user
          ? {
              name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
              avatarUrl: user.imageUrl ?? null,
            }
          : null,
      ),
    );
  } catch (err) {
    return failed('read', err);
  }
}

/**
 * Updates the onboarding answers.
 *
 * `parseAnswers` is reused rather than reimplemented: it is the same closed
 * vocabulary the wizard posts through and the same one 0003's check
 * constraints enforce, and a second, laxer parser here would be a way to write
 * values the wizard cannot. Anything outside a vocabulary is dropped at the
 * boundary, so a junk field cannot fail an otherwise valid save.
 *
 * `complete: false` — re-editing answers must not re-stamp
 * `onboarding_completed_at`, which is what the gate reads to decide whether to
 * redirect a user back into the wizard.
 */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const body = await req.json().catch(() => null);
  if (body === null || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  try {
    const profile = await ensureProfileForCurrentUser();
    if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    // Merged onto what is stored rather than replacing it: a PATCH that names
    // only `role` must not blank out the endpoint selection that drives the
    // sidebar. An explicitly-sent empty array still clears, because it is
    // present in the body.
    const stored = answersFromProfile(profile);
    const incoming = body as Record<string, unknown>;
    const answers = parseAnswers({
      role: 'role' in incoming ? incoming.role : stored.role,
      useCases: 'useCases' in incoming ? incoming.useCases : stored.useCases,
      llmProvider: 'llmProvider' in incoming ? incoming.llmProvider : stored.llmProvider,
      deployIntent: 'deployIntent' in incoming ? incoming.deployIntent : stored.deployIntent,
      selectedEndpoints: 'selectedEndpoints' in incoming ? incoming.selectedEndpoints : stored.selectedEndpoints,
      heardFrom: 'heardFrom' in incoming ? incoming.heardFrom : stored.heardFrom,
      heardFromDetail: 'heardFromDetail' in incoming ? incoming.heardFromDetail : stored.heardFromDetail,
    });

    const updated = await saveAnswers(profile.id, answers, { complete: false });

    const user = await currentUser();
    return NextResponse.json(
      toAccountJson(
        updated,
        user
          ? {
              name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
              avatarUrl: user.imageUrl ?? null,
            }
          : null,
      ),
    );
  } catch (err) {
    return failed('update', err);
  }
}
