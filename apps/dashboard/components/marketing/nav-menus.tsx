import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowUpRight,
  BookOpen,
  FileCog,
  Bot,
  Braces,
  FileText,
  FlaskConical,
  Package,
  Plug,
  Puzzle,
  Server,
  Terminal,
  Users,
} from 'lucide-react';
import { Logo } from '@/components/shell/logo';
import { endpointById, type EndpointDef } from '@/lib/catalog';
import { CONVERTER_URL, PERSONA_URL } from '@/lib/mode';
import { GITHUB_URL } from '@/lib/github-stars';
import { cn } from '@/lib/utils';
import { IconTile } from './icon-tile';
import { GithubMark } from './github-mark';

export interface MenuChip {
  label: string;
  href: string;
}

export interface MenuRow {
  label: string;
  href: string;
  tagline: string;
  icon: LucideIcon;
  pill?: string | undefined;
  chips?: MenuChip[] | undefined;
  external?: boolean;
}

export type MenuId = 'capabilities' | 'docs' | 'utilities';

const def = (id: string): EndpointDef => {
  const e = endpointById(id);
  if (!e) throw new Error(`nav: unknown endpoint ${id}`);
  return e;
};

const scrape = def('scrape');
const parse = def('parse');
const metadata = def('metadata');
const search = def('search');
const map = def('map');
const crawl = def('crawl');
const interact = def('interact');
const monitor = def('monitor');

const fromCatalog = (e: EndpointDef, chips?: MenuChip[]): MenuRow => ({
  label: e.name,
  href: e.route,
  tagline: e.tagline,
  icon: e.icon,
  pill: e.status === 'coming' ? 'Coming' : undefined,
  chips,
});

export const ENDPOINT_ROWS: readonly MenuRow[] = [
  fromCatalog(scrape, [
    { label: 'URLs', href: scrape.route },
    { label: 'Documents', href: parse.route },
    { label: 'Metadata', href: metadata.route },
  ]),
  fromCatalog(search),
  fromCatalog(crawl, [
    { label: 'Crawl', href: crawl.route },
    { label: 'Map', href: map.route },
  ]),
  fromCatalog(interact),
  fromCatalog(monitor),
  {
    label: 'Agent',
    href: '/app/agent',
    tagline: 'Give it a goal. It picks the endpoints, runs them, and reports back.',
    icon: Bot,
  },
  {
    label: 'Converter API',
    href: CONVERTER_URL,
    tagline: 'Convert audio, video, images and documents between formats.',
    icon: FileCog,
    external: true,
  },
];

export const SURFACE_ROWS: readonly MenuRow[] = [
  { label: 'MCP', href: '/docs/mcp', tagline: 'Every endpoint as a tool for Claude, Cursor and any MCP client.', icon: Plug },
  { label: 'CLI', href: '/docs/cli', tagline: 'The same calls from a terminal, output piped wherever you want it.', icon: Terminal },
  { label: 'API', href: '/docs/api-reference', tagline: 'Plain HTTP. One envelope for every endpoint.', icon: Braces },
  { label: 'SDKs', href: '/docs/sdks', tagline: 'Typed clients generated from the OpenAPI spec.', icon: Package },
  { label: 'Skills', href: '/docs/skills', tagline: 'Drop-in onboarding files that teach an agent the API.', icon: Puzzle },
];

export const DOCS_ROWS: readonly MenuRow[] = [
  { label: 'Getting started', href: '/docs/getting-started', tagline: 'A key, one request, and what comes back.', icon: BookOpen },
  { label: 'API reference', href: '/docs/api-reference', tagline: 'Every endpoint, parameter and response field.', icon: Braces },
  { label: 'Self-host guide', href: '/self-host', tagline: 'Run the whole stack on your own machine.', icon: Server },
  { label: 'CLI', href: '/docs/cli', tagline: 'Install, authenticate, and call endpoints from a shell.', icon: Terminal },
  { label: 'MCP', href: '/docs/mcp', tagline: 'Connect an MCP client to the hosted or local server.', icon: Plug },
  { label: 'Agent onboarding', href: '/agent-onboarding/SKILL.md', tagline: 'The file an agent reads to learn Helix.', icon: Bot },
  { label: 'llms.txt', href: '/llms.txt', tagline: 'Every page on this site as markdown, indexed.', icon: FileText },
];

export const UTILITY_ROWS: readonly MenuRow[] = [
  { label: 'Persona', href: PERSONA_URL, tagline: 'System prompts for 36 roles, ready to paste.', icon: Users, external: true },
  { label: 'Playground', href: '/app/playground', tagline: 'Try every endpoint against a live URL.', icon: FlaskConical },
];

export interface MenuRowProps {
  row: MenuRow;
  onNavigate: () => void;
  className?: string | undefined;
}

const rowLinkClass =
  'flex items-start gap-3 rounded-card px-3 py-2.5 transition-colors duration-150 ease-out hover:bg-m-ink/[0.039] focus-visible:bg-m-ink/[0.039] focus-visible:outline-none';

export function MenuRowItem({ row, onNavigate, className }: MenuRowProps) {
  const external = row.external ?? row.href.startsWith('http');
  return (
    <div className={cn('px-1 py-0.5', className)}>
      <Link
        href={row.href}
        onClick={onNavigate}
        {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
        className={rowLinkClass}
      >
        <IconTile icon={row.icon} size="md" className="mt-0.5" />
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[14px] font-medium leading-5 text-m-ink">
            {row.label}
            {row.pill && (
              <span className="rounded-pill bg-violet-12 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-violet">
                {row.pill}
              </span>
            )}
            {external && <ArrowUpRight className="h-3.5 w-3.5 text-m-ink/40" aria-hidden />}
          </span>
          <span className="mt-0.5 block text-[12px] leading-snug text-m-ink/56">{row.tagline}</span>
        </span>
      </Link>
      {row.chips && (
        <div className="flex flex-wrap gap-1.5 pb-1.5 pl-[52px] pr-3">
          {row.chips.map((chip) => (
            <Link
              key={chip.label}
              href={chip.href}
              onClick={onNavigate}
              className="inline-flex items-center gap-1 rounded-card bg-m-ink/[0.039] px-2 py-1 font-mono text-[11px] leading-none text-m-ink/72 transition-colors duration-150 ease-out hover:bg-violet-12 hover:text-violet focus-visible:bg-violet-12 focus-visible:text-violet focus-visible:outline-none"
            >
              {chip.label}
              <ArrowUpRight className="h-2.5 w-2.5" aria-hidden />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ColumnHeader({ children }: { children: React.ReactNode }) {
  return <div className="border-b border-m-border-faint px-4 py-2.5 text-[13px] text-m-ink/56">{children}</div>;
}

export function OpenSourcePanel({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="flex flex-col bg-m-bg">
      <ColumnHeader>Open source</ColumnHeader>
      <div className="flex flex-1 flex-col gap-4 px-4 py-4">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 items-center justify-center rounded-card border border-m-border-muted bg-m-surface text-m-ink"
        >
          <Logo markOnly className="h-6 w-auto" />
        </span>
        <p className="text-[13px] leading-snug text-m-ink/72">Helix is Apache-2.0. Star it if it saved you a build.</p>
      </div>
      <Link
        href={GITHUB_URL}
        target="_blank"
        rel="noreferrer"
        onClick={onNavigate}
        className="flex items-center gap-2 border-t border-m-border-faint px-4 py-3 text-[14px] font-medium text-m-ink transition-colors duration-150 ease-out hover:bg-m-ink/[0.039] focus-visible:bg-m-ink/[0.039] focus-visible:outline-none"
      >
        <GithubMark className="h-4 w-4" />
        See GitHub
        <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-m-ink/40" aria-hidden />
      </Link>
    </div>
  );
}

export function CapabilitiesPanel({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="grid grid-cols-[1fr_1fr_280px] divide-x divide-m-border-faint">
      <div>
        <ColumnHeader>Endpoints</ColumnHeader>
        <div className="py-1">
          {ENDPOINT_ROWS.map((row) => (
            <MenuRowItem key={row.label} row={row} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
      <div>
        <ColumnHeader>Surfaces</ColumnHeader>
        <div className="py-1">
          {SURFACE_ROWS.map((row) => (
            <MenuRowItem key={row.label} row={row} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
      <OpenSourcePanel onNavigate={onNavigate} />
    </div>
  );
}

export function DocsPanel({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div>
      <ColumnHeader>Docs</ColumnHeader>
      <div className="grid grid-cols-3 gap-x-2 p-1 pb-2 pt-1.5">
        {DOCS_ROWS.map((row) => (
          <MenuRowItem key={row.label} row={row} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

export function UtilitiesPanel({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div>
      <ColumnHeader>Utilities</ColumnHeader>
      <div className="grid grid-cols-2 gap-x-2 p-1 pb-2 pt-1.5">
        {UTILITY_ROWS.map((row) => (
          <MenuRowItem key={row.label} row={row} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}
