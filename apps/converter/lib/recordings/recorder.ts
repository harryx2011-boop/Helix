'use client';

import { appendChunk, createRecording, finalizeRecording, type RecordingMeta } from './db';

/**
 * Screen recording, entirely in the tab.
 *
 * `getDisplayMedia` for the screen, optionally a microphone track mixed in
 * through Web Audio, `MediaRecorder` to encode. Nothing is uploaded and no
 * server is involved — the same promise the rest of the converter makes.
 *
 * Chunks are written to IndexedDB as they arrive (one per second) rather than
 * held in memory until the end. A 30-minute capture is too large to keep in an
 * array safely, and a crash at minute 29 should not cost 29 minutes.
 */

/**
 * The ceiling, in milliseconds.
 *
 * Not a technical limit — a bound on how much of someone's disk one page may
 * quietly consume, and on how long a tab can hold an encoder before the
 * browser reclaims it.
 */
export const MAX_DURATION_MS = 30 * 60 * 1000;

/** When the countdown starts showing, so a stop is a choice rather than a surprise. */
export const WARN_AT_MS = 28 * 60 * 1000;

/** Written to IndexedDB every second: the most a crash can cost. */
const TIMESLICE_MS = 1000;

/**
 * Preferred encodings, best first.
 *
 * VP9 is the quality-per-byte choice and is what `MediaRecorder` ships with in
 * Chromium. This is the browser's own encoder, not `@ffmpeg/core` — the
 * libvpx-vp9 hang that took WebM off the table for *conversion* does not apply
 * here, and nothing in this path touches that build.
 */
const CANDIDATE_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

export function supportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return CANDIDATE_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function recordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function' &&
    supportedMimeType() !== undefined
  );
}

export type RecorderState = 'idle' | 'recording' | 'paused' | 'saving';

export interface RecorderEvents {
  onTick?: (elapsedMs: number) => void;
  onState?: (state: RecorderState) => void;
  onDone?: (meta: RecordingMeta) => void;
  onError?: (message: string) => void;
}

export interface StartOptions {
  /** Mix the default microphone into the recording alongside any system audio. */
  microphone?: boolean;
  title?: string;
}

export interface RecorderHandle {
  stop(): void;
  pause(): void;
  resume(): void;
  /** Discards the recording and its chunks instead of finishing it. */
  cancel(): void;
}

function newId(): string {
  return `rec_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Combine the display capture's own audio with a microphone track.
 *
 * `MediaRecorder` takes one audio track, so two sources have to be summed
 * before they reach it. Returning the context alongside lets the caller close
 * it — an AudioContext left open holds the device awake after the recording
 * has stopped.
 */
function mixAudio(
  display: MediaStream,
  mic: MediaStream | undefined,
): { track: MediaStreamTrack | undefined; context: AudioContext | undefined } {
  const displayAudio = display.getAudioTracks();
  const micAudio = mic?.getAudioTracks() ?? [];

  if (micAudio.length === 0) return { track: displayAudio[0], context: undefined };
  if (displayAudio.length === 0) return { track: micAudio[0], context: undefined };

  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  context.createMediaStreamSource(new MediaStream([displayAudio[0]!])).connect(destination);
  context.createMediaStreamSource(new MediaStream([micAudio[0]!])).connect(destination);
  return { track: destination.stream.getAudioTracks()[0], context };
}

export async function startRecording(
  options: StartOptions,
  events: RecorderEvents,
): Promise<RecorderHandle> {
  const mimeType = supportedMimeType();
  if (!mimeType) throw new Error('This browser cannot record video.');

  const display = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    // Asked for even when the user wants only the mic: a shared tab's own
    // sound is usually the point of recording it.
    audio: true,
  });

  let mic: MediaStream | undefined;
  if (options.microphone) {
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // A refused microphone must not lose the screen capture the user already
      // granted. Recording proceeds without it, and the caller is told.
      events.onError?.('The microphone was unavailable, so the recording has no voice track.');
    }
  }

  const { track: audioTrack, context } = mixAudio(display, mic);
  const stream = new MediaStream([...display.getVideoTracks(), ...(audioTrack ? [audioTrack] : [])]);

  const id = newId();
  const startedAt = Date.now();
  let pausedTotal = 0;
  let pausedAt: number | null = null;
  let sequence = 0;
  let stopping = false;
  let cancelled = false;

  const elapsed = (): number =>
    Date.now() - startedAt - pausedTotal - (pausedAt === null ? 0 : Date.now() - pausedAt);

  await createRecording({
    id,
    title: options.title?.trim() || `Recording ${new Date().toLocaleString()}`,
    durationMs: 0,
    sizeBytes: 0,
    mimeType,
    createdAt: startedAt,
  });

  const recorder = new MediaRecorder(stream, { mimeType });

  // Writes are awaited in order: two overlapping puts for the same recording
  // would interleave sequence numbers and reassemble out of order.
  let writeChain: Promise<unknown> = Promise.resolve();

  recorder.ondataavailable = (event) => {
    if (event.data.size === 0 || cancelled) return;
    const seq = sequence;
    sequence += 1;
    writeChain = writeChain
      .then(() => appendChunk(id, seq, event.data))
      .catch((error: unknown) => {
        // Out of disk, or storage denied. Stop rather than silently dropping
        // the middle of a recording the user believes is still running.
        events.onError?.(
          error instanceof Error ? `Could not save the recording: ${error.message}` : 'Could not save the recording.',
        );
        stop();
      });
  };

  const cleanup = () => {
    window.clearInterval(ticker);
    for (const track of stream.getTracks()) track.stop();
    for (const track of display.getTracks()) track.stop();
    for (const track of mic?.getTracks() ?? []) track.stop();
    void context?.close().catch(() => undefined);
  };

  recorder.onstop = () => {
    cleanup();
    if (cancelled) return;
    events.onState?.('saving');
    const durationMs = elapsed();
    void writeChain
      .then(() => {
        const title = options.title?.trim();
        return finalizeRecording(id, { durationMs, mimeType, ...(title ? { title } : {}) });
      })
      .then((meta) => {
        events.onState?.('idle');
        events.onDone?.(meta);
      })
      .catch((error: unknown) => {
        events.onState?.('idle');
        events.onError?.(
          error instanceof Error ? error.message : 'The recording could not be assembled.',
        );
      });
  };

  function stop(): void {
    if (stopping) return;
    stopping = true;
    if (recorder.state !== 'inactive') recorder.stop();
    else cleanup();
  }

  // Stopping the share from the browser's own bar ends the recording; the
  // track ending is the only notification of that.
  display.getVideoTracks()[0]?.addEventListener('ended', () => stop());

  const ticker = window.setInterval(() => {
    const ms = elapsed();
    events.onTick?.(ms);
    if (ms >= MAX_DURATION_MS) stop();
  }, 250);

  recorder.start(TIMESLICE_MS);
  events.onState?.('recording');

  return {
    stop,
    pause() {
      if (recorder.state !== 'recording') return;
      recorder.pause();
      pausedAt = Date.now();
      events.onState?.('paused');
    },
    resume() {
      if (recorder.state !== 'paused') return;
      recorder.resume();
      if (pausedAt !== null) pausedTotal += Date.now() - pausedAt;
      pausedAt = null;
      events.onState?.('recording');
    },
    cancel() {
      cancelled = true;
      stop();
      void import('./db').then(({ deleteRecording }) => deleteRecording(id).catch(() => undefined));
      events.onState?.('idle');
    },
  };
}
