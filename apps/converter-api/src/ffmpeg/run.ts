import { spawn } from 'node:child_process';
import { containersFromProbe, type Format } from './formats.js';
import { probeArgs } from './args.js';

export const FFMPEG_BIN = process.env.FFMPEG_PATH ?? 'ffmpeg';
export const FFPROBE_BIN = process.env.FFPROBE_PATH ?? 'ffprobe';

/**
 * A wedged encode would otherwise hold a queue slot forever, so every process
 * carries a wall clock and is killed when it runs past it.
 */
export const JOB_TIMEOUT_MS = Number(process.env.CONVERT_TIMEOUT_MS ?? 30 * 60 * 1000);

export class FfmpegError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
    readonly code: number | null,
  ) {
    super(message);
    this.name = 'FfmpegError';
  }
}

export type Probe = {
  /** Every container ffprobe considers this file to be. */
  containers: Set<Format>;
  formatName: string;
  duration: number;
  size: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number | null;
  height: number | null;
};

type ProbeJson = {
  format?: { format_name?: string; duration?: string; size?: string };
  streams?: { codec_type?: string; width?: number; height?: number }[];
};

export async function probe(input: string): Promise<Probe> {
  const { stdout } = await run(FFPROBE_BIN, probeArgs(input), { timeoutMs: 30_000 });
  const parsed = JSON.parse(stdout) as ProbeJson;
  const streams = parsed.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  const formatName = parsed.format?.format_name ?? '';

  return {
    containers: containersFromProbe(formatName),
    formatName,
    duration: Number(parsed.format?.duration ?? 0),
    size: Number(parsed.format?.size ?? 0),
    hasVideo: Boolean(video),
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
    width: video?.width ?? null,
    height: video?.height ?? null,
  };
}

export type RunHandle = {
  promise: Promise<{ stdout: string; stderr: string }>;
  cancel: () => void;
};

/** ffmpeg's -progress stream is `key=value` lines terminated by `progress=`. */
function parseProgress(chunk: string, durationSec: number) {
  const fields = new Map<string, string>();
  for (const line of chunk.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) fields.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }
  const outMs = Number(fields.get('out_time_ms') ?? 0) / 1000;
  if (!outMs || durationSec <= 0) return null;

  const pct = Math.min(99, Math.round((outMs / (durationSec * 1000)) * 100));
  const speed = Number((fields.get('speed') ?? '0').replace('x', '')) || 0;
  const remainingMs = durationSec * 1000 - outMs;

  return {
    pct,
    fps: Number(fields.get('fps') ?? 0),
    eta: speed > 0 ? Math.round(remainingMs / 1000 / speed) : null,
  };
}

export type Progress = { pct: number; fps: number; eta: number | null };

export function spawnProcess(
  bin: string,
  args: string[],
  opts: { timeoutMs?: number; durationSec?: number; onProgress?: (p: Progress) => void } = {},
): RunHandle {
  // argv array, no shell — a user value can never become a command.
  const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });

  let stdout = '';
  let stderr = '';
  let cancelled = false;

  const timeout = setTimeout(() => {
    cancelled = true;
    child.kill('SIGKILL');
  }, opts.timeoutMs ?? JOB_TIMEOUT_MS);

  child.stdout.on('data', (buf: Buffer) => {
    const chunk = buf.toString();
    stdout += chunk;
    if (opts.onProgress && opts.durationSec) {
      const p = parseProgress(chunk, opts.durationSec);
      if (p) opts.onProgress(p);
    }
  });

  // stderr is unbounded on a pathological file; keep only the tail for the log.
  child.stderr.on('data', (buf: Buffer) => {
    stderr = (stderr + buf.toString()).slice(-16_384);
  });

  const promise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(new FfmpegError(err.message, stderr, null));
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (cancelled) reject(new FfmpegError('Cancelled', stderr, code));
      else if (code === 0) resolve({ stdout, stderr });
      else reject(new FfmpegError(describe(stderr), stderr, code));
    });
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      child.kill('SIGKILL');
    },
  };
}

export function run(
  bin: string,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  return spawnProcess(bin, args, opts).promise;
}

/** ffmpeg's stderr is for engineers; the UI shows this and keeps the raw log. */
function describe(stderr: string): string {
  const tail = stderr.toLowerCase();
  if (tail.includes('unknown decoder') || tail.includes('decoder not found'))
    return "This file uses a codec we can't read.";
  if (tail.includes('invalid data found')) return "This file appears to be corrupt or incomplete.";
  if (tail.includes('no space left')) return 'The server ran out of disk space.';
  if (tail.includes('permission denied')) return "The server couldn't read the uploaded file.";
  if (tail.includes('does not contain any stream')) return 'This file contains no audio or video.';
  return 'Conversion failed.';
}
