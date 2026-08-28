'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type AgentOutputFormat = 'json' | 'csv';

const OPTIONS: { value: AgentOutputFormat; label: string }[] = [
  { value: 'json', label: 'JSON' },
  { value: 'csv', label: 'CSV' },
];

export function OutputToggle({
  value,
  onChange,
  className,
}: {
  value: AgentOutputFormat;
  onChange: (value: AgentOutputFormat) => void;
  className?: string;
}) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = OPTIONS.findIndex((option) => option.value === value);
    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % OPTIONS.length : (index - 1 + OPTIONS.length) % OPTIONS.length;
    const next = OPTIONS[nextIndex]!;
    onChange(next.value);
    (event.currentTarget.children[nextIndex] as HTMLElement | undefined)?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Output format"
      onKeyDown={handleKeyDown}
      className={cn('flex h-8 shrink-0 items-center gap-0.5 rounded-pill bg-secondary p-0.5', className)}
    >
      {OPTIONS.map((option) => {
        const checked = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex h-7 min-w-[44px] items-center justify-center rounded-pill px-2.5 font-mono text-[11px] font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              checked ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
