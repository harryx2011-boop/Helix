'use client';

import * as React from 'react';
import { useReducedMotion } from '@/components/marketing/ambient';
import { cn } from '@/lib/utils';

/**
 * Vulcan's mark: one bold flame, flat gradient fill, no outline. The static
 * frame serves every icon size; `animated` adds a slow path morph and a glow
 * pulse for header size only, an ambient loop rather than a state transition.
 * Reduced motion freezes it to the static frame.
 */

const REST =
  'M14.2 1.6C14.2 5.8 18.8 8.4 19.2 13.4C19.6 18.4 16.4 22.6 12 22.6C7.4 22.6 4.2 19.4 4.4 15C4.5 12.4 5.8 10.6 7 8.8C7.2 10.6 8.2 11.8 9.6 12C8.2 9.4 9.8 5.4 14.2 1.6Z';
const SWAY =
  'M15.2 2.4C14.6 6.2 18.6 8.8 19.2 13.6C19.6 18.4 16.4 22.6 12 22.6C7.4 22.6 4.2 19.4 4.4 15C4.5 12.6 5.4 10.2 6.4 8.2C7 10.4 8.4 11.6 9.8 11.8C8 9.2 10.4 5.6 15.2 2.4Z';

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
        <linearGradient id={`${id}-g`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#e5372b" />
          <stop offset="1" stopColor="#ff9a1f" />
        </linearGradient>
        {live && (
          <filter id={`${id}-b`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        )}
      </defs>
      {live && (
        <path d={REST} fill="#ff6a1f" filter={`url(#${id}-b)`} opacity="0.35">
          <animate attributeName="opacity" values="0.25;0.5;0.25" dur="3.2s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
        </path>
      )}
      <path d={REST} fill={`url(#${id}-g)`}>
        {live && (
          <animate attributeName="d" values={`${REST};${SWAY};${REST}`} dur="2.6s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
        )}
      </path>
    </svg>
  );
}
