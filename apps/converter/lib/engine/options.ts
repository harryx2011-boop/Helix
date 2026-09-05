import { type Format, isFormat } from './formats';

export class ValidationError extends Error {}

function assert(cond: boolean, message: string): void {
  if (!cond) throw new ValidationError(message);
}

function inRange(value: number, min: number, max: number, label: string): void {
  assert(Number.isFinite(value), `${label} must be a finite number.`);
  assert(value >= min && value <= max, `${label} must be between ${min} and ${max}.`);
}

export type Trim = { start: number; end: number };
export type Crop = { x: number; y: number; width: number; height: number };
export type Rotation = 0 | 90 | 180 | 270;
export type Flip = 'h' | 'v' | 'hv';

export type ConvertOptions = {
  crf?: number;
  videoBitrate?: number;
  audioBitrate?: number;
  width?: number;
  height?: number;
  fps?: number;
  rotate?: Rotation;
  flip?: Flip;
  trim?: Trim;
  crop?: Crop;
  preset?: 'ultrafast' | 'veryfast' | 'fast' | 'medium' | 'slow';
  stripAudio?: boolean;
  targetBytes?: number;
};

export type CompressOptions = ConvertOptions & {
  target?: number;
  quality?: 'email' | 'discord' | 'web' | 'archive';
};

/**
 * Thumbnail extraction. One shape covers all three modes rather than three
 * near-identical types, because the width and the source are always the same
 * question and only the framing differs.
 */
export type ThumbsOptions = {
  mode: 'poster' | 'sprite' | 'preview';
  width: number;
  /** poster and preview: where to start, in seconds. */
  at?: number;
  /** sprite: how many frames to lay out, and how many per row. */
  count?: number;
  columns?: number;
  /** preview: how long, and how smooth. */
  durationSec?: number;
  fps?: number;
};

export type GifOptions = {
  fps: number;
  width: number;
  trim?: Trim;
  loop: boolean;
  dither: 'none' | 'bayer' | 'floyd_steinberg' | 'sierra2_4a';
};

export type ImageOptions = {
  quality?: number;
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  rotate?: Rotation;
  flip?: Flip;
  lossless?: boolean;
};

const DIMENSION_MIN = 16;
const DIMENSION_MAX = 16384;
const PRESETS = new Set(['ultrafast', 'veryfast', 'fast', 'medium', 'slow']);
const FITS = new Set(['cover', 'contain', 'fill', 'inside', 'outside']);
const DITHERS = new Set(['none', 'bayer', 'floyd_steinberg', 'sierra2_4a']);
const ROTATIONS = new Set([0, 90, 180, 270]);
const FLIPS = new Set(['h', 'v', 'hv']);

function checkDimension(value: number | undefined, label: string): void {
  if (value === undefined) return;
  inRange(value, DIMENSION_MIN, DIMENSION_MAX, label);
}

function checkTrim(trim: Trim | undefined): void {
  if (!trim) return;
  inRange(trim.start, 0, 86_400, 'trim.start');
  inRange(trim.end, 0, 86_400, 'trim.end');
  assert(trim.end > trim.start, 'trim.end must be greater than trim.start.');
}

function checkCrop(crop: Crop | undefined): void {
  if (!crop) return;
  inRange(crop.x, 0, DIMENSION_MAX, 'crop.x');
  inRange(crop.y, 0, DIMENSION_MAX, 'crop.y');
  checkDimension(crop.width, 'crop.width');
  checkDimension(crop.height, 'crop.height');
}

function checkRotate(rotate: Rotation | undefined): void {
  if (rotate === undefined) return;
  assert(ROTATIONS.has(rotate), 'rotate must be 0, 90, 180 or 270.');
}

function checkFlip(flip: Flip | undefined): void {
  if (flip === undefined) return;
  assert(FLIPS.has(flip), "flip must be 'h', 'v' or 'hv'.");
}

export function validateConvertOptions(o: ConvertOptions): void {
  if (o.crf !== undefined) inRange(o.crf, 0, 51, 'crf');
  if (o.videoBitrate !== undefined) inRange(o.videoBitrate, 1_000, 200_000_000, 'videoBitrate');
  if (o.audioBitrate !== undefined) inRange(o.audioBitrate, 8_000, 2_000_000, 'audioBitrate');
  checkDimension(o.width, 'width');
  checkDimension(o.height, 'height');
  if (o.fps !== undefined) inRange(o.fps, 1, 240, 'fps');
  checkRotate(o.rotate);
  checkFlip(o.flip);
  checkTrim(o.trim);
  checkCrop(o.crop);
  if (o.preset !== undefined) assert(PRESETS.has(o.preset), 'preset is not a known ffmpeg preset.');
  if (o.targetBytes !== undefined) inRange(o.targetBytes, 64_000, 5_368_709_120, 'targetBytes');
}

export function validateCompressOptions(o: CompressOptions): void {
  validateConvertOptions(o);
  if (o.target !== undefined) inRange(o.target, 64_000, 5_368_709_120, 'target');
  if (o.quality !== undefined) {
    assert(
      o.quality === 'email' || o.quality === 'discord' || o.quality === 'web' || o.quality === 'archive',
      'quality must be one of email, discord, web, archive.',
    );
  }
}

export function validateGifOptions(o: GifOptions): void {
  inRange(o.fps, 1, 50, 'fps');
  checkDimension(o.width, 'width');
  checkTrim(o.trim);
  assert(typeof o.loop === 'boolean', 'loop must be a boolean.');
  assert(DITHERS.has(o.dither), 'dither is not a known algorithm.');
}

export function validateThumbsOptions(o: ThumbsOptions): void {
  assert(
    o.mode === 'poster' || o.mode === 'sprite' || o.mode === 'preview',
    'mode must be poster, sprite or preview.',
  );
  checkDimension(o.width, 'width');
  if (o.at !== undefined) assert(o.at >= 0, 'at must not be negative.');
  if (o.count !== undefined) inRange(o.count, 1, 200, 'count');
  if (o.columns !== undefined) inRange(o.columns, 1, 20, 'columns');
  if (o.durationSec !== undefined) inRange(o.durationSec, 0.1, 60, 'durationSec');
  if (o.fps !== undefined) inRange(o.fps, 1, 30, 'fps');
  // A sheet wider than a browser will decode is a failed job dressed up as a
  // valid request: 200 frames at 320px is already 64,000 pixels across.
  if (o.mode === 'sprite') {
    const columns = o.columns ?? 5;
    assert(columns * o.width <= 16_384, 'columns x width exceeds the maximum image width of 16384px.');
  }
}

export function validateImageOptions(o: ImageOptions): void {
  if (o.quality !== undefined) inRange(o.quality, 1, 100, 'quality');
  checkDimension(o.width, 'width');
  checkDimension(o.height, 'height');
  if (o.fit !== undefined) assert(FITS.has(o.fit), 'fit is not a known resize mode.');
  checkRotate(o.rotate);
  checkFlip(o.flip);
}

export function validateFormat(value: string, label = 'format'): Format {
  assert(isFormat(value), `${label} '${value}' is not a supported format.`);
  return value as Format;
}

export const PRESET_TARGETS: Record<'email' | 'discord' | 'web' | 'archive', number | null> = {
  email: 25 * 1024 * 1024,
  discord: 10 * 1024 * 1024,
  web: null,
  archive: null,
};

/**
 * Bitrate to land a target size: (bytes * 8 / seconds), minus the audio
 * allowance, with 6% held back for container overhead.
 */
export function bitrateForTarget(targetBytes: number, durationSec: number, audioBitrate: number): number | null {
  if (durationSec <= 0) return null;
  const total = (targetBytes * 8) / durationSec;
  const video = Math.floor((total - audioBitrate) * 0.94);
  return video > 10_000 ? video : null;
}
