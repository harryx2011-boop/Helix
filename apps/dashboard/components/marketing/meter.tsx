'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useInView, useReducedMotion } from './ambient';

export interface MeterRow {
  label: string;
  /** 0–100. */
  value: number;
  accent?: boolean;
  /** Thin variant only: replaces the percent readout (e.g. "14.2 kb"). */
  display?: string;
}

export interface MeterPanelProps {
  rows: MeterRow[];
  label?: string;
  size?: 'pill' | 'thin';
  className?: string;
}

/**
 * Illustrative ratio bars. Grow from zero on scroll-in and hold; the values
 * are an example distribution, never this instance's telemetry, and the
 * panel says so. Reduced motion pins every bar at its value with no transition.
 */
export function MeterPanel({ rows, label, size = 'pill', className }: MeterPanelProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;
  const valuesKey = rows.map((r) => r.value).join(',');
  const [shown, setShown] = React.useState<number[]>(() => rows.map(() => 0));

  React.useEffect(() => {
    if (reduced) {
      setShown(rowsRef.current.map((r) => r.value));
      return;
    }
    if (!inView) return;
    const grow = setTimeout(() => {
      setShown(rowsRef.current.map((r) => r.value));
    }, 80);
    return () => clearTimeout(grow);
  }, [inView, reduced, valuesKey]);

  const isPill = size === 'pill';

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn('select-none overflow-hidden rounded-panel border border-m-border-muted bg-m-bg', className)}
    >
      <div className="flex items-center gap-2 border-b border-m-border-faint px-3 py-2 font-mono text-[11px] text-m-ink/48">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-m-ink/24" />
        {label && <span className="truncate">{label}</span>}
        <span className="ml-auto shrink-0">example, not live data</span>
      </div>

      <div className={cn('flex flex-col', isPill ? 'divide-y divide-m-border-faint' : 'gap-2.5 px-3 py-3')}>
        {rows.map((row, i) => {
          const pct = shown[i] ?? 0;
          const readout = row.display ?? `${Math.round(pct)}%`;
          return isPill ? (
            <div key={row.label} className="flex items-center gap-3 px-3 py-2.5">
              <span className="w-[88px] shrink-0 truncate font-mono text-[12px] text-m-ink/72">{row.label}</span>
              <div className="relative h-8 min-w-0 flex-1 rounded-pill border border-m-border-faint">
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 min-w-[56px] rounded-pill transition-[width] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                    row.accent ? 'bg-violet shadow-btn' : 'border border-m-border-muted bg-m-surface',
                  )}
                  style={{ width: `${pct}%` }}
                >
                  <span
                    className={cn(
                      'absolute right-1 top-1/2 -translate-y-1/2 rounded-pill px-2 py-0.5 font-mono text-[11px] tabular-nums',
                      row.accent ? 'bg-white text-violet' : 'bg-m-bg text-m-ink/72',
                    )}
                  >
                    {readout}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div key={row.label} className="flex items-center gap-3">
              <span className="w-[88px] shrink-0 truncate font-mono text-[12px] text-m-ink/72">{row.label}</span>
              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-pill bg-m-ink/[0.06]">
                <div
                  className={cn(
                    'h-full rounded-pill transition-[width] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                    row.accent ? 'bg-violet' : 'bg-m-ink/24',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-[56px] shrink-0 text-right font-mono text-[11px] tabular-nums text-m-ink/56">{readout}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
