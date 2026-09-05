import { describe, expect, it } from 'vitest';
import { compressArgs, convertArgs, gifArgs } from '../args';
import { bitrateForTarget } from '../options';

describe('argv construction', () => {
  const args = convertArgs('in.mov', 'out.mp4', 'mp4', { crf: 23 }, 'mov');

  it('is an array of discrete tokens, matching ffmpeg.wasm exec()', () => {
    expect(Array.isArray(args)).toBe(true);
    for (const a of args) expect(typeof a).toBe('string');
  });

  it('names the in-memory FS files ffmpeg.wasm was told to write', () => {
    expect(args).toContain('in.mov');
    expect(args).toContain('out.mp4');
  });

  it('places trim flags before -i so ffmpeg seeks instead of decoding', () => {
    const trimmed = convertArgs('i.mp4', 'o.mp4', 'mp4', { trim: { start: 5, end: 9 } }, 'mp4');
    expect(trimmed.indexOf('-ss')).toBeLessThan(trimmed.indexOf('-i'));
    expect(trimmed[trimmed.indexOf('-t') + 1]).toBe('4');
  });

  it('builds filters from validated numerics only', () => {
    const a = convertArgs('i.mp4', 'o.mp4', 'mp4', { width: 1280, rotate: 90, flip: 'h' }, 'mp4');
    const vf = a[a.indexOf('-vf') + 1] ?? '';
    expect(vf).toBe('scale=1280:-2,hflip,transpose=1');
  });

  it('drops the video stream for an audio target', () => {
    const a = convertArgs('i.mp4', 'o.mp3', 'mp3', {}, 'mp4');
    expect(a).toContain('-vn');
    expect(a).toContain('libmp3lame');
  });

  it('emits machine-readable progress the worker parses into pct/eta', () => {
    expect(args).toContain('-progress');
    expect(args[args.indexOf('-progress') + 1]).toBe('pipe:1');
  });
});

describe('gif two-pass', () => {
  const b = gifArgs('in.mp4', 'p.png', { fps: 15, width: 480, loop: true, dither: 'sierra2_4a' });

  it('generates a palette before rendering', () => {
    expect(b.palette.join(' ')).toContain('palettegen');
    expect(b.render('p.png', 'out.gif').join(' ')).toContain('paletteuse');
  });

  it('produces a plain string array for the render pass, not a closure the worker cannot clone', () => {
    const rendered = b.render('p.png', 'out.gif');
    expect(Array.isArray(rendered)).toBe(true);
    for (const a of rendered) expect(typeof a).toBe('string');
  });
});

describe('target-size bitrate on the convert and compress paths', () => {
  it('solves for a bitrate that lands under the target', () => {
    const bitrate = bitrateForTarget(10 * 1024 * 1024, 60, 128_000)!;
    const predicted = ((bitrate + 128_000) * 60) / 8;
    expect(predicted).toBeLessThan(10 * 1024 * 1024);
  });

  it('prefers the solved bitrate over crf when a target is set', () => {
    const a = compressArgs('i.mp4', 'o.mp4', 'mp4', { target: 10_485_760, crf: 23 }, 'mp4', 60);
    expect(a).toContain('-b:v');
    expect(a).not.toContain('-crf');
  });

  it('solves a bitrate when a format change and a target are requested together', () => {
    const a = convertArgs('i.mov', 'o.mp4', 'mp4', { targetBytes: 5_000_000 }, 'mov', 60);
    expect(a).toContain('-b:v');
    expect(a).not.toContain('-crf');
  });

  it('leaves crf alone when the duration is unknown', () => {
    const a = convertArgs('i.mov', 'o.mp4', 'mp4', { targetBytes: 5_000_000, crf: 23 }, 'mov', 0);
    expect(a[a.indexOf('-crf') + 1]).toBe('23');
    expect(a).not.toContain('-b:v');
  });

  it('ignores a size target for an audio-only output, where crf has no meaning', () => {
    const a = convertArgs('i.mp4', 'o.mp3', 'mp3', { targetBytes: 5_000_000 }, 'mp4', 60);
    expect(a).toContain('-vn');
    expect(a).not.toContain('-b:v');
  });
});
