'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectCardProps {
  icon: LucideIcon;
  label: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  badge?: string;
}

/**
 * Single select-card primitive shared by every wizard step (WEBSITE.md §6.2).
 * Selected: 1px violet border + violet-8 fill. Unselected: border-m-border-loud.
 * Hover: 3.1% ink tint (m-anti-vibe: no scale, no glow).
 */
export function SelectCard({ icon: Icon, label, description, selected, onSelect, disabled, badge }: SelectCardProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex min-h-[44px] w-full items-start gap-3 rounded-card border p-4 text-left transition-colors duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2 focus-visible:ring-offset-m-bg',
        selected ? 'border-violet bg-violet-8' : 'border-m-border-loud bg-m-surface hover:bg-[#0B1220]/[0.031]',
        disabled && 'cursor-not-allowed opacity-50 hover:bg-m-surface',
      )}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-m-ink/70" aria-hidden />
      <span className="flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-medium leading-tight text-m-ink">{label}</span>
          {badge ? (
            <span className="rounded-full border border-m-border-loud px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-m-ink/56">
              {badge}
            </span>
          ) : null}
        </span>
        {description ? <span className="mt-1 block text-[13px] leading-relaxed text-m-ink/64">{description}</span> : null}
      </span>
    </button>
  );
}
