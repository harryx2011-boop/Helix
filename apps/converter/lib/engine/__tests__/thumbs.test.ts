import { describe, expect, it } from 'vitest';
import { thumbsArgs } from '../args';
import { ValidationError, validateThumbsOptions } from '../options';

describe('thumbsArgs', () => {
  it('seeks before -i for a poster, so ffmpeg does not decode up to the timestamp', () => {
    const args = thumbsArgs('in.mp4', 'out.png', { mode: 'poster', width: 640, at: 12 });
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args[args.indexOf('-ss') + 1]).toBe('12');
    expect(args).toContain('out.png');
  });

  it('takes exactly one frame for a poster', () => {
    const args = thumbsArgs('in.mp4', 'out.png', { mode: 'poster', width: 320 });
    expect(args[args.indexOf('-frames:v') + 1]).toBe('1');
  });

  it('spaces sprite frames across the clip, not across a fixed window', () => {
    // 50 frames over 100 seconds is one every two seconds: fps 0.5.
    const args = thumbsArgs('in.mp4', 'out.png', { mode: 'sprite', width: 160, count: 50 }, 100);
    const vf = args[args.indexOf('-vf') + 1] ?? '';
    expect(vf).toMatch(/^fps=0\.500000,/);
  });

  it('lays the sprite out as a grid tall enough for every frame', () => {
    const args = thumbsArgs('in.mp4', 'out.png', { mode: 'sprite', width: 160, count: 23, columns: 5 }, 60);
    const vf = args[args.indexOf('-vf') + 1] ?? '';
    // 23 frames at 5 per row needs 5 rows, not 4.
    expect(vf).toContain('tile=5x5');
  });

  it('falls back to one frame per second when the duration probe failed', () => {
    const args = thumbsArgs('in.mp4', 'out.png', { mode: 'sprite', width: 160, count: 10 }, 0);
    const vf = args[args.indexOf('-vf') + 1] ?? '';
    expect(vf).toMatch(/^fps=1\.000000,/);
  });

  it('bounds a preview by -t after -i, so the duration applies to the trimmed input', () => {
    const args = thumbsArgs('in.mp4', 'out.webp', {
      mode: 'preview',
      width: 480,
      at: 5,
      durationSec: 3,
      fps: 12,
    });
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args.indexOf('-t')).toBeGreaterThan(args.indexOf('-i'));
    expect(args[args.indexOf('-t') + 1]).toBe('3');
    expect(args[args.indexOf('-vf') + 1]).toContain('fps=12');
  });

  it('loops a preview, since a one-shot animation reads as a broken image', () => {
    const args = thumbsArgs('in.mp4', 'out.webp', { mode: 'preview', width: 480 });
    expect(args[args.indexOf('-loop') + 1]).toBe('0');
  });

  it('is an array of discrete tokens, matching ffmpeg.wasm exec()', () => {
    const args = thumbsArgs('in.mp4', 'out.png', { mode: 'sprite', width: 160 }, 30);
    expect(Array.isArray(args)).toBe(true);
    for (const a of args) expect(typeof a).toBe('string');
  });
});

describe('validateThumbsOptions', () => {
  it('accepts each mode', () => {
    for (const mode of ['poster', 'sprite', 'preview'] as const) {
      expect(() => validateThumbsOptions({ mode, width: 320 })).not.toThrow();
    }
  });

  it('rejects an unknown mode', () => {
    // @ts-expect-error deliberately outside the union, the way a bad payload would be
    expect(() => validateThumbsOptions({ mode: 'contact-sheet', width: 320 })).toThrow(ValidationError);
  });

  it('rejects a negative seek', () => {
    expect(() => validateThumbsOptions({ mode: 'poster', width: 320, at: -1 })).toThrow(ValidationError);
  });

  it('refuses a sheet wider than a browser will decode', () => {
    // 20 columns at 1024px is 20,480px across — a job that would fail late.
    expect(() =>
      validateThumbsOptions({ mode: 'sprite', width: 1024, columns: 20 }),
    ).toThrow(ValidationError);
  });

  it('allows a sheet inside the width ceiling', () => {
    expect(() =>
      validateThumbsOptions({ mode: 'sprite', width: 160, columns: 10, count: 40 }),
    ).not.toThrow();
  });

  it('bounds the frame count so one request cannot ask for thousands', () => {
    expect(() => validateThumbsOptions({ mode: 'sprite', width: 160, count: 500 })).toThrow(ValidationError);
  });
});
