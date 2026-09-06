import { ALL_FORMATS } from '@/lib/converter/engine/formats';

/**
 * Tool/structured-output schema for "resolved conversion intent". Mirrors
 * EngineRequest minus `file` (already known client-side). This is a first
 * line of defense only -- the real gate is parseResolvedIntent running the
 * same validate*Options functions the manual path uses (resolve.ts).
 */
export const RESOLVE_INTENT_SCHEMA = {
  name: 'resolve_conversion_intent',
  description:
    "Resolve the user's request into one concrete conversion the app already knows how to run.",
  parameters: {
    type: 'object',
    properties: {
      op: { type: 'string', enum: ['convert', 'compress', 'gif', 'image'] },
      to: { type: 'string', enum: ALL_FORMATS, description: 'Target format. Omit for gif.' },
      target: { type: 'number', description: 'compress only: target file size in bytes.' },
      preset: { type: 'string', enum: ['email', 'discord', 'web', 'archive'], description: 'compress only.' },
      fps: { type: 'number', description: 'gif only: frames per second, 1-50.' },
      width: { type: 'number', description: 'gif only: output width in pixels.' },
      resize: {
        type: 'object',
        properties: { width: { type: 'number' }, height: { type: 'number' } },
        required: ['width', 'height'],
        description: 'image only.',
      },
      quality: { type: 'number', description: 'image only: 1-100.' },
      options: {
        type: 'object',
        description: 'Extra tuning: crf, videoBitrate, audioBitrate, width, height, fps, rotate, flip, trim, crop, preset, stripAudio, dither, loop, lossless, fit. Omit anything not relevant. For gif, dither and loop go here; fps and width are top-level.',
        properties: {
          crf: { type: 'number' },
          videoBitrate: { type: 'number' },
          audioBitrate: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
          fps: { type: 'number' },
          rotate: { type: 'number', enum: [0, 90, 180, 270] },
          flip: { type: 'string', enum: ['h', 'v', 'hv'] },
          preset: { type: 'string', enum: ['ultrafast', 'veryfast', 'fast', 'medium', 'slow'] },
          stripAudio: { type: 'boolean' },
          dither: { type: 'string', enum: ['none', 'bayer', 'floyd_steinberg', 'sierra2_4a'] },
          loop: { type: 'boolean' },
          lossless: { type: 'boolean' },
          fit: { type: 'string', enum: ['cover', 'contain', 'fill', 'inside', 'outside'] },
        },
      },
    },
    required: ['op'],
  },
} as const;

export type RawResolvedIntent = {
  op?: unknown;
  to?: unknown;
  target?: unknown;
  preset?: unknown;
  fps?: unknown;
  width?: unknown;
  resize?: unknown;
  quality?: unknown;
  options?: unknown;
};
