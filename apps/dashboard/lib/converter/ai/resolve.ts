import { isFormat, type Format } from '@/lib/converter/engine/formats';
import {
  ValidationError,
  validateCompressOptions,
  validateConvertOptions,
  validateFormat,
  validateGifOptions,
  validateImageOptions,
  type CompressOptions,
  type ConvertOptions,
  type GifOptions,
  type ImageOptions,
} from '@/lib/converter/engine/options';
import type { RawResolvedIntent } from './schema';

export type ResolvedIntent =
  | { op: 'convert'; to: Format; options: ConvertOptions }
  | { op: 'compress'; to?: Format; target?: number; preset?: CompressOptions['quality']; options: ConvertOptions }
  | { op: 'gif'; fps: number; width: number; options: Partial<Omit<GifOptions, 'fps' | 'width'>> }
  | { op: 'image'; to: Format; resize?: { width: number; height: number }; quality?: number; options: ImageOptions };

const CONVERT_OPTION_KEYS = [
  'crf', 'videoBitrate', 'audioBitrate', 'width', 'height', 'fps',
  'rotate', 'flip', 'trim', 'crop', 'preset', 'stripAudio', 'targetBytes',
] as const;
const GIF_OPTION_KEYS = ['trim', 'loop', 'dither'] as const;
const IMAGE_OPTION_KEYS = ['quality', 'width', 'height', 'fit', 'rotate', 'flip', 'lossless'] as const;

/** Drops any key the model hallucinated that isn't one of the real option fields. */
function pick<T extends string>(source: unknown, keys: readonly T[]): Record<T, unknown> {
  const out = {} as Record<T, unknown>;
  if (typeof source !== 'object' || source === null) return out;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    if (key in record) out[key] = record[key];
  }
  return out;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function isTrim(value: unknown): value is { start: number; end: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).start === 'number' &&
    typeof (value as Record<string, unknown>).end === 'number'
  );
}

function isResize(value: unknown): value is { width: number; height: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).width === 'number' &&
    typeof (value as Record<string, unknown>).height === 'number'
  );
}

/**
 * Parses and validates the model's raw JSON against the exact same
 * validate*Options functions the manual path calls -- the coupling that makes
 * drift between the two paths structurally impossible. Throws ValidationError
 * (or a generic Error for a malformed shape) on anything invalid; callers
 * must fall back to the manual picker rather than catch-and-coerce.
 */
export function parseResolvedIntent(raw: unknown): ResolvedIntent {
  if (typeof raw !== 'object' || raw === null) {
    throw new ValidationError('The response was not a JSON object.');
  }
  const r = raw as RawResolvedIntent;
  const op = str(r.op);

  if (op === 'gif') {
    const rawOptions = pick(r.options, GIF_OPTION_KEYS);
    const fps = num(r.fps) ?? 15;
    const width = num(r.width) ?? 480;
    const loop = typeof rawOptions.loop === 'boolean' ? rawOptions.loop : true;
    const dither = (str(rawOptions.dither) as GifOptions['dither']) ?? 'sierra2_4a';
    const trim = isTrim(rawOptions.trim) ? rawOptions.trim : undefined;
    const full: GifOptions = { fps, width, loop, dither, ...(trim ? { trim } : {}) };
    validateGifOptions(full);
    return { op: 'gif', fps, width, options: { loop, dither, ...(trim ? { trim } : {}) } };
  }

  if (op === 'image') {
    const to = validateFormat(str(r.to) ?? '', 'to');
    const options = pick(r.options, IMAGE_OPTION_KEYS) as ImageOptions;
    const quality = num(r.quality);
    validateImageOptions({ ...options, ...(quality !== undefined ? { quality } : {}) });
    const resize = isResize(r.resize) ? r.resize : undefined;
    return {
      op: 'image',
      to,
      ...(resize ? { resize } : {}),
      ...(quality !== undefined ? { quality } : {}),
      options,
    };
  }

  if (op === 'compress') {
    const options = pick(r.options, CONVERT_OPTION_KEYS) as ConvertOptions;
    const target = num(r.target);
    const preset = str(r.preset) as CompressOptions['quality'] | undefined;
    validateCompressOptions({ ...options, ...(target !== undefined ? { target } : {}), ...(preset !== undefined ? { quality: preset } : {}) });
    const to = r.to !== undefined ? validateFormat(str(r.to) ?? '', 'to') : undefined;
    return {
      op: 'compress',
      ...(to ? { to } : {}),
      ...(target !== undefined ? { target } : {}),
      ...(preset !== undefined ? { preset } : {}),
      options,
    };
  }

  if (op === 'convert') {
    const to = validateFormat(str(r.to) ?? '', 'to');
    const options = pick(r.options, CONVERT_OPTION_KEYS) as ConvertOptions;
    validateConvertOptions(options);
    return { op: 'convert', to, options };
  }

  throw new ValidationError(`op '${String(r.op)}' is not one of convert, compress, gif, image.`);
}

export { isFormat };
