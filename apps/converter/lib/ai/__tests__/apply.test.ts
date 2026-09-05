import { describe, expect, it } from 'vitest';
import { intentToSettingsPatch } from '../apply';

describe('intentToSettingsPatch reshapes a validated intent into a ConvertSettings patch', () => {
  it('maps a convert intent', () => {
    expect(intentToSettingsPatch({ op: 'convert', to: 'mov', options: { crf: 20 } })).toEqual({ to: 'mov' });
  });

  it('maps a gif intent into the nested gif field', () => {
    expect(intentToSettingsPatch({ op: 'gif', fps: 12, width: 480, options: { loop: true, dither: 'bayer' } })).toEqual({
      to: 'gif',
      gif: { fps: 12, width: 480 },
    });
  });

  it('maps a compress intent with a preset, translating archive to null', () => {
    expect(intentToSettingsPatch({ op: 'compress', preset: 'archive', options: {} })).toEqual({ preset: null });
  });

  it('maps a compress intent with a byte target', () => {
    expect(intentToSettingsPatch({ op: 'compress', target: 10_000_000, options: {} })).toEqual({ targetBytes: 10_000_000 });
  });

  it('maps an image intent with resize and quality', () => {
    expect(intentToSettingsPatch({ op: 'image', to: 'webp', quality: 70, resize: { width: 800, height: 600 }, options: {} })).toEqual({
      to: 'webp',
      quality: 70,
      resize: { width: 800, height: 600 },
    });
  });
});
