import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:4200';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Persona · System prompts for every role', template: '%s · Persona' },
  applicationName: 'Persona',
  description:
    'A library of role-specific system prompts with setup guides, a fill-in-the-blanks wizard and an editor that exports. Free, by Helix.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-p-bg font-sans text-p-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
