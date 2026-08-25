import Link from 'next/link';
import { Logo } from '@/components/shell/logo';

/** WEBSITE.md §4.9. Four columns, hairline-divided rows, no Company column. */
const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Capabilities',
    links: [
      { label: 'Web Scraping API', href: '/scrape' },
      { label: 'Document Parsing API', href: '/parse' },
      { label: 'Web Search API', href: '/search' },
      { label: 'Web Crawling API', href: '/crawl' },
      { label: 'Browser Interaction', href: '/interact' },
      { label: 'Web Monitoring', href: '/monitor' },
    ],
  },
  {
    title: 'Documentation',
    links: [
      { label: 'Getting started', href: '/docs' },
      { label: 'API reference', href: '/docs/api-reference' },
      { label: 'Self-host guide', href: '/self-host' },
      { label: 'SDKs', href: '/docs/sdks' },
      { label: 'MCP · CLI · Skills', href: '/docs/agents' },
    ],
  },
  {
    title: 'Project',
    links: [
      { label: 'GitHub', href: 'https://github.com/helix-dev/helix' },
      { label: 'Licence (Apache-2.0)', href: 'https://github.com/helix-dev/helix/blob/main/LICENSE' },
      { label: 'Architecture', href: '/architecture' },
      { label: 'Roadmap', href: '/architecture#roadmap' },
      { label: 'Security', href: '/self-host#security' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'Discussions', href: 'https://github.com/helix-dev/helix/discussions' },
      { label: 'X', href: 'https://x.com/helixdev' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-m-border-faint bg-m-bg px-4 pt-16">
      <div className="mx-auto grid max-w-container grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="font-mono text-[12px] uppercase tracking-wide text-m-ink/48">{col.title}</h3>
            <ul className="mt-4 divide-y divide-m-border-faint">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="block py-2 text-[14px] text-m-ink/72 transition-colors duration-150 ease-out hover:text-m-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-12 flex max-w-container items-center justify-between border-t border-m-border-faint py-6">
        <div className="flex items-center gap-4">
          <Logo className="h-10 w-auto text-m-ink/56" />
          <p className="font-mono text-[12px] text-m-ink/40">
            © 2026 Helix ·{' '}
            <Link href="/terms" className="hover:text-m-ink/72">
              Terms
            </Link>{' '}
            ·{' '}
            <Link href="/privacy" className="hover:text-m-ink/72">
              Privacy
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
