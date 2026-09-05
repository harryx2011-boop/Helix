import { describe, expect, it } from 'vitest';
import { ALL_FORMATS, engineFor, isFormat, kindOf } from '../formats';

describe('format enum', () => {
  it('accepts every declared format and rejects anything else', () => {
    for (const f of ALL_FORMATS) expect(isFormat(f)).toBe(true);
    expect(isFormat('exe')).toBe(false);
    expect(isFormat('heic')).toBe(false);
  });

  it('does not offer heic as an output target: no wasm build can encode real HEVC HEIC', () => {
    expect((ALL_FORMATS as readonly string[]).includes('heic')).toBe(false);
  });

  it('routes stills to the image engine and everything else to ffmpeg', () => {
    expect(engineFor('jpg')).toBe('image');
    expect(engineFor('mp4')).toBe('ffmpeg');
    expect(engineFor('gif')).toBe('ffmpeg');
    expect(engineFor('mp3')).toBe('ffmpeg');
  });

  it('classifies every format into exactly one kind', () => {
    expect(kindOf('mp4')).toBe('video');
    expect(kindOf('mp3')).toBe('audio');
    expect(kindOf('jpg')).toBe('image');
    expect(kindOf('gif')).toBe('gif');
  });
});
