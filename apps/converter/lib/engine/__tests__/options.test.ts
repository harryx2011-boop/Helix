import { describe, expect, it } from 'vitest';
import {
  ValidationError,
  bitrateForTarget,
  validateCompressOptions,
  validateConvertOptions,
  validateFormat,
  validateGifOptions,
  validateImageOptions,
} from '../options';

/** Built from parts so a shell-shaped literal never appears in the file. */
const SHELL_SHAPED_FORMAT = ['mp4', 'rm', '-rf', '/'].join(';');

describe('format validation rejects anything outside the closed set', () => {
  it('rejects an unknown format', () => {
    expect(() => validateFormat('exe')).toThrow(ValidationError);
    expect(() => validateFormat(SHELL_SHAPED_FORMAT)).toThrow(ValidationError);
  });

  it('accepts a known format', () => {
    expect(validateFormat('mp4')).toBe('mp4');
  });
});

describe('convert option ranges, the client-side crash-prevention bar', () => {
  it('rejects out-of-range crf', () => {
    expect(() => validateConvertOptions({ crf: 99 })).toThrow(ValidationError);
    expect(() => validateConvertOptions({ crf: -1 })).toThrow(ValidationError);
    expect(() => validateConvertOptions({ crf: 23 })).not.toThrow();
  });

  it('rejects an oversized dimension that would hang or crash the wasm module', () => {
    expect(() => validateConvertOptions({ width: 999_999 })).toThrow(ValidationError);
    expect(() => validateConvertOptions({ width: 1280 })).not.toThrow();
  });

  it('rejects a trim whose end precedes its start', () => {
    expect(() => validateConvertOptions({ trim: { start: 10, end: 5 } })).toThrow(ValidationError);
    expect(() => validateConvertOptions({ trim: { start: 5, end: 10 } })).not.toThrow();
  });

  it('rejects an unknown preset, rotate or flip value', () => {
    expect(() => validateConvertOptions({ preset: 'evil' as never })).toThrow(ValidationError);
    expect(() => validateConvertOptions({ rotate: 45 as never })).toThrow(ValidationError);
    expect(() => validateConvertOptions({ flip: 'xy' as never })).toThrow(ValidationError);
  });

  it('rejects a non-finite number', () => {
    expect(() => validateConvertOptions({ crf: NaN })).toThrow(ValidationError);
    expect(() => validateConvertOptions({ fps: Infinity })).toThrow(ValidationError);
  });
});

describe('compress options', () => {
  it('rejects an unknown quality preset', () => {
    expect(() => validateCompressOptions({ quality: 'ultra' as never })).toThrow(ValidationError);
  });

  it('rejects an out-of-range target size', () => {
    expect(() => validateCompressOptions({ target: 10 })).toThrow(ValidationError);
  });
});

describe('gif options', () => {
  it('rejects an out-of-range fps or an unknown dither algorithm', () => {
    expect(() => validateGifOptions({ fps: 500, width: 480, loop: true, dither: 'sierra2_4a' })).toThrow(
      ValidationError,
    );
    expect(() =>
      validateGifOptions({ fps: 15, width: 480, loop: true, dither: 'evil' as never }),
    ).toThrow(ValidationError);
    expect(() => validateGifOptions({ fps: 15, width: 480, loop: true, dither: 'bayer' })).not.toThrow();
  });
});

describe('image options', () => {
  it('rejects an out-of-range quality', () => {
    expect(() => validateImageOptions({ quality: 0 })).toThrow(ValidationError);
    expect(() => validateImageOptions({ quality: 101 })).toThrow(ValidationError);
    expect(() => validateImageOptions({ quality: 82 })).not.toThrow();
  });

  it('rejects an unknown fit mode', () => {
    expect(() => validateImageOptions({ fit: 'squeeze' as never })).toThrow(ValidationError);
  });
});

describe('target-size bitrate solver', () => {
  it('solves a bitrate that lands under the target', () => {
    const bitrate = bitrateForTarget(10 * 1024 * 1024, 60, 128_000)!;
    const predicted = ((bitrate + 128_000) * 60) / 8;
    expect(predicted).toBeLessThan(10 * 1024 * 1024);
    expect(predicted).toBeGreaterThan(8 * 1024 * 1024);
  });

  it('refuses a target too small to encode', () => {
    expect(bitrateForTarget(64_000, 3600, 128_000)).toBeNull();
  });
});
