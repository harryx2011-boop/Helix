import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { themeInitScript } from '@/lib/theme';
import { SiteHeader } from '@/components/site/header';
import { SiteFooter } from '@/components/site/footer';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:4400';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Converter API', template: '%s · Converter API' },
  applicationName: 'Converter API',
  description:
    'Convert, compress and edit video, audio and images up to 5 GB, in the browser or over a REST API. Runs on your own machine. Part of Helix.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-p-bg font-sans text-p-ink antialiased">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
