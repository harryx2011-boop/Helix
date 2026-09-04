'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { mulberry32, useInView, useReducedMotion } from './ambient';

/*
 * ScrollStrip: one thin line of wire-format tokens between sections whose
 * horizontal offset is the strip's own scroll progress through the viewport,
 * so the page's motion is the only clock. Same contract as the ambient
 * primitives: seeded first paint, rAF-throttled, idle off-screen, static
 * under reduced motion.
 */

const STRIP_TOKENS = ['{', '}', '[ ]', '"url":', '200', '->', '0x1f', '·', ':', '=', '"tier":', 'POST', '/v1/scrape', '"markdown"', 'true'];
const TOKEN_COUNT = 160;
/** Total horizontal travel across the strip's pass through the viewport, in px. */
const TRAVEL = 200;

function buildStream(seed: number): string {
  const rng = mulberry32(seed);
  return Array.from({ length: TOKEN_COUNT }, () => STRIP_TOKENS[Math.floor(rng() * STRIP_TOKENS.length)]!).join('   ');
}

export interface ScrollStripProps {
  seed?: number;
  direction?: 'left' | 'right';
  className?: string;
}

export function ScrollStrip({ seed = 3, direction = 'left', className }: ScrollStripProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const stream = React.useMemo(() => buildStream(seed), [seed]);

  React.useEffect(() => {
    const el = ref.current;
    const track = trackRef.current;
    if (!el || !track) return;
    if (reduced) {
      track.style.transform = `translateX(${-TRAVEL / 2}px)`;
      return;
    }
    if (!inView) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh - rect.top) / (vh + rect.height)));
      const x = direction === 'left' ? -p * TRAVEL : -TRAVEL + p * TRAVEL;
      track.style.transform = `translateX(${x.toFixed(1)}px)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [reduced, inView, direction]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn('pointer-events-none h-7 select-none overflow-hidden', className)}
    >
      <div
        ref={trackRef}
        className="flex h-full w-max items-center whitespace-pre font-mono text-[11px] leading-none text-m-ink/24 will-change-transform"
      >
        {stream}
      </div>
    </div>
  );
}
