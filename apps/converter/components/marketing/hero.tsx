'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, FileWarning, Upload } from 'lucide-react';
import { PillButton } from '@/components/ui/pill-button';
import { prefersReducedMotion } from '@/lib/theme';
import {
  ACCEPTED_EXTS,
  KIND_LABELS,
  MAX_FILE_BYTES,
  extensionOf,
  formatBytes,
  kindOfFile,
  type FormatKind,
} from '@/lib/formats';

/**
 * In-memory handoff from the hero dropzone to /convert. A File cannot travel
 * through a URL or storage, and client-side navigation keeps this module alive.
 * The converter calls takeHeroFile() once on mount; a hard reload yields null.
 */
let heroFile: File | null = null;

export function stashHeroFile(file: File): void {
  heroFile = file;
}

export function takeHeroFile(): File | null {
  const f = heroFile;
  heroFile = null;
  return f;
}

type DropState =
  | { phase: 'idle' }
  | { phase: 'over' }
  | { phase: 'ready'; file: File; kind: FormatKind }
  | { phase: 'rejected'; reason: string };

const ACCEPT = ACCEPTED_EXTS.map((e) => `.${e}`).join(',');

/** Live mini-converter. Drop a real file, it lands in a row, then /convert opens with it. */
export function Hero() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  const [state, setState] = useState<DropState>({ phase: 'idle' });

  useEffect(() => {
    router.prefetch('/convert');
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [router]);

  const accept = useCallback(
    (file: File) => {
      const kind = kindOfFile(file.name);
      if (!kind) {
        const ext = extensionOf(file.name);
        setState({
          phase: 'rejected',
          reason: ext
            ? `.${ext} is not something we convert. Video, audio, image or GIF files only.`
            : 'That file has no extension, so we cannot tell what it is.',
        });
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setState({ phase: 'rejected', reason: `${formatBytes(file.size)} is over the 5 GB limit.` });
        return;
      }
      stashHeroFile(file);
      setState({ phase: 'ready', file, kind });
      const hold = prefersReducedMotion() ? 0 : 520;
      timerRef.current = window.setTimeout(() => router.push('/convert'), hold);
    },
    [router],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) accept(file);
    else setState({ phase: 'idle' });
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (state.phase === 'idle' || state.phase === 'rejected') setState({ phase: 'over' });
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    if (state.phase === 'over') setState({ phase: 'idle' });
  };

  const openPicker = () => inputRef.current?.click();

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  };

  const over = state.phase === 'over';
  const ready = state.phase === 'ready';

  return (
    <section className="relative overflow-hidden grid-glow">
      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
        <div className="mx-auto max-w-2xl text-center">
          <h1
            className="text-[36px] font-semibold leading-[1.04] tracking-[-0.02em] text-p-ink sm:text-[56px]"
            style={{ textWrap: 'balance' }}
          >
            Convert video, audio and images. Up to 5 GB a file.
          </h1>
          <p className="mx-auto mt-5 max-w-[56ch] text-[17px] leading-relaxed text-p-ink-2">
            Drop a file below and it opens in the converter with the right options already picked.
            Sixty-three conversions and six compressors, run by ffmpeg and libvips on your own
            machine. Every one of them is also an API call.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-xl">
          <div
            role="button"
            tabIndex={0}
            aria-label="Drop a file here, or press Enter to choose one"
            aria-describedby="hero-drop-hint"
            onClick={state.phase === 'ready' ? undefined : openPicker}
            onKeyDown={onKeyDown}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={onDragLeave}
            data-state={state.phase}
            className={`relative cursor-pointer rounded-panel border bg-p-surface p-6 text-left shadow-card transition-[transform,border-color,background-color,box-shadow] duration-[180ms] ease-out sm:p-8 ${
              over
                ? '-translate-y-1 border-solid border-blue bg-blue-soft shadow-panel'
                : 'border-dashed border-p-line-2 hover:border-p-line-2 hover:shadow-panel'
            } ${ready ? 'border-solid border-p-line' : ''}`}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) accept(f);
                e.target.value = '';
              }}
            />

            {(state.phase === 'idle' || state.phase === 'over') && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <span
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-pill transition-colors duration-150 ease-out ${
                    over ? 'bg-blue text-white' : 'bg-p-code text-p-ink-2'
                  }`}
                >
                  <Upload className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="text-[16px] font-medium text-p-ink">
                  {over ? 'Let go to convert it' : 'Drop a file here'}
                </p>
                <p id="hero-drop-hint" className="text-[13px] text-p-ink-3">
                  Video, audio, image or GIF. Up to 5 GB. Output is kept for one hour.
                </p>
                <PillButton
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    openPicker();
                  }}
                >
                  Choose a file
                </PillButton>
              </div>
            )}

            {state.phase === 'ready' && (
              <div className="animate-fade-up" aria-live="polite">
                <div className="flex items-center justify-between gap-4 rounded-card border border-p-line bg-p-bg px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-p-ink">{state.file.name}</p>
                    <p className="mt-0.5 font-mono text-[12px] text-p-ink-3">
                      {KIND_LABELS[state.kind]} · {formatBytes(state.file.size)}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-blue-soft px-3 py-1 text-[13px] font-medium text-blue">
                    Opening
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-pill bg-p-code">
                  <div className="stripe-bar h-full w-1/3 rounded-pill" />
                </div>
              </div>
            )}

            {state.phase === 'rejected' && (
              <div className="flex flex-col items-center gap-3 py-2 text-center" role="alert">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-pill bg-p-code text-destructive">
                  <FileWarning className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="text-[15px] font-medium text-p-ink">{state.reason}</p>
                <PillButton
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    setState({ phase: 'idle' });
                    openPicker();
                  }}
                >
                  Try another file
                </PillButton>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/convert"
              className="inline-flex h-11 items-center gap-1.5 rounded-pill bg-p-ink px-6 text-[14px] font-medium text-p-bg transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-card active:scale-[0.98]"
            >
              Open the converter
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/api-docs"
              className="inline-flex h-11 items-center rounded-pill border border-p-line-2 px-6 text-[14px] font-medium text-p-ink transition-colors duration-150 ease-out hover:bg-p-code active:scale-[0.98]"
            >
              Read the API
            </Link>
          </div>
          <p className="mt-4 text-center text-[13px] text-p-ink-3">Sign in with your Helix account to run a job.</p>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-p-bg" />
    </section>
  );
}
