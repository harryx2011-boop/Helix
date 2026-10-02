import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { Providers } from '@/components/shell/providers';
import { SITE_URL } from '@/lib/mode';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Helix: read and watch the web from your own PC', template: '%s · Helix' },
  applicationName: 'Helix',
  description: 'Helix reads pages and documents, searches the web, follows links across a whole site and tells you when something changes. It runs on your Windows PC.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
