import { HOSTED } from '@/lib/mode';
import { requireUserId } from '@/lib/session';
import { ApiKeyProvider } from '@/components/shell/api-key-provider';
import { ApiKeyGate } from '@/components/shell/api-key-gate';
import { AppShell } from '@/components/app/app-shell';

/**
 * One shell for both modes. Hosted adds a Clerk gate in front of it and
 * nothing else: the app holds no account data either way, so every screen
 * reads from the instance the browser is pointed at, keyed from localStorage.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (HOSTED) await requireUserId();

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
