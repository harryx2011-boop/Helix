import { redirect } from 'next/navigation';
import { HOSTED } from '@/lib/mode';
import { requireUserId } from '@/lib/session';
import { readOnboardingState } from '@/lib/onboarding-gate';
import { vulcanEnabled } from '@/lib/vulcan/gate';
import { ApiKeyProvider } from '@/components/shell/api-key-provider';
import { ApiKeyGate } from '@/components/shell/api-key-gate';
import { AppShell } from '@/components/app/app-shell';

/**
 * One shell for both modes, and they authenticate differently.
 *
 * Self-host has no accounts, so the browser holds an instance key in
 * localStorage and `ApiKeyGate` blocks the app until one is pasted.
 * Hosted has Clerk, and mounting that gate there asked a signed-in user to
 * paste a key they had not minted yet — before onboarding had even run. So
 * hosted mounts no provider at all, which is what `useOptionalApiKey` already
 * documented; callers that run in both modes read null there.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let selectedEndpoints: readonly string[] = [];
  let localTools = false;

  if (HOSTED) {
    await requireUserId();
    const onboarding = await readOnboardingState();
    if (onboarding.pending) redirect('/onboarding');
    selectedEndpoints = onboarding.selectedEndpoints;
    localTools = await vulcanEnabled();
  }

  const shell = (
    <AppShell selectedEndpoints={selectedEndpoints} localTools={localTools}>
      {children}
    </AppShell>
  );

  return (
    <div className="dark" data-surface="app">
      {HOSTED ? (
        shell
      ) : (
        <ApiKeyProvider>
          <ApiKeyGate>{shell}</ApiKeyGate>
        </ApiKeyProvider>
      )}
    </div>
  );
}
