import { ApiKeyProvider } from '@/components/shell/api-key-provider';
import { ApiKeyGate } from '@/components/shell/api-key-gate';
import { AppShell } from '@/components/app/app-shell';

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
