export const VIDEO_FORMATS = ['mp4', 'webm', 'mov', 'avi', 'mkv'] as const;
export const AUDIO_FORMATS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'] as const;
export const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tiff'] as const;
export const GIF_FORMATS = ['gif', 'apng'] as const;

export const ALL_FORMATS = [
  ...VIDEO_FORMATS,
  ...AUDIO_FORMATS,
  ...IMAGE_FORMATS,
  ...GIF_FORMATS,
] as const;

export type Format = (typeof ALL_FORMATS)[number];
export type Kind = 'video' | 'audio' | 'image' | 'gif';

const FORMAT_SET = new Set<string>(ALL_FORMATS);

export function isFormat(value: string): value is Format {
  return FORMAT_SET.has(value);
}

export function kindOf(format: Format): Kind {
  if ((VIDEO_FORMATS as readonly string[]).includes(format)) return 'video';
  if ((AUDIO_FORMATS as readonly string[]).includes(format)) return 'audio';
  if ((GIF_FORMATS as readonly string[]).includes(format)) return 'gif';
  return 'image';
}

/** Stills go to the image codec workers; everything else to ffmpeg.wasm. */
export function engineFor(target: Format): 'image' | 'ffmpeg' {
  return kindOf(target) === 'image' ? 'image' : 'ffmpeg';
}

/**
 * HEIC decodes fine (libheif-js is a wasm build of the real decoder), but no
 * open-source wasm build can encode it: HEIC output means an HEVC encoder,
 * which is patent-encumbered and absent from every wasm codec set, including
 * the one the old server-side sharp path quietly substituted AVIF-in-HEIF for.
 * Input-only, so a HEIC file can still be converted to anything else.
 */
export const HEIC_INPUT_EXTS = ['heic', 'heif'] as const;
