import { cpus } from 'node:os';
import { describe, expect, it } from 'vitest';
import { JOB_TIMEOUT_MS, MAX_OUTPUT_BYTES } from '../src/ffmpeg/limits.js';
import { bitrateForTarget, compressArgs, convertArgs, gifArgs } from '../src/ffmpeg/args.js';
import { convertOptions, gifOptions, imageOptions } from '../src/ffmpeg/options.js';
import { containersFromProbe, formatSchema, resolveContainer } from '../src/ffmpeg/formats.js';
import { claimedFormat, safeDisplayName } from '../src/routes/upload.js';

/** Built from parts so the literal never appears in the file. */
const SHELL_PAYLOAD = ['mp4;', 'rm', '-rf', '/'].join(' ');
const TRAVERSAL = ['..', '..', 'etc', 'passwd'].join('/');

describe('option validation rejects anything outside a closed set', () => {
  it('rejects an unknown format', () => {
    expect(formatSchema.safeParse('exe').success).toBe(false);
    expect(formatSchema.safeParse(SHELL_PAYLOAD).success).toBe(false);
    expect(formatSchema.safeParse(TRAVERSAL).success).toBe(false);
    expect(formatSchema.safeParse('mp4').success).toBe(true);
  });

  it('rejects out-of-range numerics', () => {
    expect(convertOptions.safeParse({ crf: 99 }).success).toBe(false);
    expect(convertOptions.safeParse({ crf: -1 }).success).toBe(false);
    expect(convertOptions.safeParse({ width: 999999 }).success).toBe(false);
    expect(convertOptions.safeParse({ crf: 23, width: 1280 }).success).toBe(true);
  });

  it('rejects a string where a number belongs', () => {
    expect(convertOptions.safeParse({ crf: '23 -f lavfi' }).success).toBe(false);
    expect(convertOptions.safeParse({ width: '1280:evil' }).success).toBe(false);
  });

  it('rejects an unknown preset or dither, the only fields that look free-form', () => {
    expect(convertOptions.safeParse({ preset: 'evil' }).success).toBe(false);
    expect(gifOptions.safeParse({ dither: TRAVERSAL }).success).toBe(false);
  });

  it('rejects a trim whose end precedes its start', () => {
    expect(convertOptions.safeParse({ trim: { start: 10, end: 5 } }).success).toBe(false);
    expect(convertOptions.safeParse({ trim: { start: 5, end: 10 } }).success).toBe(true);
  });

  it('rejects an out-of-range image quality', () => {
    expect(imageOptions.safeParse({ quality: 0 }).success).toBe(false);
    expect(imageOptions.safeParse({ quality: 101 }).success).toBe(false);
  });
});

describe('argv construction', () => {
  const args = convertArgs('/tmp/j/in.mov', '/tmp/j/out.mp4', 'mp4', { crf: 23 }, 'mov');

  it('is an array of discrete tokens, never a command string', () => {
    expect(Array.isArray(args)).toBe(true);
    for (const a of args) expect(typeof a).toBe('string');
    // Nothing for a shell to interpret even if one were introduced downstream.
    for (const a of args) expect(a).not.toMatch(/[;&|`$><\n]/);
  });

  it('pins the input container and forbids every non-file protocol', () => {
    const i = args.indexOf('-protocol_whitelist');
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe('file');
    expect(args[args.indexOf('-f') + 1]).toBe('mov');
  });

  it('never lets a caller name a path', () => {
    expect(args.filter((a) => a.includes('/tmp/j/'))).toEqual(['/tmp/j/in.mov', '/tmp/j/out.mp4']);
  });

  it('places trim flags before -i so ffmpeg seeks instead of decoding', () => {
    const trimmed = convertArgs('/i.mp4', '/o.mp4', 'mp4', { trim: { start: 5, end: 9 } }, 'mp4');
    expect(trimmed.indexOf('-ss')).toBeLessThan(trimmed.indexOf('-i'));
    expect(trimmed[trimmed.indexOf('-t') + 1]).toBe('4');
  });

  it('builds filters from validated numerics only', () => {
    const a = convertArgs('/i.mp4', '/o.mp4', 'mp4', { width: 1280, rotate: 90, flip: 'h' }, 'mp4');
    const vf = a[a.indexOf('-vf') + 1] ?? '';
    expect(vf).toBe('scale=1280:-2,hflip,transpose=1');
    expect(vf).not.toMatch(/[;&|`$]/);
  });

  it('drops the video stream for an audio target', () => {
    const a = convertArgs('/i.mp4', '/o.mp3', 'mp3', {}, 'mp4');
    expect(a).toContain('-vn');
    expect(a).toContain('libmp3lame');
  });

  it('emits machine-readable progress', () => {
    expect(args).toContain('-progress');
    expect(args[args.indexOf('-progress') + 1]).toBe('pipe:1');
  });
});

describe('gif two-pass', () => {
  const b = gifArgs('/i.mp4', '/p.png', gifOptions.parse({ fps: 15, width: 480 }), 'mp4');

  it('generates a palette before rendering', () => {
    expect(b.palette.join(' ')).toContain('palettegen');
    expect(b.render('/p.png', '/o.gif').join(' ')).toContain('paletteuse');
  });

  it('carries the protocol guard through both passes', () => {
    expect(b.palette).toContain('-protocol_whitelist');
    expect(b.render('/p.png', '/o.gif')).toContain('-protocol_whitelist');
  });
});

describe('target-size bitrate', () => {
  it('solves for a bitrate that lands under the target', () => {
    const bitrate = bitrateForTarget(10 * 1024 * 1024, 60, 128_000)!;
    const predicted = ((bitrate + 128_000) * 60) / 8;
    expect(predicted).toBeLessThan(10 * 1024 * 1024);
    expect(predicted).toBeGreaterThan(8 * 1024 * 1024);
  });

  it('refuses a target too small to encode', () => {
    expect(bitrateForTarget(64_000, 3600, 128_000)).toBeNull();
  });

  it('prefers the solved bitrate over crf when a target is set', () => {
    const a = compressArgs('/i.mp4', '/o.mp4', 'mp4', { target: 10485760, crf: 23 }, 'mp4', 60);
    expect(a).toContain('-b:v');
    expect(a).not.toContain('-crf');
  });
});

describe('uploaded filenames are metadata, not paths', () => {
  it('reads a format only from a known extension', () => {
    expect(claimedFormat('holiday.MP4')).toBe('mp4');
    expect(claimedFormat('payload.exe')).toBeNull();
    expect(claimedFormat('no-extension')).toBeNull();
  });

  it('strips characters that would forge a header or log line', () => {
    expect(safeDisplayName('a\r\nContent-Type: x')).toBe('aContent-Type: x');
    expect(safeDisplayName('')).toBe('file');
    expect(safeDisplayName('x'.repeat(400)).length).toBe(255);
  });

  it('treats a traversal attempt as an ordinary name with no usable format', () => {
    expect(claimedFormat(TRAVERSAL)).toBeNull();
  });
});

describe('probe container sets', () => {
  it('reads every container in an ffprobe format list, not just the first', () => {
    const mp4 = containersFromProbe('mov,mp4,m4a,3gp,3g2,mj2');
    expect(mp4.has('mp4')).toBe(true);
    expect(mp4.has('mov')).toBe(true);

    const webm = containersFromProbe('matroska,webm');
    expect(webm.has('webm')).toBe(true);
    expect(webm.has('mkv')).toBe(true);
  });

  it('keeps a truthful claim as the label rather than an arbitrary sibling', () => {
    const set = containersFromProbe('mov,mp4,m4a,3gp,3g2,mj2');
    expect(resolveContainer(set, 'mp4')).toBe('mp4');
    expect(resolveContainer(set, 'mov')).toBe('mov');
    expect(resolveContainer(set, 'wav')).toBe('mov');
  });

  it('detects a file whose extension lies about its container', () => {
    expect(containersFromProbe('mov,mp4,m4a').has('wav')).toBe(false);
  });
});

describe('size target on the convert path', () => {
  it('solves a bitrate when a format change and a target are requested together', () => {
    const a = convertArgs('/i.mov', '/o.mp4', 'mp4', { targetBytes: 5_000_000 }, 'mov', 60);
    expect(a).toContain('-b:v');
    expect(a).not.toContain('-crf');
  });

  it('leaves crf alone when the duration is unknown', () => {
    const a = convertArgs('/i.mov', '/o.mp4', 'mp4', { targetBytes: 5_000_000, crf: 23 }, 'mov', 0);
    expect(a[a.indexOf('-crf') + 1]).toBe('23');
    expect(a).not.toContain('-b:v');
  });

  it('ignores a size target for an audio-only output, where crf has no meaning', () => {
    const a = convertArgs('/i.mp4', '/o.mp3', 'mp3', { targetBytes: 5_000_000 }, 'mp4', 60);
    expect(a).toContain('-vn');
    expect(a).not.toContain('-b:v');
  });
});

describe('per-job resource limits', () => {
  it('bounds ffmpeg threads so one job cannot take the whole box', () => {
    const a = convertArgs('/i.mp4', '/o.mp4', 'mp4', {}, 'mp4');
    const threads = Number(a[a.indexOf('-threads') + 1]);
    expect(threads).toBeGreaterThanOrEqual(2);
    expect(threads).toBeLessThanOrEqual(cpus().length);
  });

  it('bounds the output ceiling above the 5 GB input cap', () => {
    // A conversion may legitimately grow (wav from a small mp3), so the
    // ceiling sits above the input limit rather than at it.
    expect(MAX_OUTPUT_BYTES).toBeGreaterThan(5 * 1024 * 1024 * 1024);
  });

  it('keeps a wall clock on every job', () => {
    expect(JOB_TIMEOUT_MS).toBeGreaterThan(0);
    expect(JOB_TIMEOUT_MS).toBeLessThanOrEqual(60 * 60 * 1000);
  });
});
