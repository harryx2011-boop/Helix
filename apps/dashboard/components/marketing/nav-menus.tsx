import Link from 'next/link';
import {
  ArrowUpRight,
  BookOpen,
  FileCog,
  Bot,
  Braces,
  FileText,
  Activity,
  FlaskConical,
  ListChecks,
  Package,
  Plug,
  Puzzle,
  Server,
  Terminal,
  Users,
} from 'lucide-react';
import { Logo } from '@/components/shell/logo';
import { PRODUCTS, TAB_GROUPS, type EndpointDef, type TabGroup } from '@/lib/catalog';
import { PERSONA_URL } from '@/lib/mode';
import { GITHUB_URL } from '@/lib/github-stars';
import { cn } from '@/lib/utils';
import { IconTile } from './icon-tile';
import { GithubMark } from './github-mark';
import { CanvasMarkCompact } from './canvas-mark';
import { VulcanFlame } from '@/components/vulcan/vulcan-flame';
import type { GlyphIcon } from './icon-type';

export interface MenuRow {
  label: string;
  href: string;
  icon: GlyphIcon;
  pill?: string | undefined;
  external?: boolean;
}

export type MenuId = 'apis' | 'docs' | 'tools';

const fromCatalog = (e: EndpointDef): MenuRow => ({
  label: e.name,
  href: e.route,
  icon: e.icon,
  pill: e.status === 'coming' ? 'Coming' : undefined,
});

/** Human label per catalog group, in the order the nav lists them. */
export const GROUP_LABEL: Record<TabGroup, string> = {
  DISCOVER: 'Discover',
  EXTRACT: 'Extract',
  CRAWL: 'Crawl',
  ACT: 'Act',
  WATCH: 'Watch',
};

export interface MenuGroup {
  group: TabGroup;
  label: string;
  rows: MenuRow[];
}

/**
 * The API menu, derived from the catalog rather than hand-listed: a new
 * `product: true` endpoint appears here without touching this file.
 */
export const API_GROUPS: readonly MenuGroup[] = TAB_GROUPS.map((group) => ({
  group,
  label: GROUP_LABEL[group],
  rows: PRODUCTS.filter((e) => e.group === group).map((e) => fromCatalog(e)),
})).filter((g) => g.rows.length > 0);

/** Flat order, for the mobile drawer and anything that cannot render columns. */
export const ENDPOINT_ROWS: readonly MenuRow[] = [
  ...API_GROUPS.flatMap((g) => g.rows),
  {
    label: 'Agent',
    href: '/app/agent',
    icon: Bot,
  },
];

export const SURFACE_ROWS: readonly MenuRow[] = [
  { label: 'MCP', href: '/docs/mcp', icon: Plug },
  { label: 'CLI', href: '/docs/cli', icon: Terminal },
  { label: 'API', href: '/docs/api-reference', icon: Braces },
  { label: 'SDKs', href: '/docs/sdks', icon: Package },
  { label: 'Skills', href: '/docs/skills', icon: Puzzle },
];

export const DOCS_ROWS: readonly MenuRow[] = [
  { label: 'Getting started', href: '/docs/getting-started', icon: BookOpen },
  { label: 'API reference', href: '/docs/api-reference', icon: Braces },
  { label: 'Self-host guide', href: '/self-host', icon: Server },
  { label: 'CLI', href: '/docs/cli', icon: Terminal },
  { label: 'MCP', href: '/docs/mcp', icon: Plug },
  { label: 'Agent onboarding', href: '/agent-onboarding/SKILL.md', icon: Bot },
  { label: 'llms.txt', href: '/llms.txt', icon: FileText },
];

export const TOOL_ROWS: readonly MenuRow[] = [
  {
    label: 'Converter',
    href: '/convert',
    icon: FileCog,
  },
  {
    label: 'Canvas',
    href: '/canvas',
    icon: CanvasMarkCompact,
  },
  { label: 'Checks', href: '/checks', icon: ListChecks },
  { label: 'Playground', href: '/app/playground', icon: FlaskConical },
  { label: 'Vulcan', href: '/app/vulcan', icon: VulcanFlame },
  { label: 'Persona', href: PERSONA_URL, icon: Users, external: true },
  { label: 'Status', href: '/status', icon: Activity },
].filter((row) => row.href);

/** @deprecated Kept while callers migrate to `TOOL_ROWS`. */
export const UTILITY_ROWS = TOOL_ROWS;

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
        </span>
      </Link>
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

export function ApisPanel({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="grid grid-cols-[1fr_1fr_280px] divide-x divide-m-border-faint">
      <div>
        <ColumnHeader>Endpoints</ColumnHeader>
        <div className="grid grid-cols-2 gap-x-2 py-1">
          {API_GROUPS.map((group) => (
            <div key={group.group} className="min-w-0">
              <div className="px-4 pb-1 pt-2 font-mono text-[11px] uppercase tracking-wide text-m-ink/40">
                {group.label}
              </div>
              {group.rows.map((row) => (
                <MenuRowItem key={row.label} row={row} onNavigate={onNavigate} />
              ))}
            </div>
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

export function ToolsPanel({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div>
      <ColumnHeader>Tools</ColumnHeader>
      <div className="grid grid-cols-2 gap-x-2 p-1 pb-2 pt-1.5">
        {TOOL_ROWS.map((row) => (
          <MenuRowItem key={row.label} row={row} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}
