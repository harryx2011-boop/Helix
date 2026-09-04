import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin, supabaseConfigured } from '@/lib/supabase/server';
import { ensureProfileForCurrentUser, listApiKeys } from '@/lib/profiles';
import { EMPTY_ANSWERS, saveAnswers } from '@/lib/onboarding';

/**
 * The destructive account actions.
 *
 * Three rules hold for every branch below, and they are the reason this is one
 * route rather than four:
 *
 * 1. The profile is re-derived from the Clerk session inside the handler. No
 *    branch reads an id from the request, so there is no id to tamper with.
 * 2. The typed confirmation is checked HERE. The dialog in the browser is a
 *    speed bump; a client-side-only guard is bypassed by one fetch call, so
 *    the phrase has to reach the server and be compared against what the
 *    server expects for that action.
 * 3. Order follows the foreign keys, and every step that can partially fail
 *    says what it leaves behind.
 */
export const dynamic = 'force-dynamic';

/**
 * What the user must type, per action. Server-side and exact: the client reads
 * these from the same map via GET so the two can never drift into a state where
 * the dialog accepts a phrase the server rejects.
 */
const CONFIRMATIONS = {
  revoke_keys: 'revoke all keys',
  clear_providers: 'clear credentials',
  reset_onboarding: 'reset onboarding',
  delete_account: 'delete my account',
} as const;

type DangerAction = keyof typeof CONFIRMATIONS;

function isAction(value: unknown): value is DangerAction {
  return typeof value === 'string' && value in CONFIRMATIONS;
}

type Postgrestish = { code?: string; message?: string; details?: string; hint?: string };

function failed(op: string, err: unknown): NextResponse {
  const e = (err ?? {}) as Postgrestish;
  console.error(`[account:danger] ${op} failed`, {
    code: e.code,
    message: e.message ?? String(err),
    details: e.details,
    hint: e.hint,
  });

  if (e.code && ['42P01', '42501', '28P01', '3D000'].includes(e.code)) {
    return NextResponse.json(
      { error: 'key_store_unavailable', message: 'The account store rejected the request.' },
      { status: 503 },
    );
  }

  return NextResponse.json({ error: 'key_store_error', message: 'Could not reach the account store.' }, { status: 502 });
}

/** The phrases, so the dialog asks for exactly what the server will accept. */
export async function GET(): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ confirmations: CONFIRMATIONS });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { action?: unknown; confirm?: unknown } | null;
  if (!isAction(body?.action)) return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  const action = body.action;

  // The gate. Compared case-insensitively on a trimmed value because the
  // phrase is typed by a human, but never skipped: a request without it is
  // refused whatever the browser did or did not show.
  const typed = typeof body?.confirm === 'string' ? body.confirm.trim().toLowerCase() : '';
  if (typed !== CONFIRMATIONS[action]) {
    return NextResponse.json(
      { error: 'confirmation_required', message: `Type "${CONFIRMATIONS[action]}" to confirm.` },
      { status: 400 },
    );
  }

  const profile = await ensureProfileForCurrentUser().catch((err: unknown) => {
    console.error('[account:danger] profile lookup failed', err);
    return null;
  });
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = supabaseAdmin();

  switch (action) {
    /**
     * Revokes every user-visible key. The dashboard key is deliberately spared:
     * it is what the /api/app/* proxies authenticate with, so revoking it
     * breaks the playground, provider settings and this page itself with no
     * path back, and `resolveDashboardApiKey` would mint a replacement on the
     * next request anyway.
     */
    case 'revoke_keys': {
      try {
        const query = admin
          .from('api_keys')
          .update({ revoked_at: new Date().toISOString() })
          .eq('profile_id', profile.id)
          .is('revoked_at', null);

        const { data, error } = await (profile.dashboard_key_id
          ? query.neq('id', profile.dashboard_key_id)
          : query
        ).select('id');
        if (error) throw error;

        return NextResponse.json({ ok: true, revoked: data?.length ?? 0 });
      } catch (err) {
        return failed('revoke_keys', err);
      }
    }

    /**
     * Drops the BYOK provider credentials. `provider_keys` is keyed on
     * `api_key_id`, not on a profile, so the delete is scoped to the ids this
     * profile owns rather than to the profile — including the dashboard key,
     * which is the one the hosted providers panel actually stores against.
     *
     * Partial failure: the delete is one statement over an id list, so it
     * either removes every matching row or none. A profile with no keys has
     * nothing to delete and reports zero rather than an error.
     */
    case 'clear_providers': {
      try {
        const owned = await listApiKeys(profile.id);
        const ids = owned.map((k) => k.id);
        if (profile.dashboard_key_id) ids.push(profile.dashboard_key_id);
        if (ids.length === 0) return NextResponse.json({ ok: true, cleared: 0 });

        const { data, error } = await admin.from('provider_keys').delete().in('api_key_id', ids).select('provider');
        if (error) throw error;

        return NextResponse.json({ ok: true, cleared: data?.length ?? 0 });
      } catch (err) {
        return failed('clear_providers', err);
      }
    }

    /**
     * Clears the answers and the completion stamp. Clearing the stamp is the
     * point: `lib/onboarding-gate.ts` reads it, so the next /app navigation
     * sends the user back through the wizard. The keys are untouched, so
     * re-running it will not mint a second one.
     */
    case 'reset_onboarding': {
      try {
        await saveAnswers(profile.id, EMPTY_ANSWERS, { complete: false });
        const { error } = await admin
          .from('profiles')
          .update({ onboarding_completed_at: null })
          .eq('id', profile.id);
        if (error) throw error;

        return NextResponse.json({ ok: true });
      } catch (err) {
        return failed('reset_onboarding', err);
      }
    }

    /**
     * Deletes the account.
     *
     * ORDER, and why it is this order:
     *
     * `profiles.dashboard_key_id` references `api_keys` ON DELETE SET NULL,
     * and `api_keys.profile_id` references `profiles` ON DELETE CASCADE. That
     * is a cycle, so the two cannot be deleted in either order without one
     * step being a no-op or an error. Deleting the PROFILE is what resolves it:
     * the cascade takes every `api_keys` row owned by it, and `provider_keys`
     * (on api_key_id), `jobs`, and `monitors` (both on api_key_id) cascade
     * from those in turn. Deleting the keys first would instead null out
     * `dashboard_key_id` and leave the profile behind.
     *
     * Clerk goes LAST. If Clerk succeeded first and the database delete then
     * failed, the identity would be gone while the profile, its keys and its
     * stored provider credentials stayed live and reachable by any key already
     * issued — an orphaned, un-deletable account. This way round the worst case
     * is the reverse and much weaker: rows gone, Clerk user still present. That
     * user signs back in, `ensureProfileForCurrentUser` creates a fresh empty
     * profile, and they land in onboarding. Recoverable, and it says so.
     */
    case 'delete_account': {
      let deletedRows = false;
      try {
        const { error } = await admin.from('profiles').delete().eq('id', profile.id);
        if (error) throw error;
        deletedRows = true;
      } catch (err) {
        return failed('delete_account:rows', err);
      }

      try {
        const clerk = await clerkClient();
        await clerk.users.deleteUser(userId);
      } catch (err) {
        // The rows are already gone and cannot be put back, so this is not a
        // rollback — it is a report. The session still exists; signing out and
        // in again produces a new empty profile rather than a broken one.
        console.error('[account:danger] clerk user delete failed after rows were removed', {
          userId,
          message: err instanceof Error ? err.message : String(err),
        });
        return NextResponse.json(
          {
            error: 'partial_delete',
            message:
              'Your data was deleted, but the sign-in identity could not be removed. Sign out, then contact support to finish removing it.',
            rowsDeleted: deletedRows,
          },
          { status: 502 },
        );
      }

      return NextResponse.json({ ok: true, rowsDeleted: deletedRows });
    }
  }
}
