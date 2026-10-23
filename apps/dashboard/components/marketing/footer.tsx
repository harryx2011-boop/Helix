import Link from 'next/link';
import { Logo } from '@/components/shell/logo';
import { GithubMark } from '@/components/marketing/github-mark';
import { AsciiHelix, GridCells } from '@/components/shared/ambient';
import { AsciiNoise } from '@/components/shared/ascii-fields';
import { cn } from '@/lib/utils';
import pkg from '@/package.json';
import { GITHUB_REPO, GITHUB_URL } from '@/lib/github-stars';

/** WEBSITE.md §4.9. Three groups, hairline-divided rows, no Company column. */
interface FooterLink {
  label: string;
  href: string;
}

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Capabilities',
    links: [
      { label: 'Web Scraping API', href: '/scrape' },
      { label: 'Document Parsing API', href: '/parse' },
      { label: 'Web Search API', href: '/search' },
      { label: 'Web Crawling API', href: '/crawl' },
      { label: 'Site Map', href: '/map' },
      { label: 'Metadata API', href: '/metadata' },
      { label: 'Field Enrichment', href: '/enrich' },
      { label: 'Batch Scraping', href: '/batch' },
      { label: 'Agent Schemas', href: '/agent' },
      { label: 'Browser Interaction', href: '/interact' },
      { label: 'Web Monitoring', href: '/monitor' },
    ],
  },
  {
    title: 'Tools',
    links: [
      { label: 'Get the app', href: '/download' },
      { label: 'Canvas', href: '/canvas' },
    ],
  },
  {
    title: 'Documentation',
    links: [
      { label: 'Getting Started', href: '/docs' },
      { label: 'API Reference', href: '/docs/api-reference' },
      { label: 'Self-Host Guide', href: '/self-host' },
      { label: 'SDKs', href: '/docs/sdks' },
      { label: 'MCP · CLI · Skills', href: '/docs/agents' },
    ],
  },
  {
    title: 'Project',
    links: [
      { label: 'GitHub', href: GITHUB_URL },
      { label: 'Licence (Apache-2.0)', href: `${GITHUB_URL}/blob/main/LICENSE` },
      { label: 'Architecture', href: '/architecture' },
      { label: 'Roadmap', href: '/architecture#roadmap' },
      { label: 'Security', href: '/self-host#security' },
      { label: 'Status', href: '/status' },
    ],
  },
  // A link is dropped rather than rendered href-less when its URL is blanked,
  // which is how a self-host build removes a sibling app it does not run.
].map((column) => ({ ...column, links: column.links.filter((l) => l.href) }));

export function Footer() {
  return (
    <footer className="border-t border-m-border-faint bg-m-bg">
      <div className="mx-auto max-w-container border-x-0 sm:border-x sm:border-m-border-faint">
        <div className="relative h-12 border-y border-m-border-faint">
          <GridCells density={6} fade="none" className="absolute inset-0" />
          <span className="relative flex h-full items-center pl-4 font-mono text-[11px] uppercase tracking-wide text-m-ink/60">
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
            <Logo className="h-10 w-auto text-m-ink/64" />
            <p className="mt-6 text-[20px] leading-tight tracking-tight text-m-ink/88">
              A frontier utility hub you run yourself.
            </p>
            <p className="mt-3 font-mono text-[12px] text-m-ink/64">
              Apache-2.0 · self-hosted · bring your own keys
            </p>
            <div className="mt-8 hidden min-w-0 overflow-hidden sm:block">
              <AsciiHelix orientation="horizontal" cols={44} rows={9} pitch={20} seed={21} />
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-1 sm:grid-cols-3 lg:contents">
            {COLUMNS.map((col, i) => (
              <div
                key={col.title}
                className={cn(
                  'min-w-0 border-m-border-faint',
                  i < COLUMNS.length - 1 && 'border-b sm:border-b-0 sm:border-r lg:border-b-0 lg:border-r',
                )}
              >
                <h3 className="relative px-6 py-3 font-mono text-[12px] uppercase tracking-wide text-m-ink/60">{col.title}</h3>
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
          <p className="font-mono text-[12px] text-m-ink/64">
            Helix ·{' '}
            <Link href="/privacy" className="transition-colors duration-150 ease-out hover:text-m-ink">
              Privacy
            </Link>{' '}
            ·{' '}
            <Link href="/terms" className="transition-colors duration-150 ease-out hover:text-m-ink">
              Terms
            </Link>{' '}
            ·{' '}
            <a
              href="mailto:harryx2011@gmail.com"
              className="transition-colors duration-150 ease-out hover:text-m-ink"
            >
              harryx2011@gmail.com
            </a>
          </p>
          <Link
            href={GITHUB_URL}
            className="flex items-center gap-2 font-mono text-[12px] text-m-ink/64 transition-colors duration-150 ease-out hover:text-m-ink"
          >
            <span>[ v{pkg.version} ]</span>
            <GithubMark className="h-[14px] w-[14px]" />
            <span>{GITHUB_REPO}</span>
          </Link>
        </div>
      </div>
    </footer>
  );
}
