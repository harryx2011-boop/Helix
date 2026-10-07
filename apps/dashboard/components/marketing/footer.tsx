import Link from 'next/link';
import { Logo } from '@/components/shell/logo';
import { GithubMark } from '@/components/marketing/github-mark';
import { AsciiHelix, GridCells } from '@/components/shared/ambient';
import { AsciiNoise } from '@/components/shared/ascii-fields';
import { cn } from '@/lib/utils';
import pkg from '@/package.json';
import { FEATURES } from '@/lib/feature-copy';
import { RELEASES_REPO, RELEASES_URL } from '@/lib/latest-release';

/** WEBSITE.md §4.9. Four groups, hairline-divided rows. */
interface FooterLink {
  label: string;
  href: string;
}

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'What it does',
    links: FEATURES.map((f) => ({ label: f.name, href: f.route })),
  },
  {
    title: 'Get it',
    links: [
      { label: 'Get the app', href: '/download' },
      { label: 'All releases', href: RELEASES_URL },
      { label: 'Status', href: '/status' },
    ],
  },
  {
    title: 'Docs',
    links: [
      { label: 'Quickstart', href: '/docs/quickstart' },
      { label: 'How It Works', href: '/docs/how-it-works' },
      { label: 'Settings and Models', href: '/docs/settings-and-models' },
      { label: 'Privacy and Data', href: '/docs/privacy-and-data' },
      { label: 'Help', href: '/docs/help' },
      { label: 'For Developers', href: '/docs' },
    ],
  },
  {
    title: 'More',
    links: [
      { label: 'Architecture', href: '/architecture' },
      { label: 'Security', href: '/self-host#security' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-m-border-faint bg-m-bg">
      <div className="mx-auto max-w-container border-x-0 sm:border-x sm:border-m-border-faint">
        <div className="relative h-12 border-y border-m-border-faint">
          <GridCells density={6} fade="none" className="absolute inset-0" />
          <span className="relative flex h-full items-center pl-4 font-mono text-[11px] uppercase tracking-wide text-m-ink/48">
            FOOTER
          </span>
        </div>

        <div className="relative grid lg:grid-cols-[1.2fr_1fr_1fr_1fr_1fr]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 hidden h-[42px] w-[71.4%] overflow-hidden lg:block [mask-image:linear-gradient(to_bottom,black_40%,transparent)]"
          >
            <AsciiNoise cols={140} rows={4} seed={61} className="absolute left-0 top-0 opacity-40" />
          </div>
          <div className="min-w-0 border-b border-m-border-faint p-8 lg:border-b-0 lg:border-r">
            <Logo className="h-10 w-auto text-m-ink/56" />
            <p className="mt-6 text-[20px] leading-tight tracking-tight text-m-ink/88">
              Reads and watches the web, on your own PC.
            </p>
            <p className="mt-3 font-mono text-[12px] text-m-ink/56">Windows · no account</p>
            <div className="mt-8 hidden min-w-0 overflow-hidden sm:block">
              <AsciiHelix orientation="horizontal" cols={44} rows={9} pitch={20} seed={21} />
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-1 sm:grid-cols-4 lg:contents">
            {COLUMNS.map((col, i) => (
              <div
                key={col.title}
                className={cn(
                  'min-w-0 border-m-border-faint',
                  i < COLUMNS.length - 1 && 'border-b sm:border-b-0 sm:border-r lg:border-b-0 lg:border-r',
                )}
              >
                <h3 className="relative px-6 py-3 font-mono text-[12px] uppercase tracking-wide text-m-ink/48">{col.title}</h3>
                <ul className="divide-y divide-m-border-faint border-t border-m-border-faint">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="block px-6 py-3 text-[14px] text-m-ink/72 transition-colors duration-150 ease-out hover:text-m-ink"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-start justify-between gap-3 border-t border-m-border-faint px-6 py-5 sm:flex-row sm:items-center">
          <p className="font-mono text-[12px] text-m-ink/56">
            © 2026 Helix ·{' '}
            <Link href="/terms" className="transition-colors duration-150 ease-out hover:text-m-ink">
              Terms
            </Link>{' '}
            ·{' '}
            <Link href="/privacy" className="transition-colors duration-150 ease-out hover:text-m-ink">
              Privacy
            </Link>
          </p>
          <Link
            href={RELEASES_URL}
            className="flex items-center gap-2 font-mono text-[12px] text-m-ink/56 transition-colors duration-150 ease-out hover:text-m-ink"
          >
            <span>[ v{pkg.version} ]</span>
            <GithubMark className="h-[14px] w-[14px]" />
            <span>{RELEASES_REPO}</span>
          </Link>
        </div>
      </div>
    </footer>
  );
}
