import { HOSTED } from '@/lib/mode';
import { requireOnboardedProfile } from '@/lib/session';
import { listApiKeys } from '@/lib/profiles';
import { maskApiKey } from '@/lib/keys';
import { AppSessionProvider } from '@/components/app/session-provider';
import { ApiKeyProvider } from '@/components/shell/api-key-provider';
import { ApiKeyGate } from '@/components/shell/api-key-gate';
import { AppShell } from '@/components/app/app-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (HOSTED) {
    const profile = await requireOnboardedProfile();
    const keys = await listApiKeys(profile.id);
    const defaultKey = keys.find((k) => !k.revoked_at) ?? keys[0];
    const defaultKeyMasked = defaultKey ? maskApiKey(defaultKey.prefix, defaultKey.last3) : null;

    return (
      <div className="dark" data-surface="app">
        <AppSessionProvider profile={profile} defaultKeyMasked={defaultKeyMasked}>
          <AppShell selectedEndpoints={profile.selected_endpoints}>{children}</AppShell>
        </AppSessionProvider>
      </div>
    );
  }

  return (
    <div className="dark" data-surface="app">
      <ApiKeyProvider>
        <ApiKeyGate>
          <AppShell selectedEndpoints={[]}>{children}</AppShell>
        </ApiKeyGate>
      </ApiKeyProvider>
    </div>
  );
}
