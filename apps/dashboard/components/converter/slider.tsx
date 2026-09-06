'use client';

import * as React from 'react';
import { useReducedMotion } from '@/lib/converter/theme';

type LabelProps =
  | { 'aria-label': string; 'aria-labelledby'?: never }
  | { 'aria-labelledby': string; 'aria-label'?: never };

export type SliderProps = LabelProps & {
  value: number;
  onChange: (value: number) => void;
  /** Fires once on pointer release or after a keyboard adjustment settles. */
  onValueCommit?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Bubble text and aria-valuetext. Defaults to the bare number. */
  formatValue?: (value: number) => string;
  disabled?: boolean;
  id?: string;
  className?: string;
};

const BUBBLE_LINGER_MS = 600;

function clampToStep(raw: number, min: number, max: number, step: number): number {
  const stepped = Math.round((raw - min) / step) * step + min;
  const decimals = (step.toString().split('.')[1] ?? '').length;
  return Math.min(max, Math.max(min, Number(stepped.toFixed(decimals))));
}

export function Slider({
  value,
  onChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  formatValue,
  disabled = false,
  id,
  className,
  ...labelProps
}: SliderProps) {
  const reduced = useReducedMotion();
  const trackRef = React.useRef<HTMLDivElement>(null);
  const thumbRef = React.useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [keying, setKeying] = React.useState(false);
  const lingerTimer = React.useRef<number | null>(null);

  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const text = formatValue ? formatValue(value) : String(value);
  const bubbleVisible = dragging || keying;

  React.useEffect(
    () => () => {
      if (lingerTimer.current !== null) window.clearTimeout(lingerTimer.current);
    },
    [],
  );

  const valueFromPointer = React.useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return value;
      const rect = track.getBoundingClientRect();
      const ratio = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width;
      return clampToStep(min + ratio * (max - min), min, max, step);
    },
    [value, min, max, step],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    thumbRef.current?.focus({ preventScroll: true });
    setDragging(true);
    const next = valueFromPointer(e.clientX);
    if (next !== value) onChange(next);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const next = valueFromPointer(e.clientX);
    if (next !== value) onChange(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    onValueCommit?.(valueFromPointer(e.clientX));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const big = step * 10;
    let next: number;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = value + (e.shiftKey ? big : step);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = value - (e.shiftKey ? big : step);
        break;
      case 'PageUp':
        next = value + big;
        break;
      case 'PageDown':
        next = value - big;
        break;
      case 'Home':
        next = min;
        break;
      case 'End':
        next = max;
        break;
      default:
        return;
    }
    e.preventDefault();
    const clamped = clampToStep(next, min, max, step);
    if (clamped !== value) onChange(clamped);
    setKeying(true);
    if (lingerTimer.current !== null) window.clearTimeout(lingerTimer.current);
    lingerTimer.current = window.setTimeout(
      () => {
        setKeying(false);
        onValueCommit?.(clamped);
      },
      reduced ? 0 : BUBBLE_LINGER_MS,
    );
  };

  return (
    <div
      ref={trackRef}
      className={[
        'relative flex h-11 w-full items-center',
        disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="relative h-1.5 w-full rounded-pill bg-p-code">
        <div className="absolute inset-y-0 left-0 rounded-pill bg-blue" style={{ width: `${pct}%` }} />
      </div>
      <div
        ref={thumbRef}
        id={id}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={text}
        aria-disabled={disabled || undefined}
        aria-orientation="horizontal"
        {...labelProps}
        onKeyDown={onKeyDown}
        className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-pill border border-p-line-2 bg-white shadow-card-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
        style={{ left: `${pct}%` }}
      >
        <span
          aria-hidden="true"
          data-visible={bubbleVisible ? 'true' : 'false'}
          className="slider-bubble pointer-events-none absolute bottom-full left-1/2 mb-2 whitespace-nowrap rounded-pill bg-p-ink px-2 py-0.5 font-mono text-caption text-p-bg"
        >
          {text}
        </span>
      </div>
    </div>
  );
}
