'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { BrandMark } from '@/components/shared/brand-mark';
import type { BrandId } from '@/lib/brand-marks';
import { cn } from '@/lib/utils';

export interface SegmentedItem<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  /** A real brand mark, shown instead of an icon. */
  brand?: BrandId;
  /** Items sharing a group get one mono label above them. */
  group?: string;
}

export interface SegmentedProps<T extends string> {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (id: T) => void;
  'aria-label': string;
  className?: string;
}

/**
 * One grey track, the active tab lifted white, hairlines between the rest.
 * When items carry `group`, the labels sit above the track and the track
 * itself is painted by a pseudo-element so it stays continuous underneath.
 */
export function Segmented<T extends string>({ items, value, onChange, className, ...rest }: SegmentedProps<T>) {
  const grouped = items.some((i) => i.group);
  const groups = grouped
    ? items.reduce<{ label: string; items: SegmentedItem<T>[] }[]>((acc, item) => {
        const last = acc[acc.length - 1];
        if (last && last.label === (item.group ?? '')) last.items.push(item);
        else acc.push({ label: item.group ?? '', items: [item] });
        return acc;
      }, [])
    : [{ label: '', items }];

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const index = items.findIndex((i) => i.id === value);
    const next = items[(index + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
    if (next) {
      onChange(next.id);
      (e.currentTarget.querySelector(`[data-id="${next.id}"]`) as HTMLElement | null)?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label={rest['aria-label']}
      onKeyDown={onKeyDown}
      className={cn(
        'relative inline-flex max-w-full items-end',
        grouped
          ? 'before:absolute before:inset-x-0 before:bottom-0 before:top-5 before:rounded-pill before:border before:border-m-border-muted before:bg-m-bg'
          : 'rounded-pill border border-m-border-muted bg-m-bg',
        className,
      )}
    >
      {groups.map((group, gi) => (
        <div key={group.label || gi} className="relative flex min-w-0 flex-col">
          {grouped && (
            <span className="mb-1 pl-3.5 font-mono text-[11px] uppercase tracking-wide text-m-ink/48">{group.label}</span>
          )}
          <div className="flex p-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = item.id === value;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  data-id={item.id}
                  data-active={active}
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => onChange(item.id)}
                  className={cn(
                    'relative flex items-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 py-1.5 font-mono text-[13px] transition-colors duration-150 ease-out',
                    'before:absolute before:left-0 before:top-1/2 before:h-3.5 before:w-px before:-translate-y-1/2 before:bg-m-border-loud',
                    'first:before:hidden data-[active=true]:before:hidden [[data-active=true]+&]:before:hidden',
                    active
                      ? 'bg-m-surface text-m-ink shadow-card-sm'
                      : 'text-m-ink/56 hover:text-m-ink/80',
                  )}
                >
                  {item.brand && <BrandMark id={item.brand} className={active ? '' : 'opacity-70'} />}
                  {Icon && <Icon className={cn('h-3 w-3', active ? 'text-violet' : 'text-m-ink/40')} aria-hidden />}
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
