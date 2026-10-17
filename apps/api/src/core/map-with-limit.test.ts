import { describe, expect, it } from 'vitest';
import { mapWithLimit } from './map-with-limit.js';

describe('mapWithLimit', () => {
  it('preserves input order regardless of completion order', async () => {
    const out = await mapWithLimit([30, 10, 20], 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    expect(out).toEqual([30, 10, 20]);
  });

  it('handles an empty input', async () => {
    expect(await mapWithLimit([], 4, async (x: number) => x)).toEqual([]);
  });
});
