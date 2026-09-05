'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { PillButton } from '@/components/ui/pill-button';
import { submitEngineJob, type JobHandle } from '@/lib/engine';
import { getRecordingBlob, type RecordingMeta } from '@/lib/recordings/db';
import { formatDuration } from '@/lib/recordings/store';
import { formatBytes } from '@/lib/formats';

type Target = 'mp4' | 'gif';

/**
 * Shortest selection the handles may produce.
 *
 * The two handles must not meet: an equal start and end is a zero-length clip,
 * which ffmpeg accepts and answers with an empty file. A tenth of a second is
 * also the slider's own step, so the clamp never fights the input's rounding.
 */
const MIN_SELECTION_SEC = 0.1;

/** Slider values carry float error at a tenth-second step; round before comparing. */
const toStep = (seconds: number): number => Math.round(seconds * 10) / 10;

interface TrimDialogProps {
  recording: RecordingMeta;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Trim a recording and hand it to the converter.
 *
 * The recorder writes WebM because that is what `MediaRecorder` encodes; most
 * places someone wants to put a screen capture take MP4. Rather than a second
 * encoder, the trimmed range goes through `submitEngineJob` — the same ffmpeg
 * worker the rest of the app uses, with `trim` already in `ConvertOptions`.
 */
export function TrimDialog({ recording, onClose, onSaved }: TrimDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const jobRef = useRef<JobHandle | null>(null);

  const durationSec = recording.durationMs / 1000;
  const [sourceUrl, setSourceUrl] = useState<string | undefined>(undefined);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(durationSec);
  const [target, setTarget] = useState<Target>('mp4');
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<{ url: string; size: number } | undefined>(undefined);

  useEffect(() => {
    let url: string | undefined;
    void getRecordingBlob(recording.id).then((blob) => {
      if (!blob) {
        setError('That recording is no longer in this browser.');
        return;
      }
      url = URL.createObjectURL(blob);
      setSourceUrl(url);
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [recording.id]);

  /**
   * The converted file's blob URL is owned by this dialog and released when it
   * closes, rather than leaking for the tab's lifetime.
   *
   * Held in a ref rather than read from state in the cleanup: with `result` in
   * the dependency array, setting it re-runs the effect, and the *previous*
   * cleanup revokes the URL that was just created — leaving the Save link
   * pointing at nothing.
   */
  const resultUrlRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    return () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      jobRef.current?.cancel();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const seek = useCallback((seconds: number) => {
    if (videoRef.current) videoRef.current.currentTime = seconds;
  }, []);

  const run = useCallback(async () => {
    setError(undefined);
    setProgress(0);

    const blob = await getRecordingBlob(recording.id);
    if (!blob) {
      setError('That recording is no longer in this browser.');
      setProgress(undefined);
      return;
    }

    const file = new File([blob], `${recording.id}.webm`, { type: recording.mimeType });
    const trim = { start, end };

    const job =
      target === 'gif'
        ? submitEngineJob({ op: 'gif', file, fps: 12, width: 640, options: { trim } })
        : submitEngineJob({ op: 'convert', file, to: 'mp4', options: { trim } });

    jobRef.current = job;
    job.onProgress((frame) => {
      if (frame.status === 'running') setProgress(frame.pct);
    });

    try {
      const done = await job.promise;
      resultUrlRef.current = done.url;
      setResult(done);
      setProgress(undefined);
    } catch (cause) {
      setProgress(undefined);
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : 'The export failed.');
    }
  }, [recording.id, recording.mimeType, start, end, target]);

  const trimmedSec = Math.max(0, end - start);
  const busy = progress !== undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-p-ink/40 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Trim ${recording.title}`}
        tabIndex={-1}
        className="w-full max-w-2xl rounded-panel border border-p-line bg-p-bg p-6 shadow-card outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-h3 font-semibold text-p-ink">{recording.title}</h2>
            <p className="mt-1 font-mono text-caption text-p-ink-3">
              {formatDuration(recording.durationMs)} · {formatBytes(recording.sizeBytes)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="flex size-9 shrink-0 items-center justify-center rounded-pill text-p-ink-3 transition-colors duration-150 ease-out hover:bg-p-code hover:text-p-ink disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </div>

        {sourceUrl && (
          <video
            ref={videoRef}
            src={sourceUrl}
            controls
            className="mt-5 w-full rounded-card bg-p-code"
          />
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-caption font-medium text-p-ink-2">
              Start <span className="font-mono text-p-ink-3">{formatDuration(start * 1000)}</span>
            </span>
            <input
              type="range"
              min={0}
              max={durationSec}
              step={0.1}
              value={start}
              disabled={busy}
              onChange={(event) => {
                // The handles cannot cross or meet: an inverted range gives
                // ffmpeg a negative duration and an equal one gives it zero,
                // and both fail late rather than at the control.
                const next = toStep(Math.min(Number(event.target.value), end - MIN_SELECTION_SEC));
                const clamped = Math.max(0, next);
                setStart(clamped);
                seek(clamped);
              }}
              className="accent-blue"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-caption font-medium text-p-ink-2">
              End <span className="font-mono text-p-ink-3">{formatDuration(end * 1000)}</span>
            </span>
            <input
              type="range"
              min={0}
              max={durationSec}
              step={0.1}
              value={end}
              disabled={busy}
              onChange={(event) => {
                const next = toStep(Math.max(Number(event.target.value), start + MIN_SELECTION_SEC));
                const clamped = Math.min(durationSec, next);
                setEnd(clamped);
                seek(clamped);
              }}
              className="accent-blue"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {(['mp4', 'gif'] as const).map((format) => (
              <button
                key={format}
                type="button"
                aria-pressed={target === format}
                disabled={busy}
                onClick={() => setTarget(format)}
                className={[
                  'inline-flex h-9 items-center rounded-pill border px-4 text-sm font-medium transition-colors duration-150 ease-out',
                  target === format
                    ? 'border-blue bg-blue/10 text-p-ink'
                    : 'border-p-line text-p-ink-2 hover:bg-p-code',
                ].join(' ')}
              >
                {format.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="font-mono text-caption text-p-ink-3">
            {formatDuration(trimmedSec * 1000)} selected
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-caption text-p-ink-2">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {result ? (
            <>
              <PillButton variant="secondary" size="md" onClick={onSaved}>
                Done
              </PillButton>
              <a
                href={result.url}
                download={`${recording.title.replace(/[^\w.-]+/g, '-')}.${target}`}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-pill bg-blue px-5 text-sm font-medium text-[var(--p-on-blue)] transition-colors duration-150 ease-out hover:bg-blue-hover"
              >
                Save {formatBytes(result.size)}
              </a>
            </>
          ) : (
            <PillButton
              variant="primary"
              size="md"
              state={busy ? 'running' : 'idle'}
              progress={progress ?? 0}
              disabled={busy || !sourceUrl || trimmedSec < MIN_SELECTION_SEC}
              onClick={() => void run()}
            >
              {busy ? `Exporting ${Math.round(progress ?? 0)}%` : `Export ${target.toUpperCase()}`}
            </PillButton>
          )}
        </div>
      </div>
    </div>
  );
}
