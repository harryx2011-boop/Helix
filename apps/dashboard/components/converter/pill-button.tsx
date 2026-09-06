'use client';

import * as React from 'react';
import { useReducedMotion } from '@/lib/converter/theme';

export type PillVariant = 'primary' | 'ink' | 'secondary' | 'ghost';
export type PillSize = 'sm' | 'md' | 'lg';
export type PillState = 'idle' | 'queued' | 'running' | 'done';

export interface PillButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PillVariant;
  size?: PillSize;
  /** Role layer. Only `primary` renders it; other variants ignore it. */
  state?: PillState;
  /** 0–100. Read while `state === 'running'`. */
  progress?: number;
  /** Idle sheen. Opt-in: one primary button per screen, and the consumer picks which. */
  sheen?: boolean;
}

const base =
  'pill-btn inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ' +
  '[&_svg]:pointer-events-none [&_svg]:shrink-0';

const variants: Record<PillVariant, string> = {
  primary: 'bg-blue text-[var(--p-on-blue)] hover:bg-blue-hover',
  // Marketing's call to action. Blue is reserved for actions inside the app
  // (PERSONA.md §2), so the page-level CTA is ink rather than a second blue.
  ink: 'bg-p-ink text-p-bg hover:shadow-card',
  secondary: 'border border-p-line bg-p-surface text-p-ink hover:border-p-line-2 hover:bg-p-code',
  ghost: 'bg-transparent text-p-ink-2 hover:bg-p-code hover:text-p-ink',
};

const sizes: Record<PillSize, string> = {
  sm: 'h-9 px-3.5 text-sm [&_svg]:size-4',
  md: 'h-11 px-5 text-sm [&_svg]:size-4',
  lg: 'h-12 px-6 text-base [&_svg]:size-5',
};

/** Class string for anchors and other non-button pills. */
export function pillButtonClass(opts: { variant?: PillVariant; size?: PillSize; className?: string } = {}): string {
  const { variant = 'secondary', size = 'md', className } = opts;
  return [base, variants[variant], sizes[size], className].filter(Boolean).join(' ');
}

export const PillButton = React.forwardRef<HTMLButtonElement, PillButtonProps>(function PillButton(
  {
    variant = 'secondary',
    size = 'md',
    state = 'idle',
    progress = 0,
    sheen = false,
    className,
    children,
    style,
    type = 'button',
    ...props
  },
  ref,
) {
  const reduced = useReducedMotion();
  const isPrimary = variant === 'primary';
  const roleState: PillState = isPrimary ? state : 'idle';
  const hasFill = isPrimary && (state === 'running' || state === 'done');
  const busy = isPrimary && (state === 'queued' || state === 'running');
  const pct = Math.min(100, Math.max(0, Math.round(progress)));

  const mergedStyle = hasFill ? ({ ...style, '--progress': pct } as React.CSSProperties) : style;

  return (
    <button
      ref={ref}
      type={type}
      data-variant={variant}
      data-size={size}
      data-state={roleState}
      data-sheen={isPrimary && sheen && !reduced && state === 'idle' ? 'true' : undefined}
      aria-busy={busy || undefined}
      className={pillButtonClass({ variant, size, ...(className ? { className } : {}) })}
      style={mergedStyle}
      {...props}
    >
      {hasFill ? <span aria-hidden="true" className="pill-fill stripe-bar" /> : null}
      {children}
    </button>
  );
});
