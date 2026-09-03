import type { Format } from './formats.js';
import { kindOf } from './formats.js';
import type { CompressOptions, ConvertOptions, GifOptions } from './options.js';

/**
 * Every argv is built here and nowhere else. Values reaching this module have
 * already passed their zod schema, so each is a number in range or a member of
 * a closed set — never an arbitrary string. Paths are server-generated.
 *
 * ffmpeg is only ever allowed to touch the local filesystem: no network
 * protocol, no concat/subfile indirection, no reading a path the caller named.
 */
const PROTOCOL_GUARD = ['-protocol_whitelist', 'file', '-f'] as const;

const VIDEO_CODEC: Partial<Record<Format, string[]>> = {
  mp4: ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'],
  mov: ['-c:v', 'libx264', '-pix_fmt', 'yuv420p'],
  webm: ['-c:v', 'libvpx-vp9', '-row-mt', '1'],
  mkv: ['-c:v', 'libx264', '-pix_fmt', 'yuv420p'],
  avi: ['-c:v', 'mpeg4'],
};

const AUDIO_CODEC: Partial<Record<Format, string[]>> = {
  mp3: ['-c:a', 'libmp3lame'],
  wav: ['-c:a', 'pcm_s16le'],
  ogg: ['-c:a', 'libvorbis'],
  m4a: ['-c:a', 'aac'],
  aac: ['-c:a', 'aac'],
  flac: ['-c:a', 'flac'],
};

function videoFilters(o: ConvertOptions): string[] {
  const filters: string[] = [];
  if (o.crop) filters.push(`crop=${o.crop.width}:${o.crop.height}:${o.crop.x}:${o.crop.y}`);
  if (o.width || o.height) filters.push(`scale=${o.width ?? -2}:${o.height ?? -2}`);
  if (o.flip === 'h' || o.flip === 'hv') filters.push('hflip');
  if (o.flip === 'v' || o.flip === 'hv') filters.push('vflip');
  if (o.rotate === 90) filters.push('transpose=1');
  if (o.rotate === 180) filters.push('transpose=1,transpose=1');
  if (o.rotate === 270) filters.push('transpose=2');
  if (o.fps) filters.push(`fps=${o.fps}`);
  return filters;
}

/** Trim flags go before -i so ffmpeg seeks rather than decoding and discarding. */
function trimArgs(o: ConvertOptions): string[] {
  if (!o.trim) return [];
  return ['-ss', String(o.trim.start), '-t', String(o.trim.end - o.trim.start)];
}

export function convertArgs(
  input: string,
  output: string,
  to: Format,
  o: ConvertOptions,
  inputFormat: Format,
  durationSec = 0,
): string[] {
  // A caller can ask for a size target and a format change in one request; the
  // solved bitrate wins over crf when both are present.
  if (o.targetBytes && durationSec > 0 && kindOf(to) !== 'audio') {
    const bitrate = bitrateForTarget(o.targetBytes, durationSec, o.audioBitrate ?? 128_000);
    if (bitrate) o = { ...o, videoBitrate: bitrate, crf: undefined };
  }

  const args = [
    '-hide_banner',
    '-nostdin',
    '-y',
    ...PROTOCOL_GUARD,
    inputFormat === 'mkv' ? 'matroska' : inputFormat,
    ...trimArgs(o),
    '-i',
    input,
  ];

  const target = kindOf(to);

  if (target === 'audio') {
    args.push('-vn', ...(AUDIO_CODEC[to] ?? []));
    if (o.audioBitrate) args.push('-b:a', String(o.audioBitrate));
  } else {
    args.push(...(VIDEO_CODEC[to] ?? []));
    const filters = videoFilters(o);
    if (filters.length) args.push('-vf', filters.join(','));
    if (o.crf !== undefined) args.push('-crf', String(o.crf));
    if (o.videoBitrate) args.push('-b:v', String(o.videoBitrate));
    if (o.preset) args.push('-preset', o.preset);
    if (o.stripAudio) args.push('-an');
    else {
      args.push('-c:a', to === 'webm' ? 'libopus' : 'aac');
      if (o.audioBitrate) args.push('-b:a', String(o.audioBitrate));
    }
  }

  args.push('-progress', 'pipe:1', '-nostats', output);
  return args;
}

/**
 * Two-pass palette generation. A single-pass GIF quantises per frame and
 * bands badly; palettegen over the whole clip is what makes it watchable.
 */
export function gifArgs(
  input: string,
  paletteOut: string,
  o: GifOptions,
  inputFormat: Format,
): { palette: string[]; render: (palette: string, output: string) => string[] } {
  const base = [
    '-hide_banner',
    '-nostdin',
    '-y',
    ...PROTOCOL_GUARD,
    inputFormat === 'mkv' ? 'matroska' : inputFormat,
    ...(o.trim ? ['-ss', String(o.trim.start), '-t', String(o.trim.end - o.trim.start)] : []),
    '-i',
    input,
  ];
  const chain = `fps=${o.fps},scale=${o.width}:-1:flags=lanczos`;

  return {
    palette: [...base, '-vf', `${chain},palettegen=stats_mode=diff`, paletteOut],
    render: (palette, output) => [
      ...base,
      '-i',
      palette,
      '-lavfi',
      `${chain}[x];[x][1:v]paletteuse=dither=${o.dither}`,
      '-loop',
      o.loop ? '0' : '-1',
      '-progress',
      'pipe:1',
      '-nostats',
      output,
    ],
  };
}

/**
 * Bitrate to land a target size: (bytes * 8 / seconds), minus the audio
 * allowance, with 6% held back for container overhead.
 */
export function bitrateForTarget(
  targetBytes: number,
  durationSec: number,
  audioBitrate: number,
): number | null {
  if (durationSec <= 0) return null;
  const total = (targetBytes * 8) / durationSec;
  const video = Math.floor((total - audioBitrate) * 0.94);
  return video > 10_000 ? video : null;
}

export function compressArgs(
  input: string,
  output: string,
  to: Format,
  o: CompressOptions,
  inputFormat: Format,
  durationSec: number,
): string[] {
  const audioBitrate = o.audioBitrate ?? 128_000;
  const resolved: ConvertOptions = { ...o, audioBitrate };

  if (o.target) {
    const bitrate = bitrateForTarget(o.target, durationSec, audioBitrate);
    if (bitrate) {
      resolved.videoBitrate = bitrate;
      delete resolved.crf;
    }
  } else if (resolved.crf === undefined) {
    resolved.crf = o.quality === 'archive' ? 18 : o.quality === 'web' ? 26 : 23;
  }

  return convertArgs(input, output, to, resolved, inputFormat);
}

export function probeArgs(input: string): string[] {
  return [
    '-hide_banner',
    '-v',
    'error',
    '-show_entries',
    'format=format_name,duration,size:stream=codec_type,codec_name,width,height',
    '-of',
    'json',
    input,
  ];
}
