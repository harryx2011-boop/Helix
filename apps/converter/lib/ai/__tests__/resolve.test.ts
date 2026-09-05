import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../engine/options';
import { parseResolvedIntent } from '../resolve';

/** Built from parts so a shell-shaped literal never appears in the file. */
const SHELL_SHAPED_FORMAT = ['mp4', 'AAAA', 'BBBB', 'CCCC'].join(';');
const HALLUCINATED_KEY = 'exec';

describe('parseResolvedIntent accepts a valid resolution', () => {
  it('accepts a convert intent with in-range options', () => {
    const intent = parseResolvedIntent({ op: 'convert', to: 'mp4', options: { crf: 23, width: 1280 } });
    expect(intent).toEqual({ op: 'convert', to: 'mp4', options: { crf: 23, width: 1280 } });
  });

  it('accepts a compress intent using a preset', () => {
    const intent = parseResolvedIntent({ op: 'compress', preset: 'discord', options: {} });
    expect(intent).toEqual({ op: 'compress', preset: 'discord', options: {} });
  });

  it('accepts a gif intent, defaulting loop/dither the same way the manual path does', () => {
    const intent = parseResolvedIntent({ op: 'gif', fps: 12, width: 480, options: {} });
    expect(intent).toEqual({ op: 'gif', fps: 12, width: 480, options: { loop: true, dither: 'sierra2_4a' } });
  });

  it('accepts an image intent with quality and resize', () => {
    const intent = parseResolvedIntent({ op: 'image', to: 'webp', quality: 82, resize: { width: 800, height: 600 }, options: {} });
    expect(intent).toEqual({ op: 'image', to: 'webp', quality: 82, resize: { width: 800, height: 600 }, options: {} });
  });
});

describe('parseResolvedIntent rejects anything the manual path would also reject', () => {
  it('rejects an unknown format via validateFormat, the same function the manual path calls', () => {
    expect(() => parseResolvedIntent({ op: 'convert', to: 'exe', options: {} })).toThrow(ValidationError);
  });

  it('rejects an out-of-range crf via validateConvertOptions', () => {
    expect(() => parseResolvedIntent({ op: 'convert', to: 'mp4', options: { crf: 99 } })).toThrow(ValidationError);
  });

  it('rejects an out-of-range gif fps via validateGifOptions', () => {
    expect(() => parseResolvedIntent({ op: 'gif', fps: 500, width: 480, options: {} })).toThrow(ValidationError);
  });

  it('rejects an out-of-range image quality via validateImageOptions', () => {
    expect(() => parseResolvedIntent({ op: 'image', to: 'jpg', quality: 150, options: {} })).toThrow(ValidationError);
  });

  it('rejects an unknown quality preset via validateCompressOptions', () => {
    expect(() => parseResolvedIntent({ op: 'compress', preset: 'ultra', options: {} })).toThrow(ValidationError);
  });

  it('rejects an unknown op outright', () => {
    expect(() => parseResolvedIntent({ op: 'delete', options: {} })).toThrow(ValidationError);
  });

  it('rejects a non-object response', () => {
    expect(() => parseResolvedIntent('mp4')).toThrow(ValidationError);
    expect(() => parseResolvedIntent(null)).toThrow(ValidationError);
  });

  it('drops a hallucinated option key rather than passing it through', () => {
    const intent = parseResolvedIntent({ op: 'convert', to: 'mp4', options: { crf: 23, [HALLUCINATED_KEY]: SHELL_SHAPED_FORMAT } });
    expect(intent).toEqual({ op: 'convert', to: 'mp4', options: { crf: 23 } });
  });

  it('rejects a shell-shaped format string the same as the manual path', () => {
    expect(() => parseResolvedIntent({ op: 'convert', to: SHELL_SHAPED_FORMAT, options: {} })).toThrow(ValidationError);
  });
});
