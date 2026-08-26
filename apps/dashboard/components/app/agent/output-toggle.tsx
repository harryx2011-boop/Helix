'use client';

import { Braces, Table2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-pressed={value === 'csv'}
          aria-label={`Output format: ${value === 'json' ? 'JSON' : 'CSV'}`}
          onClick={() => onChange(value === 'json' ? 'csv' : 'json')}
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-muted-foreground transition-colors duration-150 ease-out hover:bg-secondary hover:text-foreground',
            className,
          )}
        >
          {value === 'json' ? <Braces className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>Output: {value === 'json' ? 'JSON' : 'CSV'}</TooltipContent>
    </Tooltip>
  );
}
