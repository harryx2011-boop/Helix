import { z } from 'zod';
import { formatSchema } from './formats.js';

const dimension = z.number().int().min(16).max(16384);

export const trimSchema = z
  .object({ start: z.number().min(0).max(86400), end: z.number().min(0).max(86400) })
  .refine((t) => t.end > t.start, { message: 'trim.end must be greater than trim.start' });

export const cropSchema = z.object({
  x: z.number().int().min(0).max(16384),
  y: z.number().int().min(0).max(16384),
  width: dimension,
  height: dimension,
});

export const convertOptions = z.object({
  crf: z.number().int().min(0).max(51).optional(),
  videoBitrate: z.number().int().min(1_000).max(200_000_000).optional(),
  audioBitrate: z.number().int().min(8_000).max(2_000_000).optional(),
  width: dimension.optional(),
  height: dimension.optional(),
  fps: z.number().min(1).max(240).optional(),
  rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  flip: z.enum(['h', 'v', 'hv']).optional(),
  trim: trimSchema.optional(),
  crop: cropSchema.optional(),
  preset: z.enum(['ultrafast', 'veryfast', 'fast', 'medium', 'slow']).optional(),
  stripAudio: z.boolean().optional(),
  /** Present when a caller wants a size target and a format change at once. */
  targetBytes: z.number().int().min(64_000).max(5_368_709_120).optional(),
});

export const compressOptions = convertOptions.extend({
  target: z.number().int().min(64_000).max(5_368_709_120).optional(),
  quality: z.enum(['email', 'discord', 'web', 'archive']).optional(),
});

export const gifOptions = z.object({
  fps: z.number().min(1).max(50).default(15),
  width: dimension.default(480),
  trim: trimSchema.optional(),
  loop: z.boolean().default(true),
  dither: z.enum(['none', 'bayer', 'floyd_steinberg', 'sierra2_4a']).default('sierra2_4a'),
});

export const imageOptions = z.object({
  quality: z.number().int().min(1).max(100).optional(),
  width: dimension.optional(),
  height: dimension.optional(),
  fit: z.enum(['cover', 'contain', 'fill', 'inside', 'outside']).optional(),
  rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  flip: z.enum(['h', 'v', 'hv']).optional(),
  lossless: z.boolean().optional(),
});

export const convertBody = z.object({ to: formatSchema, options: convertOptions.default({}) });
export const compressBody = z.object({
  to: formatSchema.optional(),
  options: compressOptions.default({}),
});
export const gifBody = z.object({ options: gifOptions.default({}) });
export const imageBody = z.object({ to: formatSchema, options: imageOptions.default({}) });

export type ConvertOptions = z.infer<typeof convertOptions>;
export type CompressOptions = z.infer<typeof compressOptions>;
export type GifOptions = z.infer<typeof gifOptions>;
export type ImageOptions = z.infer<typeof imageOptions>;

/** Named compression presets, resolved to a target size in bytes. */
export const PRESET_TARGETS: Record<'email' | 'discord' | 'web' | 'archive', number | null> = {
  email: 25 * 1024 * 1024,
  discord: 10 * 1024 * 1024,
  web: null,
  archive: null,
};
