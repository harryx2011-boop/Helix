import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { Providers } from '@/components/shell/providers';
import { SITE_URL } from '@/lib/mode';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Helix - A frontier utility hub, completely open source.', template: '%s · Helix' },
  applicationName: 'Helix',
  description: 'A frontier utility hub, completely open source. Scrape, parse, convert, search, crawl, interact and monitor with your own keys.',
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
