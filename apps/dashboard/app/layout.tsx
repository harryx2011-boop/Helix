import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/shell/theme-provider';
import { ApiKeyProvider } from '@/components/shell/api-key-provider';
import { ApiKeyGate } from '@/components/shell/api-key-gate';
import { TopNav } from '@/components/shell/top-nav';

export const metadata: Metadata = {
  title: 'Helix',
  description: 'Self-hosted web-data API — operator dashboard.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="flex h-screen flex-col overflow-hidden">
        <ThemeProvider>
          <ApiKeyProvider>
            <ApiKeyGate>
              <TopNav />
              <main className="flex-1 overflow-hidden">{children}</main>
            </ApiKeyGate>
          </ApiKeyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
