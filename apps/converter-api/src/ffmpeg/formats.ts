import { z } from 'zod';

export const VIDEO_FORMATS = ['mp4', 'webm', 'mov', 'avi', 'mkv'] as const;
export const AUDIO_FORMATS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'] as const;
export const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tiff', 'heic'] as const;
export const GIF_FORMATS = ['gif', 'apng'] as const;

export const ALL_FORMATS = [
  ...VIDEO_FORMATS,
  ...AUDIO_FORMATS,
  ...IMAGE_FORMATS,
  ...GIF_FORMATS,
] as const;

export type Format = (typeof ALL_FORMATS)[number];
export type Kind = 'video' | 'audio' | 'image' | 'gif';

export const formatSchema = z.enum(ALL_FORMATS);

export function kindOf(format: Format): Kind {
  if ((VIDEO_FORMATS as readonly string[]).includes(format)) return 'video';
  if ((AUDIO_FORMATS as readonly string[]).includes(format)) return 'audio';
  if ((GIF_FORMATS as readonly string[]).includes(format)) return 'gif';
  return 'image';
}

/** Stills go to sharp; everything else to ffmpeg. */
export function engineFor(target: Format): 'sharp' | 'ffmpeg' {
  return kindOf(target) === 'image' ? 'sharp' : 'ffmpeg';
}

/**
 * ffprobe reports a comma-separated SET of compatible containers, not one:
 * an .mp4 probes as `mov,mp4,m4a,3gp,3g2,mj2` and a .webm as `matroska,webm`.
 * Treating the first entry as the answer misreads every mp4 as a mov, so the
 * whole set is returned and membership is what callers test.
 */
export function containersFromProbe(formatName: string): Set<Format> {
  const found = new Set<Format>();
  for (const name of formatName.split(',').map((n) => n.trim().toLowerCase())) {
    for (const alias of PROBE_ALIASES[name] ?? []) found.add(alias);
    if ((ALL_FORMATS as readonly string[]).includes(name)) found.add(name as Format);
  }
  return found;
}

/** The label to show a user: their claim when it is truthful, else our best read. */
export function resolveContainer(probed: Set<Format>, claimed: Format | null): Format | null {
  if (claimed && probed.has(claimed)) return claimed;
  return probed.values().next().value ?? null;
}

const PROBE_ALIASES: Record<string, Format[]> = {
  mov: ['mov'],
  mp4: ['mp4'],
  m4a: ['m4a'],
  m4v: ['mp4'],
  matroska: ['mkv'],
  webm: ['webm'],
  mp3: ['mp3'],
  wav: ['wav'],
  ogg: ['ogg'],
  avi: ['avi'],
  flac: ['flac'],
  aac: ['aac'],
  image2: ['png', 'jpg'],
  png_pipe: ['png'],
  jpeg_pipe: ['jpg', 'jpeg'],
  mjpeg: ['jpg', 'jpeg'],
  webp_pipe: ['webp'],
  gif: ['gif'],
  apng: ['apng'],
  tiff_pipe: ['tiff'],
};
