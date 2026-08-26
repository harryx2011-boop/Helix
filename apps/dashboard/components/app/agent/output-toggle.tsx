'use client';

import { cn } from '@/lib/utils';

export type AgentOutputFormat = 'json' | 'csv';

export function OutputToggle({
  value,
  onChange,
  className,
}: {
  value: AgentOutputFormat;
  onChange: (value: AgentOutputFormat) => void;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex items-center gap-1 rounded-pill bg-secondary p-1', className)}>
      {(['json', 'csv'] as const).map((format) => (
        <button
          key={format}
          type="button"
          aria-pressed={value === format}
          onClick={() => onChange(format)}
          className={cn(
            'rounded-pill px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors duration-150 ease-out',
            value === format ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {format}
        </button>
      ))}
    </div>
  );
}
