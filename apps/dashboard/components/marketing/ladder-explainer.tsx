'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Replays DESIGN.md §3 Sequence A (fetch-ladder escalation) frames 0->4 at
 * 125ms/frame, then holds on the settled frame. `playKey` changes to trigger
 * a fresh run (hero "See how the ladder works" CTA, or a submit in the hero panel).
 */
interface LadderExplainerProps {
  playKey?: number;
  className?: string;
}

interface LadderRow {
  label: string;
  status: string | null;
  glyph: '●' | '○' | '▸' | '·' | null;
}

const TIERS = ['plain', 'tls', 'lightpanda', 'chromium'] as const;

// One entry per frame: [rows for each tier, reason line]
const FRAMES: { rows: LadderRow[]; reason: string }[] = [
  {
    rows: [
      { label: 'plain', glyph: '▸', status: 'trying...' },
      { label: 'tls', glyph: '·', status: null },
      { label: 'lightpanda', glyph: '·', status: null },
      { label: 'chromium', glyph: '·', status: null },
    ],
    reason: '',
  },
  {
    rows: [
      { label: 'plain', glyph: '●', status: '403 5ms' },
      { label: 'tls', glyph: '▸', status: 'trying...' },
      { label: 'lightpanda', glyph: '·', status: null },
      { label: 'chromium', glyph: '·', status: null },
    ],
    reason: 'blocked (cloudflare-mitigated) → escalating',
  },
  {
    rows: [
      { label: 'plain', glyph: '●', status: '403 5ms' },
      { label: 'tls', glyph: '●', status: '403 51ms' },
      { label: 'lightpanda', glyph: '▸', status: 'trying...' },
      { label: 'chromium', glyph: '·', status: null },
    ],
    reason: 'blocked (challenge-platform) → escalating',
  },
  {
    rows: [
      { label: 'plain', glyph: '●', status: '403 5ms' },
      { label: 'tls', glyph: '●', status: '403 51ms' },
      { label: 'lightpanda', glyph: '○', status: '200 24ms' },
      { label: 'chromium', glyph: null, status: '—' },
    ],
    reason: 'content present → done, chromium skipped',
  },
  {
    rows: [
      { label: 'plain', glyph: '●', status: '403 5ms' },
      { label: 'tls', glyph: '●', status: '403 51ms' },
      { label: 'lightpanda', glyph: '●', status: '200 24ms' },
      { label: 'chromium', glyph: '○', status: 'skipped' },
    ],
    reason: '',
  },
];

const SETTLED = FRAMES[FRAMES.length - 1]!;
const FRAME_MS = 125;

export function LadderExplainer({ playKey, className }: LadderExplainerProps) {
  const [frameIndex, setFrameIndex] = React.useState(FRAMES.length - 1);
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  React.useEffect(() => {
    if (playKey === undefined || reducedMotion) return;
    setFrameIndex(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < FRAMES.length; i++) {
      timers.push(setTimeout(() => setFrameIndex(i), i * FRAME_MS));
    }
    return () => timers.forEach(clearTimeout);
  }, [playKey, reducedMotion]);

  const frame = reducedMotion ? SETTLED : (FRAMES[frameIndex] ?? SETTLED);
  const settled = frameIndex === FRAMES.length - 1;

  return (
    <div className={cn('min-w-0 max-w-full font-mono text-[12px]', className)}>
      <p className="mb-2 tracking-wide text-m-ink/48">[ EXPLAINER ]</p>
      <div className="w-full max-w-full min-w-0 overflow-x-auto">
        <div className="grid grid-cols-4 gap-px overflow-hidden rounded-card border border-m-border-muted bg-m-border-muted">
          {TIERS.map((tier, i) => {
            const row = frame.rows[i] ?? { label: tier, status: null, glyph: null };
            return (
              <div key={tier} className="min-w-0 overflow-hidden bg-m-surface px-1 py-2 sm:px-3 sm:py-2.5">
                <p className="truncate text-[10px] text-m-ink/40 sm:text-[12px]">{tier}</p>
                <p
                  className={cn(
                    'mt-1 flex flex-wrap items-baseline gap-x-1 gap-y-0.5 break-words text-[10px] sm:text-[12px]',
                    settled && row.glyph === '●' && tier !== 'lightpanda' && 'text-m-ink/32 line-through',
                    settled && row.label === 'lightpanda' && 'text-m-ink',
                    !settled && 'text-m-ink/72',
                  )}
                >
                  {row.glyph && <span aria-hidden>{row.glyph}</span>}
                  <span>{row.status ?? '—'}</span>
                </p>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 min-h-[1.2em] text-m-ink/56" role="status">
        {frame.reason}
      </p>
      <p className="mt-3 text-m-ink/32">
        ● attempted · ○ skipped · ▸ in flight · · not yet reached
      </p>
    </div>
  );
}
