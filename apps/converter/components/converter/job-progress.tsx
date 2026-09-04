'use client';

import { PillButton } from '@/components/ui/pill-button';
import { formatEta } from '@/lib/jobs/types';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

type Props = {
  phase: 'uploading' | 'queued' | 'running' | 'done';
  pct: number;
  uploadPct: number;
  eta: number | null;
  fps: number | null;
  fileName: string;
  cancelling?: boolean;
  onCancel: () => void;
};

export function JobProgress({ phase, pct, uploadPct, eta, fps, fileName, cancelling = false, onCancel }: Props) {
  const value = phase === 'uploading' ? uploadPct : phase === 'queued' ? 0 : pct;
  const text =
    phase === 'uploading'
      ? `Uploading ${uploadPct}%`
      : phase === 'queued'
        ? 'Queued'
        : phase === 'done'
          ? 'Done'
          : `${pct}%`;

  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label={`${phase === 'uploading' ? 'Upload' : 'Conversion'} progress for ${fileName}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={text}
        className="relative h-1.5 flex-1 overflow-hidden rounded-pill bg-p-code"
      >
        <div
          className={cx(
            // clip-path rather than width: this updates on every SSE frame, and
            // width is a layout property. Same approach as .pill-fill.
            'absolute inset-y-0 left-0 rounded-pill transition-[clip-path] duration-150',
            phase === 'running' ? 'stripe-bar' : 'bg-blue',
            phase === 'queued' ? 'animate-blink w-2' : 'w-full',
          )}
          style={
            phase === 'queued'
              ? undefined
              : { clipPath: `inset(0 ${100 - Math.max(0, Math.min(100, value))}% 0 0)` }
          }
        />
      </div>
      <span className="w-[4.5rem] shrink-0 text-right font-mono text-sm tabular-nums text-p-ink-2">{text}</span>
      <span className="hidden w-16 shrink-0 font-mono text-xs tabular-nums text-p-ink-3 sm:inline">
        {phase === 'running' ? formatEta(eta) : ''}
        {phase === 'running' && fps !== null ? ` · ${fps}fps` : ''}
      </span>
      {phase !== 'done' && (
        <PillButton
          variant="ghost"
          size="md"
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          aria-label={`Cancel ${fileName}`}
        >
          {cancelling ? 'Cancelling' : 'Cancel'}
        </PillButton>
      )}
    </div>
  );
}
