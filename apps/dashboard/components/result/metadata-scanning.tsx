'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';


export type ScanningMode = 'scan' | 'scrub' | 'parse';

const PAGE_W = 168;
const PAGE_H = 208;
const LENS = 62;

const LINES = [100, 86, 94, 68, 96, 80, 90, 62, 92, 76, 88, 70];

const SLOTS: { x: number; y: number; at: number }[] = [
  { x: 56, y: 50, at: 0.051 },
  { x: 104, y: 92, at: 0.284 },
  { x: 52, y: 134, at: 0.497 },
  { x: 112, y: 172, at: 0.703 },
];

const LABELS: Record<ScanningMode, string[]> = {
  scan: ['GPS', 'Author', 'Device', 'Created'],
  scrub: ['GPS', 'Author', 'Device', 'Created'],
  parse: ['Heading', 'Table', 'Page 2', 'Total'],
};

const COPY: Record<ScanningMode, { title: string; idle: string }> = {
  scan: { title: 'Reading metadata', idle: 'Nothing is stored.' },
  scrub: { title: 'Removing metadata', idle: 'Rebuilding the file without it.' },
  parse: { title: 'Parsing the document', idle: 'Converting it to markdown.' },
};

const CYCLE_MS = 3600;

function PageContent({ mode }: { mode: ScanningMode }) {
  const scrubbing = mode === 'scrub';
  const labels = LABELS[mode];
  return (
    <>
      <div className="flex flex-col gap-[7px] px-4 pt-5">
        {LINES.map((width, index) => (
          <div
            key={index}
            className="h-[3px] rounded-full bg-muted-foreground/25"
            style={{ width: `${width}%` }}
          />
        ))}
      </div>

      {SLOTS.map((slot, index) => (
        <span
          key={labels[index]}
          className={cn(
            'absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border px-1.5 py-px font-mono leading-none',
            scrubbing
              ? 'border-muted-foreground/30 bg-card text-muted-foreground'
              : 'border-violet/50 bg-violet-8 text-foreground',
            scrubbing ? 'animate-metadata-tag-out' : 'animate-metadata-tag-in',
          )}
          style={{
            left: `${slot.x}px`,
            top: `${slot.y}px`,
            animationDelay: `${Math.round(slot.at * CYCLE_MS)}ms`,
            animationDuration: `${CYCLE_MS}ms`,
          }}
        >
          {labels[index]}
        </span>
      ))}
    </>
  );
}

export function MetadataScanning({ mode, filename }: { mode: ScanningMode; filename?: string | undefined }) {
  const scrubbing = mode === 'scrub';
  const copy = COPY[mode];

  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-6 p-6">
      <div
        className="relative"
        style={{ width: PAGE_W, height: PAGE_H }}
        role="img"
        aria-label={copy.title}
      >
        <div className="absolute inset-0 overflow-hidden rounded-card border border-border bg-card">
          <PageContent mode={mode} />
        </div>

        <div
          className="animate-metadata-lens pointer-events-none absolute left-0 top-0"
          style={{ width: LENS, height: LENS, animationDuration: `${CYCLE_MS}ms` }}
        >
          <div
            className={cn(
              'relative h-full w-full overflow-hidden rounded-full border-2 bg-card',
              scrubbing ? 'border-muted-foreground/70' : 'border-violet',
            )}
            style={{
              boxShadow: '0 4px 14px -4px rgb(0 0 0 / 0.28)',
            }}
          >
            <div
              className="animate-metadata-lens-content absolute left-0 top-0"
              style={{
                width: PAGE_W,
                height: PAGE_H,
                transformOrigin: '0 0',
                animationDuration: `${CYCLE_MS}ms`,
              }}
            >
              <PageContent mode={mode} />
            </div>

            <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-background/40 via-transparent to-transparent" />
          </div>

          <div
            className={cn(
              'absolute h-[3px] w-[22px] origin-left rounded-full',
              scrubbing ? 'bg-muted-foreground/70' : 'bg-violet',
            )}
            style={{ left: LENS - 6, top: LENS - 8, transform: 'rotate(45deg)' }}
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm font-medium text-foreground">{copy.title}</p>
        <p className="max-w-[18rem] truncate text-xs text-muted-foreground">{filename ?? copy.idle}</p>
      </div>
    </div>
  );
}
