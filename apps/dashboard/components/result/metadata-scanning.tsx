'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The scanning animation shown while a file is being read or scrubbed.
 *
 * Why this animates at all: a scan is occasional (not a keyboard action), its
 * duration is genuinely unknown — 150ms for a small PDF, seconds for a large
 * one — and the purpose is state indication. A loop is the honest shape for
 * work whose length cannot be predicted; a progress bar would have to lie.
 *
 * Why it depicts the work rather than spinning: the sweep passes over a page,
 * and tags surface behind it as it goes. That is what the endpoint does, so
 * the motion explains the wait instead of merely filling it. On the scrub pass
 * the tags fade out behind the sweep instead of appearing — the same mechanism
 * read backwards, which is exactly the difference between the two operations.
 *
 * Every value here comes from the project's own scale: `cubic-bezier(0,0,0.2,1)`
 * is the config's default curve, and the global `prefers-reduced-motion` block
 * in globals.css collapses all of it to a static frame.
 */

type Mode = 'scan' | 'scrub';

const TAGS: { label: string; x: number; y: number }[] = [
  { label: 'GPS', x: 20, y: 26 },
  { label: 'Author', x: 55, y: 38 },
  { label: 'Device', x: 26, y: 52 },
  { label: 'XMP', x: 60, y: 64 },
  { label: 'Created', x: 22, y: 76 },
];

// The sweep crosses the page once per cycle; each tag reacts as the line
// reaches its own y. Staggering by position rather than by index is what makes
// the sweep look like the cause of the tag rather than a coincidence.
const CYCLE_MS = 2600;

export function MetadataScanning({ mode, filename }: { mode: Mode; filename?: string | undefined }) {
  const scrubbing = mode === 'scrub';

  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-5 p-6">
      <div
        className="relative h-[184px] w-[148px] overflow-hidden rounded-card border border-border bg-card"
        role="img"
        aria-label={scrubbing ? 'Removing metadata from the file' : 'Scanning the file for metadata'}
      >
        {/* The page: text lines, so the sweep has something to pass over. */}
        <div className="absolute inset-0 flex flex-col gap-[7px] p-4 pt-5">
          {[100, 88, 94, 70, 96, 82, 90, 64, 92, 78].map((width, index) => (
            <div
              key={index}
              className="h-[3px] rounded-full bg-muted-foreground/25"
              style={{ width: `${width}%` }}
            />
          ))}
        </div>

        {/* Tags surface behind the sweep (scan) or dissolve into it (scrub). */}
        {TAGS.map((tag, index) => (
          <span
            key={tag.label}
            className={cn(
              'absolute rounded-full border px-1.5 py-px font-mono text-[9px] leading-none',
              scrubbing
                ? 'border-muted-foreground/30 bg-card text-muted-foreground'
                : 'border-violet/40 bg-violet-8 text-foreground',
              scrubbing ? 'animate-metadata-tag-out' : 'animate-metadata-tag-in',
            )}
            style={{
              left: `${tag.x}%`,
              top: `${tag.y}%`,
              // Fire as the sweep reaches this tag's own height.
              animationDelay: `${Math.round((tag.y / 100) * CYCLE_MS)}ms`,
              animationDuration: `${CYCLE_MS}ms`,
            }}
          >
            {tag.label}
          </span>
        ))}

        {/* The sweep itself: a bright line with a short trail behind it. */}
        <div
          className="animate-metadata-sweep pointer-events-none absolute inset-x-0 top-0 h-16"
          style={{ animationDuration: `${CYCLE_MS}ms` }}
        >
          <div
            className={cn(
              'h-full w-full',
              scrubbing
                ? 'bg-gradient-to-b from-transparent to-muted-foreground/20'
                : 'bg-gradient-to-b from-transparent to-violet-24',
            )}
          />
          <div className={cn('h-px w-full', scrubbing ? 'bg-muted-foreground/60' : 'bg-violet')} />
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm font-medium text-foreground">
          {scrubbing ? 'Removing metadata' : 'Reading metadata'}
        </p>
        <p className="max-w-[16rem] truncate text-xs text-muted-foreground">
          {filename ?? (scrubbing ? 'Rebuilding the file without it.' : 'Nothing is stored.')}
        </p>
      </div>
    </div>
  );
}
