import Link from 'next/link';
import { ArrowUpRight, Braces, Compass, Download, HelpCircle, Activity, ListChecks, Lock, Rocket, Settings } from '@/components/icons/lucide';
import { Logo } from '@/components/shell/logo';
import { FEATURES, FEATURE_GROUPS } from '@/lib/feature-copy';
import { cn } from '@/lib/utils';
import { IconTile } from './icon-tile';
import type { GlyphIcon } from '@/components/shared/icon-type';

export interface MenuRow {
  label: string;
  href: string;
  icon: GlyphIcon;
  pill?: string | undefined;
  external?: boolean;
}

export type MenuId = 'features' | 'docs' | 'tools';

export interface MenuGroup {
  label: string;
  rows: MenuRow[];
}

/** The features menu, derived from the plain-language registry: a new feature appears here without touching this file. */
export const FEATURE_MENU_GROUPS: readonly MenuGroup[] = FEATURE_GROUPS.map((group) => ({
  label: group,
  rows: FEATURES.filter((f) => f.group === group).map((f) => ({ label: f.name, href: f.route, icon: f.icon })),
})).filter((g) => g.rows.length > 0);

/** Flat order, for the mobile drawer. */
export const FEATURE_ROWS: readonly MenuRow[] = FEATURE_MENU_GROUPS.flatMap((g) => g.rows);

export const DOCS_ROWS: readonly MenuRow[] = [
  { label: 'Quickstart', href: '/docs/quickstart', icon: Rocket },
  { label: 'How It Works', href: '/docs/how-it-works', icon: Compass },
  { label: 'Settings and Models', href: '/docs/settings-and-models', icon: Settings },
  { label: 'Privacy and Data', href: '/docs/privacy-and-data', icon: Lock },
  { label: 'Help', href: '/docs/help', icon: HelpCircle },
  { label: 'Changelog', href: '/changelog', icon: ListChecks },
  { label: 'For Developers', href: '/docs', icon: Braces },
];

export const TOOL_ROWS: readonly MenuRow[] = [
  { label: 'Get the app', href: '/download', icon: Download },
  { label: 'Status', href: '/status', icon: Activity },
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
        </span>
      </Link>
    </div>
  );
}

function ColumnHeader({ children }: { children: React.ReactNode }) {
  return <div className="border-b border-m-border-faint px-4 py-2.5 text-[13px] text-m-ink/56">{children}</div>;
}

export function DownloadPanel({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="flex flex-col bg-m-bg">
      <ColumnHeader>Helix for Windows</ColumnHeader>
      <div className="flex flex-1 flex-col gap-4 px-4 py-4">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 items-center justify-center rounded-card border border-m-border-muted bg-m-surface text-m-ink"
        >
          <Logo markOnly className="h-6 w-auto" />
        </span>
        <p className="text-[13px] leading-snug text-m-ink/72">Runs on your own PC. No account to create.</p>
      </div>
      <Link
        href="/download"
        onClick={onNavigate}
        className="flex items-center gap-2 border-t border-m-border-faint px-4 py-3 text-[14px] font-medium text-m-ink transition-colors duration-150 ease-out hover:bg-m-ink/[0.039] focus-visible:bg-m-ink/[0.039] focus-visible:outline-none"
      >
        <Download className="h-4 w-4" aria-hidden />
        Get the app
      </Link>
    </div>
  );
}

export function FeaturesPanel({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_260px] divide-x divide-m-border-faint">
      {FEATURE_MENU_GROUPS.map((group) => (
        <div key={group.label} className="min-w-0">
          <ColumnHeader>{group.label}</ColumnHeader>
          <div className="py-1">
            {group.rows.map((row) => (
              <MenuRowItem key={row.label} row={row} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ))}
      <DownloadPanel onNavigate={onNavigate} />
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
