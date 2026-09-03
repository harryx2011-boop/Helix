// API client for CONVERTER-CONTRACT.md §5. This module is the seam between the
// UI and apps/converter-api: `MOCK` swaps every call for an in-memory
// simulation that produces the same frames the real SSE stream will.

import type { CompressPreset, Job, JobOp, SseFrame } from './types';

export const MOCK = process.env.NEXT_PUBLIC_CONVERTER_MOCK !== 'false';
export const API_BASE = process.env.NEXT_PUBLIC_CONVERTER_API ?? '';

export type JobOptions = {
  crf?: number; // video, 0–51
  quality?: number; // image, 1–100
  bitrate?: number; // audio, kbps
  targetBytes?: number; // convert-with-size-target; compress uses `target` directly
  trim?: { start: number; end: number };
  resize?: { width: number; height: number };
  rotate?: 0 | 90 | 180 | 270;
  flip?: 'h' | 'v' | 'hv';
};

export type SubmitRequest =
  | { op: 'convert'; file: File; to: string; options: JobOptions }
  | { op: 'compress'; file: File; target?: number; preset?: CompressPreset; options: JobOptions }
  | { op: 'gif'; file: File; fps: number; width: number; options: JobOptions }
  | {
      op: 'image';
      file: File;
      to: string;
      resize?: { width: number; height: number };
      quality?: number;
      options: JobOptions;
    };

export type Accepted = { id: string; status: 'queued' };

export type SubmitHandlers = {
  onUpload?: (sent: number, total: number) => void;
  signal?: AbortSignal;
};

export type FrameHandlers = {
  onFrame: (frame: SseFrame) => void;
  onError?: (error: Error) => void;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function submitJob(req: SubmitRequest, handlers: SubmitHandlers = {}): Promise<Accepted> {
  return MOCK ? mockSubmit(req, handlers) : realSubmit(req, handlers);
}

export function getJob(id: string): Promise<Job> {
  return MOCK ? mockGet(id) : realGet(id);
}

/** Opens the SSE stream. Returns an unsubscribe function; the stream closes itself on a terminal frame. */
export function subscribe(id: string, handlers: FrameHandlers): () => void {
  return MOCK ? mockSubscribe(id, handlers) : realSubscribe(id, handlers);
}

export function cancelJob(id: string): Promise<void> {
  return MOCK ? mockCancel(id) : realCancel(id);
}

export function downloadUrl(id: string): string {
  if (MOCK) return mock.get(id)?.url ?? '';
  return `${API_BASE}/v1/jobs/${encodeURIComponent(id)}/download`;
}

// ---------------------------------------------------------------- real path

function realSubmit(req: SubmitRequest, { onUpload, signal }: SubmitHandlers): Promise<Accepted> {
  const fd = new FormData();
  fd.append('file', req.file, req.file.name);
  switch (req.op) {
    case 'convert':
      fd.append('to', req.to);
      break;
    case 'compress':
      if (req.target !== undefined) fd.append('target', String(req.target));
      if (req.preset !== undefined) fd.append('preset', req.preset);
      break;
    case 'gif':
      fd.append('fps', String(req.fps));
      fd.append('width', String(req.width));
      break;
    case 'image':
      fd.append('to', req.to);
      if (req.resize) fd.append('resize', JSON.stringify(req.resize));
      if (req.quality !== undefined) fd.append('quality', String(req.quality));
      break;
  }
  fd.append('options', JSON.stringify(req.options));

  return new Promise<Accepted>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/v1/${req.op}`);
    xhr.withCredentials = true;
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => {
      onUpload?.(e.loaded, e.lengthComputable ? e.total : req.file.size);
    };
    xhr.onload = () => {
      if (xhr.status === 202) {
        resolve(xhr.response as Accepted);
      } else {
        const body = xhr.response as { message?: string; error?: string } | null;
        reject(new ApiError(xhr.status, body?.message ?? body?.error ?? `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'Could not reach the converter service.'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(fd);
  });
}

async function realGet(id: string): Promise<Job> {
  const res = await fetch(`${API_BASE}/v1/jobs/${encodeURIComponent(id)}`, { credentials: 'include' });
  if (!res.ok) throw new ApiError(res.status, `Job ${id} not found`);
  return (await res.json()) as Job;
}

function realSubscribe(id: string, { onFrame, onError }: FrameHandlers): () => void {
  const es = new EventSource(`${API_BASE}/v1/jobs/${encodeURIComponent(id)}/events`, { withCredentials: true });
  es.onmessage = (e: MessageEvent<string>) => {
    let frame: SseFrame;
    try {
      frame = JSON.parse(e.data) as SseFrame;
    } catch {
      return;
    }
    onFrame(frame);
    if (frame.status === 'done' || frame.status === 'error' || frame.status === 'cancelled') es.close();
  };
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) onError?.(new ApiError(0, 'Progress stream closed.'));
  };
  return () => es.close();
}

async function realCancel(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/jobs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok && res.status !== 404) throw new ApiError(res.status, 'Cancel failed');
}

// ---------------------------------------------------------------- mock path
// Simulates upload, a queued beat, an ease-out progress curve, and a terminal
// frame. A file whose name contains "fail" or "error" errors out at ~60%.

type MockEntry = {
  job: Job;
  file: File;
  req: SubmitRequest;
  url: string | null;
  timer: number | null;
  startedAt: number;
  runMs: number;
  last: SseFrame;
  listeners: Set<FrameHandlers>;
};

const mock = new Map<string, MockEntry>();

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

function mockId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `cv_${s}`;
}

const RATIO: Record<string, number> = {
  mp4: 0.22, webm: 0.2, mov: 0.95, mkv: 0.9, avi: 1.1, gif: 1.8,
  mp3: 0.08, m4a: 0.07, aac: 0.07, ogg: 0.07, opus: 0.06, wav: 1, flac: 0.55, aiff: 1,
  jpg: 0.3, jpeg: 0.3, png: 1.2, webp: 0.22, avif: 0.15, tiff: 2, heic: 0.2,
};

function mockOutSize(req: SubmitRequest): number {
  const inSize = req.file.size;
  const target = req.op === 'compress' ? req.target : req.options.targetBytes;
  if (target) return Math.round(Math.min(inSize, target) * 0.93);
  const to = req.op === 'convert' || req.op === 'image' ? req.to : req.op === 'gif' ? 'gif' : '';
  let ratio = RATIO[to] ?? 0.5;
  if (req.op === 'image' && req.quality !== undefined) ratio *= req.quality / 85;
  if (req.options.crf !== undefined) ratio *= clamp(1.6 - req.options.crf / 40, 0.3, 1.6);
  if (req.options.trim) {
    const span = Math.max(0.05, req.options.trim.end - req.options.trim.start);
    ratio *= clamp(span / 60, 0.05, 1);
  }
  return Math.max(1024, Math.round(inSize * ratio));
}

function fromExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

async function mockSubmit(req: SubmitRequest, { onUpload, signal }: SubmitHandlers): Promise<Accepted> {
  const total = req.file.size;
  const uploadMs = clamp(400 + (total / 20e6) * 1000, 400, 1800);
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');
    await wait(uploadMs / steps);
    onUpload?.(Math.round((total * i) / steps), total);
  }
  const id = mockId();
  const now = Date.now();
  const to = req.op === 'convert' || req.op === 'image' ? req.to : req.op === 'gif' ? 'gif' : fromExt(req.file.name);
  const job: Job = {
    id,
    op: req.op,
    from: fromExt(req.file.name),
    to,
    status: 'queued',
    pct: 0,
    eta: null,
    inSize: total,
    outSize: null,
    error: null,
    createdAt: now,
    expiresAt: now + 60 * 60 * 1000,
  };
  mock.set(id, {
    job,
    file: req.file,
    req,
    url: null,
    timer: null,
    startedAt: 0,
    runMs: clamp(2200 + (total / 4e6) * 1000, 2200, 8000),
    last: { status: 'queued' },
    listeners: new Set(),
  });
  return { id, status: 'queued' };
}

async function mockGet(id: string): Promise<Job> {
  const entry = mock.get(id);
  if (!entry) throw new ApiError(404, `Job ${id} not found`);
  return entry.job;
}

function emit(entry: MockEntry, frame: SseFrame): void {
  entry.last = frame;
  for (const l of entry.listeners) l.onFrame(frame);
}

function finish(entry: MockEntry, frame: SseFrame): void {
  if (entry.timer !== null) window.clearTimeout(entry.timer);
  entry.timer = null;
  emit(entry, frame);
  entry.listeners.clear();
}

function mockStart(entry: MockEntry): void {
  const shouldFail = /fail|error/i.test(entry.file.name);
  entry.timer = window.setTimeout(() => {
    entry.job.status = 'running';
    entry.startedAt = performance.now();
    const tick = () => {
      const elapsed = performance.now() - entry.startedAt;
      const t = clamp(elapsed / entry.runMs, 0, 1);
      const pct = Math.round(100 * (1 - Math.pow(1 - t, 1.6)));
      entry.job.pct = pct;
      entry.job.eta = Math.max(0, Math.round((entry.runMs - elapsed) / 1000));
      if (shouldFail && pct >= 60) {
        entry.job.status = 'error';
        entry.job.error = {
          message: 'ffmpeg stopped before the end of the file. The input may be truncated or use a codec this build cannot decode.',
          stderr: MOCK_STDERR(entry.file.name),
        };
        finish(entry, { status: 'error', ...entry.job.error });
        return;
      }
      if (t >= 1) {
        entry.job.status = 'done';
        entry.job.pct = 100;
        entry.job.eta = 0;
        entry.job.outSize = mockOutSize(entry.req);
        entry.url = URL.createObjectURL(entry.file);
        finish(entry, { status: 'done', url: entry.url, size: entry.job.outSize });
        return;
      }
      emit(entry, { status: 'running', pct, fps: 42 + Math.round(Math.random() * 18), eta: entry.job.eta });
      entry.timer = window.setTimeout(tick, 100);
    };
    tick();
  }, 500);
}

function mockSubscribe(id: string, handlers: FrameHandlers): () => void {
  const entry = mock.get(id);
  if (!entry) {
    handlers.onError?.(new ApiError(404, `Job ${id} not found`));
    return () => {};
  }
  entry.listeners.add(handlers);
  handlers.onFrame(entry.last);
  if (entry.timer === null && entry.job.status === 'queued') mockStart(entry);
  return () => {
    entry.listeners.delete(handlers);
  };
}

async function mockCancel(id: string): Promise<void> {
  const entry = mock.get(id);
  if (!entry) return;
  if (entry.job.status === 'queued' || entry.job.status === 'running') {
    entry.job.status = 'cancelled';
    finish(entry, { status: 'cancelled' });
  }
  if (entry.url) URL.revokeObjectURL(entry.url);
  mock.delete(id);
}

const MOCK_STDERR = (name: string) => `ffmpeg version 7.1 Copyright (c) 2000-2024 the FFmpeg developers
  built with gcc 13.2.0
  configuration: --enable-gpl --enable-libx264 --enable-libvpx --enable-libopus
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '${name}':
  Duration: 00:01:42.30, start: 0.000000, bitrate: 8412 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 1920x1080, 8290 kb/s, 30 fps
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 122 kb/s
Stream mapping:
  Stream #0:0 -> #0:0 (h264 (native) -> h264 (libx264))
  Stream #0:1 -> #0:1 (aac (native) -> aac (native))
[libx264 @ 0x55d1e8a0c000] using cpu capabilities: MMX2 SSE2Fast SSSE3 SSE4.2 AVX FMA3 BMI2 AVX2
frame= 1842 fps= 61 q=26.0 size=    5120KiB time=00:01:01.40 bitrate= 683.1kbits/s speed=2.03x
[h264 @ 0x55d1e8a12340] Invalid NAL unit size (2874 > 1233).
[h264 @ 0x55d1e8a12340] Error splitting the input into NAL units.
[vist#0:0/h264 @ 0x55d1e8a09c80] Error submitting packet to decoder: Invalid data found when processing input
[out#0/mp4 @ 0x55d1e8a0b100] Error muxing a packet
Conversion failed!`;
