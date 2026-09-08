'use client';

import * as React from 'react';
import { useReducedMotion } from '@/components/marketing/ambient';
import { cn } from '@/lib/utils';

/**
 * Vulcan's mark: a forge flame with three tongues and an amber core, flat
 * gradient fills, no outline. The static frame serves every icon size;
 * `animated` adds two slow path morphs on different periods (outer 2.8 s, core
 * 1.9 s) and a glow pulse for header size only, an ambient loop rather than a
 * state transition. Reduced motion freezes it to the static frame.
 */

const OUTER =
  'M12.2 1.2C11.6 5.2 14.6 7.6 15.2 10.4C15.4 8.9 16.2 7.9 17.4 7.2C17 9.6 19.6 11.4 19.6 15C19.6 19.4 16.2 22.6 12 22.6C7.6 22.6 4.4 19.4 4.4 15.2C4.4 12.4 5.8 10.4 7 8.6C7.1 10.4 8 11.7 9.6 12.1C8.2 9.2 9.6 5 12.2 1.2Z';
const OUTER_SWAY =
  'M13 2C11.9 5.6 14.8 7.8 15.3 10.6C15.6 9.2 16.6 8.4 17.9 7.9C17.3 10.1 19.6 11.6 19.6 15C19.6 19.4 16.2 22.6 12 22.6C7.6 22.6 4.4 19.4 4.4 15.2C4.4 12.5 5.4 10.2 6.5 8C6.8 10 7.9 11.6 9.5 12C8 9.4 10 5.4 13 2Z';
const CORE =
  'M12.6 12C13.6 14 15.5 15.2 15.5 17.5C15.5 19.7 13.9 21.1 12 21.1C10 21.1 8.5 19.7 8.5 17.6C8.5 16.3 9.1 15.3 9.9 14.4C10 15.4 10.6 16.1 11.4 16.3C11 14.7 11.7 13.3 12.6 12Z';
const CORE_SWAY =
  'M12.1 12.6C13.3 14.4 15.5 15.4 15.5 17.6C15.5 19.8 13.9 21.1 12 21.1C10 21.1 8.5 19.7 8.5 17.6C8.5 16.2 9.3 15 10.2 14.1C10.2 15.2 10.7 16 11.5 16.2C11 14.9 11.4 13.8 12.1 12.6Z';

const EASE = { calcMode: 'spline', keySplines: '0.4 0 0.6 1;0.4 0 0.6 1' } as const;

interface VulcanFlameProps {
  className?: string;
  animated?: boolean;
  /** Accepted so the mark can stand in for a Lucide icon; a filled glyph has no stroke. */
  strokeWidth?: number;
}

export function VulcanFlame({ className, animated = false }: VulcanFlameProps) {
  const id = React.useId();
  const reduced = useReducedMotion();
  const live = animated && !reduced;

  return (
    <svg viewBox="0 0 24 24" className={cn('shrink-0 overflow-visible', className)} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-o`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#c8281c" />
          <stop offset="0.55" stopColor="#ff5a1f" />
          <stop offset="1" stopColor="#ff9a2e" />
        </linearGradient>
        <linearGradient id={`${id}-c`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffb03a" />
          <stop offset="1" stopColor="#ffe7a8" />
        </linearGradient>
        {live && (
          <filter id={`${id}-b`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        )}
      </defs>
      {live && (
        <path d={OUTER} fill="#ff6a1f" filter={`url(#${id}-b)`} opacity="0.35">
          <animate attributeName="opacity" values="0.25;0.5;0.25" dur="3.2s" repeatCount="indefinite" {...EASE} />
        </path>
      )}
      <path d={OUTER} fill={`url(#${id}-o)`}>
        {live && <animate attributeName="d" values={`${OUTER};${OUTER_SWAY};${OUTER}`} dur="2.8s" repeatCount="indefinite" {...EASE} />}
      </path>
      <path d={CORE} fill={`url(#${id}-c)`}>
        {live && <animate attributeName="d" values={`${CORE};${CORE_SWAY};${CORE}`} dur="1.9s" repeatCount="indefinite" {...EASE} />}
      </path>
    </svg>
  );
}
