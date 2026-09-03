import { auth } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfigured } from '@/lib/supabase/server';
import { ensureProfileForCurrentUser, createApiKey, listApiKeys } from '@/lib/profiles';
import { parseAnswers, saveAnswers } from '@/lib/onboarding';

/**
 * Saves the wizard's answers and mints the first key.
 *
 * A `route.hosted.ts` here would break Vercel's builder (the same trap the
 * keys route documents), so this is a plain `route.ts` that answers 503 when
 * Supabase is absent — which is also what a self-host build gets, since it
 * ships no Clerk and never calls this.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const profile = await ensureProfileForCurrentUser();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const answers = parseAnswers(await req.json().catch(() => null));
  const updated = await saveAnswers(profile.id, answers, { complete: true });

  // "Get Started" lands on /app with a key already there (WEBSITE.md §7.2).
  // Only when the account has none: re-running onboarding from Preferences
  // must not mint a second key every time it is saved.
  let mintedKey: string | null = null;
  const existing = await listApiKeys(profile.id);
  if (existing.every((k) => k.revoked_at !== null)) {
    const { key } = await createApiKey({ profileId: profile.id, name: 'Default' });
    mintedKey = key;
  }

  return NextResponse.json({
    onboardingCompletedAt: updated.onboarding_completed_at,
    selectedEndpoints: updated.selected_endpoints,
    key: mintedKey,
  });
}
