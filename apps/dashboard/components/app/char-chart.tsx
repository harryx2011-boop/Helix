'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const GLYPHS = ['·', '░', '▒', '▓', '█'] as const;
const SERIES_COLOR_CLASSES = ['text-tier-plain', 'text-tier-lightpanda', 'text-primary'] as const;

export interface CharChartSeries {
  label: string;
  values: number[];
}

export interface CharChartProps {
  series: CharChartSeries[];
  labels: string[];
  height?: number;
  format?: (n: number) => string;
  variant?: 'bars' | 'area';
}

function glyphForRatio(ratio: number): (typeof GLYPHS)[number] {
  if (ratio <= 0) return GLYPHS[0];
  const quartile = Math.min(3, Math.ceil(ratio * 4) - 1);
  return GLYPHS[Math.max(0, quartile) + 1] ?? GLYPHS[4];
}

function seriesColorClass(index: number): (typeof SERIES_COLOR_CLASSES)[number] {
  return SERIES_COLOR_CLASSES[index % SERIES_COLOR_CLASSES.length] ?? SERIES_COLOR_CLASSES[0];
}

/** Thin x-axis labels to at most ~12 visible entries, evenly spaced, always keeping the last. */
function visibleLabelIndices(count: number, max = 12): Set<number> {
  if (count <= max) return new Set(Array.from({ length: count }, (_, i) => i));
  const step = Math.ceil(count / max);
  const indices = new Set<number>();
  for (let i = 0; i < count; i += step) indices.add(i);
  indices.add(count - 1);
  return indices;
}

const defaultFormat = (n: number): string => String(n);

export function CharChart({ series, labels, height = 8, format = defaultFormat, variant = 'bars' }: CharChartProps) {
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const columnCount = labels.length;

  const max = React.useMemo(() => {
    let m = 0;
    for (const s of series) for (const v of s.values) if (v > m) m = v;
    return m;
  }, [series]);

  const visibleLabels = React.useMemo(() => visibleLabelIndices(columnCount), [columnCount]);

  const columns = React.useMemo(() => {
    return Array.from({ length: columnCount }, (_, colIndex) => {
      return series.map((s) => {
        const value = s.values[colIndex] ?? 0;
        const ratio = max > 0 ? value / max : 0;
        const filledRows = variant === 'area' ? Math.round(ratio * height) : Math.round(ratio * height);
        const rows: (typeof GLYPHS)[number][] = [];
        for (let r = 0; r < height; r++) {
          const fromBottom = height - r;
          if (fromBottom <= filledRows) {
            const rowRatio = filledRows === 0 ? 0 : Math.min(1, fromBottom / filledRows);
            rows.push(filledRows === 0 ? GLYPHS[0] : glyphForRatio(rowRatio));
          } else {
            rows.push(GLYPHS[0]);
          }
        }
        return { value, rows };
      });
    });
  }, [series, columnCount, max, height, variant]);

  if (columnCount === 0 || series.length === 0 || series.every((s) => s.values.every((v) => v === 0))) {
    return (
      <div className="flex h-32 items-center justify-center rounded-card border border-border bg-card">
        <p className="text-sm text-muted-foreground">No data for this range yet.</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="overflow-x-auto">
        <div className="inline-flex min-w-full flex-col gap-0" style={{ minWidth: `${columnCount * 14}px` }}>
          <div className="relative flex" onMouseLeave={() => setHoverIndex(null)}>
            {/* glyph grid */}
            <div className="flex font-mono text-xs leading-none">
              {Array.from({ length: columnCount }, (_, colIndex) => (
                <div
                  key={colIndex}
                  className="relative flex w-[14px] shrink-0 flex-col items-center"
                  onMouseEnter={() => setHoverIndex(colIndex)}
                >
                  {Array.from({ length: height }, (_, rowIndex) => {
                    const cellSeries = columns[colIndex];
                    return (
                      <div key={rowIndex} className="flex h-4 w-full items-center justify-center">
                        {series.map((s, seriesIndex) => {
                          const glyph = cellSeries?.[seriesIndex]?.rows[rowIndex] ?? GLYPHS[0];
                          if (glyph === GLYPHS[0]) return null;
                          return (
                            <span
                              key={s.label}
                              className={cn('absolute', seriesColorClass(seriesIndex))}
                            >
                              {glyph}
                            </span>
                          );
                        })}
                        {cellSeries?.every((c) => c.rows[rowIndex] === GLYPHS[0]) && (
                          <span className="text-muted-foreground/40">·</span>
                        )}
                      </div>
                    );
                  })}
                  {/* transparent hover overlay */}
                  <div className="absolute inset-0 cursor-default" aria-hidden />
                </div>
              ))}
            </div>

            {hoverIndex !== null && (
              <div
                className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-card border border-border bg-popover px-2.5 py-1.5 font-mono text-xs text-popover-foreground shadow-md"
                style={{ left: `${hoverIndex * 14}px` }}
              >
                <div className="mb-1 font-medium tracking-wide text-foreground">{labels[hoverIndex]}</div>
                {series.map((s, seriesIndex) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className={cn('h-1.5 w-1.5 rounded-full', seriesColorClass(seriesIndex).replace('text-', 'bg-'))} />
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="ml-auto text-foreground">{format(s.values[hoverIndex] ?? 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* baseline */}
          <div className="flex font-mono text-xs leading-none text-primary" aria-hidden>
            {Array.from({ length: columnCount }, (_, i) => (
              <span key={i} className="flex h-3 w-[14px] shrink-0 items-center justify-center">
                ─
              </span>
            ))}
          </div>

          {/* x-axis labels */}
          <div className="flex font-mono text-[11px] leading-none text-muted-foreground">
            {labels.map((label, i) => (
              <span key={i} className="flex h-4 w-[14px] shrink-0 items-start justify-center">
                {visibleLabels.has(i) ? (
                  <span className="origin-top -rotate-0 whitespace-nowrap">{label}</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* screen-reader table fallback */}
      <table className="sr-only">
        <caption>Chart data</caption>
        <thead>
          <tr>
            <th scope="col">Label</th>
            {series.map((s) => (
              <th scope="col" key={s.label}>
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, i) => (
            <tr key={label + i}>
              <th scope="row">{label}</th>
              {series.map((s) => (
                <td key={s.label}>{format(s.values[i] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
