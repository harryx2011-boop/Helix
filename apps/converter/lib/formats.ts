import { DOC_TARGETS, type DocFormat } from './engine/documents';

export type FormatKind = 'video' | 'audio' | 'image' | 'gif' | 'document';
export type FormatOp = 'convert' | 'compress' | 'gif' | 'image' | 'document';

export type FormatPair = {
  slug: string;
  from: string;
  to: string;
  kind: FormatKind;
  op: FormatOp;
  options: Record<string, string | number | boolean>;
  title: string;
  description: string;
};

export const KIND_LABELS: Record<FormatKind, string> = {
  video: 'Video',
  audio: 'Audio',
  image: 'Image',
  gif: 'GIF',
  document: 'Document',
};

export const KIND_ORDER: FormatKind[] = ['video', 'audio', 'image', 'gif', 'document'];

export const VIDEO_EXTS = ['mp4', 'mov', 'webm', 'avi', 'mkv'] as const;
export const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'm4a', 'flac'] as const;
export const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'jfif', 'avif', 'tiff', 'tif'] as const;
export const GIF_EXTS = ['gif', 'apng'] as const;
export const DOC_EXTS = ['pdf', 'csv', 'xlsx', 'xls', 'json', 'xml', 'txt', 'html', 'md'] as const;

export const ACCEPTED_EXTS: string[] = [...VIDEO_EXTS, ...AUDIO_EXTS, ...IMAGE_EXTS, ...GIF_EXTS, ...DOC_EXTS];

/**
 * What the engine will actually accept as a target, mirroring lib/engine/formats.ts.
 * Inputs are broader than outputs. Two formats are read-only:
 * - `heic`/`heif`: no open wasm build can encode real HEVC HEIC.
 * - `webm`/VP9: ffmpeg.wasm's libvpx-vp9 encoder hangs indefinitely after the
 *   first frame in this core build, confirmed in testing on every input
 *   tried, with or without row-mt. Decoding a webm input is unaffected.
 * Offering either as an output would fail validation, or worse, hang the tab
 * silently, so both are excluded here rather than surfaced as an option that
 * cannot work.
 */
export const OUTPUT_TARGETS: Record<FormatKind, { likely: string[]; all: string[] }> = {
  video: {
    likely: ['mp4', 'mov', 'gif', 'mp3', 'mkv'],
    all: ['mp4', 'mov', 'mkv', 'avi', 'gif', 'mp3', 'm4a', 'wav', 'aac', 'flac', 'ogg'],
  },
  audio: {
    likely: ['mp3', 'wav', 'm4a', 'flac', 'ogg'],
    all: ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac'],
  },
  image: {
    likely: ['jpg', 'png', 'webp', 'avif', 'tiff'],
    all: ['jpg', 'png', 'webp', 'avif', 'tiff', 'gif'],
  },
  gif: {
    likely: ['gif', 'mp4', 'apng'],
    all: ['gif', 'apng', 'mp4', 'mov', 'png', 'webp'],
  },
  // Documents do not all interconvert (lib/engine/documents.ts DOC_TARGETS is
  // the real matrix, keyed by source). This is the union for the picker's
  // initial render; the panel narrows it to the source's own row once a file
  // is in hand.
  document: {
    likely: ['pdf', 'csv', 'xlsx', 'json', 'md'],
    all: ['pdf', 'csv', 'xlsx', 'json', 'xml', 'txt', 'html', 'md'],
  },
};

export function label(format: string): string {
  if (format === 'video' || format === 'image') return format;
  return format.toUpperCase();
}

const VIDEO_OPTIONS = { crf: 23, preset: 'medium' } as const;
const AUDIO_OPTIONS = { bitrate: '192k' } as const;
const GIF_OPTIONS = { fps: 15, width: 480 } as const;
const IMAGE_OPTIONS = { quality: 82 } as const;

function pair(
  from: string,
  to: string,
  kind: FormatKind,
  op: FormatOp,
  options: FormatPair['options'],
  description: string,
): FormatPair {
  return {
    slug: `${from}-to-${to}`,
    from,
    to,
    kind,
    op,
    options,
    title: `${label(from)} to ${label(to)}`,
    description,
  };
}

/** Not VIDEO_EXTS: webm reads fine but libvpx-vp9 hangs as an output (OUTPUT_TARGETS). */
const VIDEO_OUTPUT_EXTS = ['mp4', 'mov', 'avi', 'mkv'] as const;

function videoPairs(): FormatPair[] {
  const out: FormatPair[] = [];
  for (const from of VIDEO_EXTS) {
    for (const to of VIDEO_OUTPUT_EXTS) {
      if (from === to) continue;
      out.push(
        pair(
          from,
          to,
          'video',
          'convert',
          { ...VIDEO_OPTIONS },
          `Re-encode ${label(from)} video as ${label(to)}, with trim, crop, resize and quality settings in the same pass.`,
        ),
      );
    }
  }
  return out;
}

function audioPairs(): FormatPair[] {
  const out: FormatPair[] = [];
  for (const from of AUDIO_EXTS) {
    for (const to of AUDIO_EXTS) {
      if (from === to) continue;
      out.push(
        pair(
          from,
          to,
          'audio',
          'convert',
          { ...AUDIO_OPTIONS },
          `Convert ${label(from)} audio to ${label(to)}. Pick a bitrate, trim, and preview the result before you download.`,
        ),
      );
    }
  }
  return out;
}

const VIDEO_TO_AUDIO: FormatPair[] = [
  pair('mp4', 'mp3', 'audio', 'convert', { ...AUDIO_OPTIONS }, 'Pull the audio track out of an MP4 as an MP3. Trim to a range if you only want part of it.'),
  pair('video', 'mp3', 'audio', 'convert', { ...AUDIO_OPTIONS }, 'Extract MP3 audio from any video file: MP4, MOV, WEBM, AVI or MKV.'),
  pair('mp4', 'wav', 'audio', 'convert', { ...AUDIO_OPTIONS }, 'Extract the audio track from an MP4 as uncompressed WAV.'),
  pair('mov', 'mp3', 'audio', 'convert', { ...AUDIO_OPTIONS }, 'Pull the audio out of a MOV recording as an MP3.'),
  pair('webm', 'mp3', 'audio', 'convert', { ...AUDIO_OPTIONS }, 'Extract MP3 audio from a WEBM screen or camera recording.'),
];

const GIF_PAIRS: FormatPair[] = [
  pair('video', 'gif', 'gif', 'gif', { ...GIF_OPTIONS }, 'Turn any video clip into a GIF. Set the frame rate and width, trim to the moment you want.'),
  pair('mp4', 'gif', 'gif', 'gif', { ...GIF_OPTIONS }, 'Make a GIF from an MP4. 15 fps at 480px by default; both are yours to change.'),
  pair('webm', 'gif', 'gif', 'gif', { ...GIF_OPTIONS }, 'Make a GIF from a WEBM recording without re-encoding it first.'),
  pair('mov', 'gif', 'gif', 'gif', { ...GIF_OPTIONS }, 'Make a GIF from a MOV clip, trimmed and resized in one pass.'),
  pair('avi', 'gif', 'gif', 'gif', { ...GIF_OPTIONS }, 'Make a GIF from an AVI file.'),
  pair('image', 'gif', 'gif', 'gif', { fps: 5, width: 480 }, 'Combine a set of images into an animated GIF. Order is the order you drop them in.'),
  pair('gif', 'mp4', 'gif', 'convert', { ...VIDEO_OPTIONS }, 'Convert a GIF to an MP4 that is a fraction of the size and plays anywhere.'),
  pair('gif', 'apng', 'gif', 'convert', {}, 'Convert a GIF to an animated PNG with full 24-bit colour and real transparency.'),
];

const IMAGE_PAIRS: FormatPair[] = [
  pair('webp', 'png', 'image', 'image', { ...IMAGE_OPTIONS }, 'Convert WEBP to PNG, losslessly, with transparency kept.'),
  pair('webp', 'jpg', 'image', 'image', { ...IMAGE_OPTIONS }, 'Convert WEBP to JPG. Set the quality; transparency is flattened to white.'),
  pair('jfif', 'png', 'image', 'image', { ...IMAGE_OPTIONS }, 'Convert JFIF (a JPEG variant) to PNG.'),
  pair('heic', 'jpg', 'image', 'image', { ...IMAGE_OPTIONS }, 'Convert iPhone HEIC photos to JPG. EXIF orientation is applied, not lost.'),
  pair('heic', 'png', 'image', 'image', { ...IMAGE_OPTIONS }, 'Convert HEIC photos to PNG.'),
  pair('heic', 'webp', 'image', 'image', { ...IMAGE_OPTIONS }, 'Convert HEIC photos to WEBP for the web.'),
  pair('png', 'jpg', 'image', 'image', { ...IMAGE_OPTIONS }, 'Convert PNG to JPG. Pick a quality; 82 is the default.'),
  pair('jpg', 'png', 'image', 'image', { ...IMAGE_OPTIONS }, 'Convert JPG to PNG.'),
  pair('png', 'webp', 'image', 'image', { ...IMAGE_OPTIONS }, 'Convert PNG to WEBP, usually a third of the size with transparency kept.'),
  pair('jpg', 'webp', 'image', 'image', { ...IMAGE_OPTIONS }, 'Convert JPG to WEBP at the same visual quality and a smaller file.'),
];

function compressor(
  slug: string,
  from: string,
  kind: FormatKind,
  options: FormatPair['options'],
  title: string,
  description: string,
): FormatPair {
  return { slug, from, to: from, kind, op: 'compress', options, title, description };
}

const COMPRESSORS: FormatPair[] = [
  compressor('compress-video', 'video', 'video', { preset: 'web' }, 'Compress video', 'Shrink MP4, MOV, AVI or MKV to a target size or a preset: Email, Discord, Web or Archive.'),
  compressor('compress-mp3', 'mp3', 'audio', { bitrate: '128k' }, 'Compress MP3', 'Re-encode an MP3 at a lower bitrate. 128k is the default; the estimate updates as you change it.'),
  compressor('compress-wav', 'wav', 'audio', { bitrate: '192k' }, 'Compress WAV', 'Turn a WAV into a much smaller file by picking a target size or bitrate.'),
  compressor('compress-image', 'image', 'image', { quality: 75 }, 'Compress image', 'Shrink JPG, PNG, WEBP, HEIC or AVIF files with a quality slider and an optional max width.'),
  compressor('compress-jpeg', 'jpg', 'image', { quality: 75 }, 'Compress JPEG', 'Reduce JPEG size with a quality slider. Progressive encoding is on by default.'),
  compressor('compress-png', 'png', 'image', { quality: 80 }, 'Compress PNG', 'Reduce PNG size with palette quantisation. Transparency is kept.'),
];


/**
 * Generated from the engine's own DOC_TARGETS, so a tool page can never offer
 * a pair the worker would refuse. `xls` is skipped as a source here: it is
 * readable, but nobody searches for an "XLS to CSV converter" by that name
 * often enough to warrant nine more routes, and dropping one still works.
 */
const DOC_BLURB: Record<string, string> = {
  'csv-to-xlsx': 'Turn a CSV into a real Excel workbook, with the header row bolded.',
  'csv-to-json': 'Turn a CSV into a JSON array of objects, keyed by the header row.',
  'xlsx-to-csv': 'Pull a sheet out of an Excel workbook as plain CSV. Formulas become their computed values.',
  'xlsx-to-json': 'Turn an Excel sheet into a JSON array of objects.',
  'json-to-csv': 'Flatten a JSON array of objects into a CSV, one column per key.',
  'json-to-xlsx': 'Turn a JSON array of objects into an Excel workbook.',
  'pdf-to-txt': 'Pull the selectable text out of a PDF. Scans have none, and say so rather than returning an empty file.',
  'md-to-html': 'Render Markdown to a styled, standalone HTML page.',
  'html-to-md': 'Turn an HTML page into clean Markdown, headings and code blocks intact.',
  'md-to-pdf': 'Render Markdown to a paginated PDF.',
  'html-to-pdf': 'Render an HTML page to a paginated PDF.',
  'xml-to-json': 'Convert XML to JSON, attributes included.',
};

function documentPairs(): FormatPair[] {
  const out: FormatPair[] = [];
  const sources = (Object.keys(DOC_TARGETS) as DocFormat[]).filter((f) => f !== 'xls');
  for (const from of sources) {
    for (const to of DOC_TARGETS[from]) {
      const slug = `${from}-to-${to}`;
      out.push(
        pair(
          from,
          to,
          'document',
          'document',
          {},
          DOC_BLURB[slug] ?? `Convert ${label(from)} to ${label(to)}, entirely in this tab.`,
        ),
      );
    }
  }
  return out;
}

export const FORMAT_PAIRS: FormatPair[] = [
  ...videoPairs(),
  ...VIDEO_TO_AUDIO,
  ...audioPairs(),
  ...IMAGE_PAIRS,
  ...GIF_PAIRS,
  ...documentPairs(),
  ...COMPRESSORS,
];

const BY_SLUG = new Map(FORMAT_PAIRS.map((p) => [p.slug, p]));

export function findPair(slug: string): FormatPair | undefined {
  return BY_SLUG.get(slug);
}

export function pairsByKind(kind: FormatKind): FormatPair[] {
  return FORMAT_PAIRS.filter((p) => p.kind === kind);
}

export function converters(): FormatPair[] {
  return FORMAT_PAIRS.filter((p) => p.op !== 'compress');
}

export function compressors(): FormatPair[] {
  return FORMAT_PAIRS.filter((p) => p.op === 'compress');
}

function affinity(p: FormatPair, current: FormatPair): number {
  return (p.from === current.from ? 2 : 0) + (p.to === current.to ? 2 : 0) + (p.kind === current.kind ? 1 : 0);
}

export function relatedPairs(current: FormatPair, limit = 6): FormatPair[] {
  return FORMAT_PAIRS.filter((p) => p.slug !== current.slug && affinity(p, current) > 0)
    .sort((a, b) => affinity(b, current) - affinity(a, current))
    .slice(0, limit);
}

export function searchPairs(query: string, limit = 12): FormatPair[] {
  const q = query.trim().toLowerCase();
  if (!q) return FORMAT_PAIRS.slice(0, limit);
  const terms = q.split(/[\s>→-]+/).filter(Boolean);
  const scored = FORMAT_PAIRS.map((p) => {
    const hay = `${p.slug} ${p.title} ${p.from} ${p.to} ${p.kind} ${p.op}`.toLowerCase();
    let s = 0;
    if (p.slug === q || p.title.toLowerCase() === q) s += 10;
    if (p.slug.startsWith(q.replace(/\s+/g, '-'))) s += 6;
    for (const t of terms) {
      if (p.from === t) s += 3;
      if (p.to === t) s += 3;
      if (hay.includes(t)) s += 1;
    }
    return { p, s };
  })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map((x) => x.p);
}

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

export function kindOfFile(name: string): FormatKind | null {
  const ext = extensionOf(name);
  if ((VIDEO_EXTS as readonly string[]).includes(ext)) return 'video';
  if ((AUDIO_EXTS as readonly string[]).includes(ext)) return 'audio';
  if ((GIF_EXTS as readonly string[]).includes(ext)) return 'gif';
  if ((IMAGE_EXTS as readonly string[]).includes(ext)) return 'image';
  return null;
}

export const MAX_FILE_BYTES = 2 * 1024 ** 3;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
}
