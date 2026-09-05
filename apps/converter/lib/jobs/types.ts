// Mirrors CONVERTER-CONTRACT.md §5. The `Job` shape is frozen; everything
// below it is client-side state layered on top.

export type JobOp = 'convert' | 'compress' | 'gif' | 'image';
export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export type Job = {
  id: string; // cv_<nanoid>
  op: JobOp;
  from: string;
  to: string;
  status: JobStatus;
  pct: number;
  eta: number | null;
  inSize: number;
  outSize: number | null;
  error: { message: string; stderr: string } | null;
  createdAt: number;
  expiresAt: number; // +1h
};

export type SseFrame =
  | { status: 'queued' }
  | { status: 'running'; pct: number; fps?: number; eta: number | null }
  | { status: 'done'; url: string; size: number }
  | { status: 'error'; message: string; stderr: string }
  | { status: 'cancelled' };

export type FileKind = 'video' | 'audio' | 'image' | 'gif';

export type CompressPreset = 'email' | 'discord' | 'web' | 'archive';

export type Rotation = 0 | 90 | 180 | 270;
export type Flip = 'none' | 'h' | 'v' | 'hv';

export type EditOptions = {
  trim: { start: number; end: number } | null;
  resize: { width: number; height: number } | null;
  rotate: Rotation;
  flip: Flip;
};

export type ConvertSettings = EditOptions & {
  to: string;
  quality: number; // 0–100; mapped to crf / q / kbps per kind
  preset: CompressPreset | null;
  targetBytes: number | null;
  gif: { fps: number; width: number };
};

export type MediaMeta = {
  duration: number | null;
  width: number | null;
  height: number | null;
};

export type Phase = 'idle' | 'uploading' | 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export type QueueItem = {
  localId: string;
  file: File;
  name: string;
  ext: string;
  kind: FileKind;
  size: number;
  meta: MediaMeta;
  override: Partial<ConvertSettings> | null;
  phase: Phase;
  uploadPct: number;
  pct: number;
  eta: number | null;
  fps: number | null;
  jobId: string | null;
  url: string | null;
  outSize: number | null;
  error: { message: string; stderr: string } | null;
  enterDelay: number;
};

// localStorage shapes (contract §8)
export type StoredJob = {
  id: string;
  from: string;
  to: string;
  status: JobStatus;
  url: string | null;
  size: number | null;
  expiresAt: number;
};

export type StoredPreset = {
  id: string;
  name: string;
  targetBytes: number | null;
  quality: number;
};

export const MAX_FILE_BYTES = 2 * 1024 ** 3;
export const RETENTION_MS = 60 * 60 * 1000;

export const BUILTIN_PRESETS: ReadonlyArray<{ id: CompressPreset; label: string; targetBytes: number | null }> = [
  { id: 'email', label: 'Email', targetBytes: 20 * 1024 ** 2 },
  { id: 'discord', label: 'Discord', targetBytes: 10 * 1024 ** 2 },
  { id: 'web', label: 'Web', targetBytes: 5 * 1024 ** 2 },
  { id: 'archive', label: 'Archive', targetBytes: null },
];

const VIDEO_EXT = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'mpg', 'mpeg', 'wmv', 'flv', 'ts', '3gp', 'hevc']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'm4a', 'flac', 'ogg', 'opus', 'aac', 'aiff', 'wma', 'aif']);
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'heif', 'tiff', 'tif', 'bmp', 'svg']);

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

export function detectKind(file: File): FileKind | null {
  const ext = extOf(file.name);
  if (ext === 'gif' || file.type === 'image/gif') return 'gif';
  if (file.type.startsWith('video/') || VIDEO_EXT.has(ext)) return 'video';
  if (file.type.startsWith('audio/') || AUDIO_EXT.has(ext)) return 'audio';
  if (file.type.startsWith('image/') || IMAGE_EXT.has(ext)) return 'image';
  return null;
}

export function defaultTarget(kind: FileKind, ext: string): string {
  switch (kind) {
    case 'video':
      // Not webm: libvpx-vp9 hangs indefinitely in this wasm build (see
      // lib/formats.ts OUTPUT_TARGETS). mov is the next-most-useful pivot
      // for an mp4 source since it shares the same h264 codec path.
      return ext === 'mp4' ? 'mov' : 'mp4';
    case 'audio':
      return ext === 'mp3' ? 'wav' : 'mp3';
    case 'image':
      return ext === 'webp' ? 'png' : 'webp';
    case 'gif':
      return 'mp4';
  }
}

export function defaultSettings(kind: FileKind, ext: string): ConvertSettings {
  return {
    to: defaultTarget(kind, ext),
    quality: 80,
    preset: null,
    targetBytes: null,
    gif: { fps: 15, width: 480 },
    trim: null,
    resize: null,
    rotate: 0,
    flip: 'none',
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDelta(inSize: number, outSize: number): string {
  if (inSize <= 0) return '';
  const pct = Math.round(((outSize - inSize) / inSize) * 100);
  if (pct === 0) return '±0%';
  return pct < 0 ? `−${Math.abs(pct)}%` : `+${pct}%`;
}

export function formatSeconds(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function formatEta(s: number | null): string {
  if (s === null || !Number.isFinite(s)) return '';
  if (s < 60) return `~${Math.max(1, Math.round(s))}s`;
  return `~${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}
