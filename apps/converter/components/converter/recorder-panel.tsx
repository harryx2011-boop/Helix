'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, Download, Mic, MicOff, Pause, Play, Square, Trash2, Video } from 'lucide-react';
import { PillButton } from '@/components/ui/pill-button';
import { getRecordingBlob, type RecordingMeta } from '@/lib/recordings/db';
import {
  MAX_DURATION_MS,
  WARN_AT_MS,
  recordingSupported,
  startRecording,
  type RecorderHandle,
  type RecorderState,
} from '@/lib/recordings/recorder';
import { formatDuration, useRecordings } from '@/lib/recordings/store';
import { formatBytes } from '@/lib/formats';
import { TrimDialog } from './trim-dialog';

/**
 * Screen recorder.
 *
 * Everything here runs in the tab: the capture, the encoding, the storage. The
 * only thing that leaves is a file the user chooses to save, and that goes to
 * their own disk.
 */
export function RecorderPanel() {
  const { recordings, storage, loading, error, refresh, remove } = useRecordings();
  const [supported, setSupported] = useState<boolean | undefined>(undefined);
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [microphone, setMicrophone] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [trimming, setTrimming] = useState<RecordingMeta | undefined>(undefined);
  const handleRef = useRef<RecorderHandle | null>(null);

  // Probed after mount: `recordingSupported` reads navigator and MediaRecorder,
  // neither of which exists during the server render.
  useEffect(() => {
    setSupported(recordingSupported());
  }, []);

  // A recording in progress is the one thing on this page worth interrupting a
  // navigation for — the chunks are saved, but the tab closing ends the capture.
  useEffect(() => {
    if (state !== 'recording' && state !== 'paused') return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [state]);

  const begin = useCallback(async () => {
    setNotice(undefined);
    try {
      handleRef.current = await startRecording(
        { microphone },
        {
          onTick: setElapsed,
          onState: setState,
          onError: setNotice,
          onDone: () => {
            setElapsed(0);
            void refresh();
          },
        },
      );
    } catch (cause) {
      // A cancelled picker is the ordinary way to change your mind, not a fault.
      if (cause instanceof DOMException && cause.name === 'NotAllowedError') return;
      setNotice(cause instanceof Error ? cause.message : 'The recording could not start.');
    }
  }, [microphone, refresh]);

  const download = useCallback(async (meta: RecordingMeta) => {
    const blob = await getRecordingBlob(meta.id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${meta.title.replace(/[^\w.-]+/g, '-')}.webm`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const recording = state === 'recording' || state === 'paused';
  const remaining = MAX_DURATION_MS - elapsed;
  const nearLimit = elapsed >= WARN_AT_MS;

  if (supported === false) {
    return (
      <div className="rounded-card border border-p-line bg-p-surface p-6">
        <h2 className="text-h3 font-semibold text-p-ink">Recording is not available here</h2>
        <p className="mt-2 max-w-[60ch] text-body text-p-ink-2">
          This browser does not offer screen capture, or does not support any video encoding this
          page can use. Chrome, Edge and Firefox on a desktop all do.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-card border border-p-line bg-p-surface p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span
              aria-hidden
              className={[
                'flex size-12 items-center justify-center rounded-full',
                recording ? 'bg-red-500/12 text-red-500' : 'bg-p-code text-p-ink-3',
              ].join(' ')}
            >
              {state === 'recording' ? (
                <Circle className="size-5 animate-pulse fill-current motion-reduce:animate-none" />
              ) : (
                <Video className="size-5" />
              )}
            </span>
            <div>
              <p
                className="font-mono text-h2 tabular-nums text-p-ink"
                aria-live={nearLimit ? 'polite' : 'off'}
              >
                {formatDuration(elapsed)}
              </p>
              <p className="text-caption text-p-ink-3">
                {state === 'saving'
                  ? 'Saving…'
                  : nearLimit && recording
                    ? `${formatDuration(remaining)} left of the 30 minute limit`
                    : recording
                      ? 'Recording to this browser only'
                      : 'Up to 30 minutes'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!recording && (
              <button
                type="button"
                onClick={() => setMicrophone((on) => !on)}
                aria-pressed={microphone}
                className="inline-flex h-11 items-center gap-2 rounded-pill border border-p-line px-4 text-sm font-medium text-p-ink transition-colors duration-150 ease-out hover:bg-p-code active:scale-[0.98]"
              >
                {microphone ? <Mic className="size-4" /> : <MicOff className="size-4 text-p-ink-3" />}
                {microphone ? 'Mic on' : 'Mic off'}
              </button>
            )}

            {recording && (
              <PillButton
                variant="secondary"
                size="md"
                onClick={() =>
                  state === 'paused' ? handleRef.current?.resume() : handleRef.current?.pause()
                }
              >
                {state === 'paused' ? <Play className="size-4" /> : <Pause className="size-4" />}
                {state === 'paused' ? 'Resume' : 'Pause'}
              </PillButton>
            )}

            <PillButton
              variant="primary"
              size="md"
              disabled={state === 'saving' || supported === undefined}
              onClick={() => (recording ? handleRef.current?.stop() : void begin())}
            >
              {recording ? <Square className="size-4" /> : <Circle className="size-4 fill-current" />}
              {recording ? 'Stop' : 'Record screen'}
            </PillButton>
          </div>
        </div>

        {notice && (
          <p role="status" className="mt-4 text-caption text-p-ink-2">
            {notice}
          </p>
        )}
      </section>

      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-h3 font-semibold text-p-ink">Recordings</h2>
            <p className="mt-1 max-w-[56ch] text-caption text-p-ink-3">
              Stored in this browser, on this device. They survive a reload; clearing site data
              removes them.
            </p>
          </div>
          {storage && (
            <p className="shrink-0 font-mono text-caption text-p-ink-3">
              {formatBytes(storage.usageBytes)} used
            </p>
          )}
        </div>

        <div className="mt-6" aria-live="polite">
          {loading && (
            <ul className="space-y-3" aria-label="Loading recordings">
              {[0, 1].map((i) => (
                <li key={i} className="shimmer h-20 rounded-card" />
              ))}
            </ul>
          )}

          {error && !loading && (
            <p className="rounded-card border border-p-line bg-p-surface p-6 text-body text-p-ink-2">
              {error}
            </p>
          )}

          {!loading && !error && recordings.length === 0 && (
            <p className="rounded-card border border-dashed border-p-line p-8 text-center text-body text-p-ink-3">
              Nothing recorded yet.
            </p>
          )}

          <ul className="space-y-3">
            {recordings.map((meta) => (
              <li
                key={meta.id}
                className="flex flex-col gap-3 rounded-card border border-p-line bg-p-surface p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-p-ink">{meta.title}</p>
                  <p className="mt-0.5 font-mono text-caption text-p-ink-3">
                    {formatDuration(meta.durationMs)} · {formatBytes(meta.sizeBytes)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <PillButton variant="secondary" size="sm" onClick={() => setTrimming(meta)}>
                    Trim &amp; export
                  </PillButton>
                  <PillButton variant="ghost" size="sm" onClick={() => void download(meta)}>
                    <Download className="size-4" />
                    Save
                  </PillButton>
                  <PillButton
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${meta.title}`}
                    onClick={() => void remove(meta.id)}
                  >
                    <Trash2 className="size-4" />
                  </PillButton>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {trimming && (
        <TrimDialog
          recording={trimming}
          onClose={() => setTrimming(undefined)}
          onSaved={() => {
            setTrimming(undefined);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
