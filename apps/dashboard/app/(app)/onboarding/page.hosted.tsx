import { redirect } from 'next/navigation';
import { requireUserId } from '@/lib/session';
import { ensureProfileForCurrentUser } from '@/lib/profiles';
import { answersFromProfile, EMPTY_ANSWERS } from '@/lib/onboarding';
import { OnboardingClient } from './onboarding-client';

/**
 * Hosted only, hence `.hosted.tsx`: self-host has no accounts and nothing to
 * ask, so the file is invisible to that build's `pageExtensions`.
 *
 * A profile whose onboarding is already stamped is sent to the app rather than
 * asked twice; Settings → Preferences is where answers get re-edited.
 */
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  await requireUserId();

  const profile = await ensureProfileForCurrentUser();
  if (profile?.onboarding_completed_at) redirect('/app');

  return (
    <div className="dark" data-surface="app">
      <div className="min-h-svh bg-background text-foreground">
        <OnboardingClient initial={profile ? answersFromProfile(profile) : EMPTY_ANSWERS} />
      </div>
    </div>
  );
}
