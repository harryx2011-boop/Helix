import { ApiKeyProvider } from '@/components/shell/api-key-provider';
import { ApiKeyGate } from '@/components/shell/api-key-gate';
import { AppShell } from '@/components/app/app-shell';

/**
 * The app has no accounts: the browser holds an instance key in localStorage
 * and `ApiKeyGate` blocks the app until one is pasted.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
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
