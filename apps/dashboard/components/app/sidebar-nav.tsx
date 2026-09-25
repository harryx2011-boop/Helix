'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Activity, FileCog, Home, KeyRound, ListChecks, Settings, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { orderBySelection } from '@/lib/catalog';
import type { GlyphIcon } from '@/components/shared/icon-type';

interface NavRow {
  href: string;
  label: string;
  icon: GlyphIcon;
  badge?: 'new' | 'coming';
}

interface NavGroup {
  heading: string | null;
  rows: NavRow[];
}

const NEW_WINDOW_DAYS = 30;

function isRecentlyLive(liveSince: string | undefined): boolean {
  if (!liveSince) return false;
  const days = (Date.now() - new Date(liveSince).getTime()) / 86_400_000;
  return days >= 0 && days <= NEW_WINDOW_DAYS;
}

export function buildNavGroups(selectedEndpoints: readonly string[]): NavGroup[] {
  const ordered = orderBySelection(selectedEndpoints);

  return [
    { heading: null, rows: [{ href: '/app', label: 'Overview', icon: Home }] },
    {
      heading: 'Playground',
      rows: ordered.map((e) => {
        const badge: 'coming' | 'new' | undefined = e.status === 'coming'
          ? 'coming'
          : isRecentlyLive((e as { liveSince?: string }).liveSince)
            ? 'new'
            : undefined;
        return {
          href: `/app/playground?tab=${e.id}`,
          label: e.sidebarLabel,
          icon: e.icon,
          ...(badge ? { badge } : {}),
        };
      }),
    },
    {
      heading: 'Utilities',
      rows: [
        { href: '/app/agent', label: 'Agent', icon: Sparkles },
        { href: '/convert', label: 'Converter', icon: FileCog },
        { href: '/checks', label: 'Checks', icon: ListChecks },
      ],
    },
    {
      heading: 'Instance',
      rows: [{ href: '/app/self-host/health', label: 'Health', icon: Activity }],
    },
    {
      heading: 'Account',
      rows: [
        { href: '/app/keys', label: 'API Keys', icon: KeyRound },
        { href: '/app/settings', label: 'Settings', icon: Settings },
      ],
    },
  ];
}

/**
 * Every playground row shares one pathname and differs only in `?tab=`, so a
 * path-only comparison lit all eight at once. A row that carries a tab must
 * match the tab too; the bare playground path (no tab) falls back to the first
 * row so the list is never entirely unlit.
 */
function isActive(pathname: string, href: string, activeTab: string | null, defaultTab: string | undefined): boolean {
  const [hrefPath, hrefQuery] = href.split('?');
  if (hrefPath === '/app') return pathname === '/app';

  const onPath = pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
  if (!onPath) return false;

  const rowTab = hrefQuery ? new URLSearchParams(hrefQuery).get('tab') : null;
  if (!rowTab) return true;
  return activeTab ? activeTab === rowTab : rowTab === defaultTab;
}

interface SidebarNavProps {
  selectedEndpoints: readonly string[];
  collapsed: boolean;
}

/**
 * `useSearchParams` opts a route out of static prerendering unless it sits
 * under a Suspense boundary, and the self-host build is a static export.
 */
export function SidebarNav(props: SidebarNavProps) {
  return (
    <React.Suspense fallback={<nav className="flex flex-1 flex-col" aria-label="App navigation" />}>
      <SidebarNavInner {...props} />
    </React.Suspense>
  );
}

function SidebarNavInner({ selectedEndpoints, collapsed }: SidebarNavProps) {
  const pathname = usePathname();
  const activeTab = useSearchParams().get('tab');
  const groups = buildNavGroups(selectedEndpoints);
  const defaultTab = orderBySelection(selectedEndpoints)[0]?.id;

  return (
    <nav className={cn('flex flex-1 flex-col gap-4 overflow-y-auto py-3', collapsed ? 'px-0' : 'px-2')} aria-label="App navigation">
      {groups.map((group, gi) => (
        <div key={group.heading ?? `group-${gi}`} className="flex flex-col gap-0.5">
          {group.heading && !collapsed && (
            <h3 className="px-2.5 pb-1 pt-2 font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {group.heading}
            </h3>
          )}
          {group.heading && collapsed && <div className="mx-2 my-1.5 h-px bg-border" />}
          {group.rows.map((row) => {
            const active = isActive(pathname, row.href, activeTab, defaultTab);
            const Icon = row.icon;
            const dim = row.badge === 'coming';
            return (
              <Link
                key={row.href}
                href={row.href}
                title={collapsed ? row.label : undefined}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex min-w-0 items-center gap-2.5 rounded-card px-2.5 py-1.5 text-sm transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  active ? 'bg-primary/12 text-primary' : 'text-foreground/80 hover:bg-secondary/60 hover:text-foreground',
                  dim && !active && 'text-muted-foreground/70',
                  collapsed && 'justify-center px-0',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                {!collapsed && <span className="flex-1 truncate leading-none">{row.label}</span>}
                {!collapsed && row.badge === 'new' && (
                  <span className="rounded-pill bg-primary/16 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-primary">
                    New
                  </span>
                )}
                {!collapsed && row.badge === 'coming' && (
                  <span className="rounded-pill bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Soon
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
