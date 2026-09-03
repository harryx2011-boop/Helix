'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/catalog';
import { useCatalogFilters } from './use-catalog-filters';
import { PLATFORM_LABELS, PLATFORMS, TONES } from './types';

function Chip({
  label,
  active,
  tint,
  onClick,
}: {
  label: string;
  active: boolean;
  tint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-pill border px-3 py-1 text-[12.5px] font-medium transition-colors duration-150 ease-out',
        active ? 'border-transparent text-white' : 'border-p-line bg-p-surface text-p-ink-2 hover:bg-p-code',
      )}
      style={active ? { backgroundColor: tint ?? 'var(--p-blue)' } : undefined}
    >
      {label}
    </button>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-p-ink-3">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function SidebarSearch({ roles }: { roles: Role[] }) {
  const { filters, update, toggle, clear } = useCatalogFilters();
  const departments = React.useMemo(() => [...new Set(roles.map((r) => r.department))], [roles]);
  const deptTint = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const r of roles) if (!map.has(r.department)) map.set(r.department, r.color);
    return map;
  }, [roles]);

  const hasFilters = filters.q || filters.dept.length || filters.platform.length || filters.tone.length;

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-p-ink-3" />
        <Input
          value={filters.q}
          onChange={(e) => update({ q: e.target.value })}
          placeholder="Search roles"
          className="rounded-card border-p-line bg-p-bg pl-8 text-[13px] focus-visible:ring-blue-ring"
          aria-label="Search roles"
        />
      </div>

      <FilterGroup title="Department">
        {departments.map((dept) => {
          const tint = deptTint.get(dept);
          return (
            <Chip
              key={dept}
              label={dept}
              active={filters.dept.includes(dept)}
              {...(tint ? { tint } : {})}
              onClick={() => toggle('dept', dept)}
            />
          );
        })}
      </FilterGroup>

      <FilterGroup title="Platform">
        {PLATFORMS.map((platform) => (
          <Chip
            key={platform}
            label={PLATFORM_LABELS[platform]}
            active={filters.platform.includes(platform)}
            onClick={() => toggle('platform', platform)}
          />
        ))}
      </FilterGroup>

      <FilterGroup title="Tone">
        {TONES.map((tone) => (
          <Chip key={tone} label={tone} active={filters.tone.includes(tone)} onClick={() => toggle('tone', tone)} />
        ))}
      </FilterGroup>

      {hasFilters ? (
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-1.5 self-start text-[12.5px] font-medium text-p-ink-3 transition-colors hover:text-p-ink"
        >
          <X className="h-3.5 w-3.5" />
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
