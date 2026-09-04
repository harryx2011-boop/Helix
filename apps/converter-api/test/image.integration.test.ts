import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { convertImage, probeImage } from '../src/ffmpeg/image.js';
import { IMAGE_FORMATS, type Format } from '../src/ffmpeg/formats.js';

/**
 * Real libvips, real files. Capability flags lie: sharp.format.avif.output
 * reports absent on a build that encodes AVIF perfectly well, so support is
 * asserted by converting rather than by asking.
 */
let dir: string;
let source: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'converter-image-'));
  source = join(dir, 'source.png');
  await sharp({
    create: { width: 240, height: 180, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .png()
    .toFile(source);
}, 60_000);

afterAll(() => {
  // libvips can still hold a handle on Windows; a leftover temp dir is not a
  // test failure.
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* swept by the OS */
  }
});

/** Every still format the API advertises must actually round-trip. */
const TARGETS = IMAGE_FORMATS.filter((f) => f !== 'jpeg');

describe.each(TARGETS)('%s', (target) => {
  it('writes a file libvips can read back', async () => {
    const out = join(dir, `out.${target}`);
    await convertImage(source, out, target as Format, { quality: 80 });

    expect(statSync(out).size).toBeGreaterThan(0);
    const meta = await probeImage(out);
    expect(meta.width).toBe(240);
    expect(meta.height).toBe(180);
  }, 30_000);
});

describe('HEIC specifically', () => {
  // The reason sharp was chosen over ffmpeg. It needs an explicit codec:
  // omitting `compression` throws "Expected one of: av1, hevc".
  it('encodes and decodes', async () => {
    const out = join(dir, 'photo.heic');
    await convertImage(source, out, 'heic', { quality: 70 });

    const meta = await probeImage(out);
    expect(meta.format).toBe('heif');
    expect(meta.width).toBe(240);
  }, 30_000);

  it('can be read as an input and converted onward', async () => {
    const heic = join(dir, 'input.heic');
    const jpg = join(dir, 'from-heic.jpg');
    await convertImage(source, heic, 'heic', { quality: 70 });
    await convertImage(heic, jpg, 'jpg', { quality: 85 });

    const meta = await probeImage(jpg);
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(240);
  }, 30_000);
});

describe('transforms', () => {
  it('resizes without enlarging past the source', async () => {
    const out = join(dir, 'small.jpg');
    await convertImage(source, out, 'jpg', { width: 120 });
    expect((await probeImage(out)).width).toBe(120);

    const big = join(dir, 'big.jpg');
    await convertImage(source, big, 'jpg', { width: 4000 });
    expect((await probeImage(big)).width).toBe(240);
  }, 30_000);

  it('rotates by a quarter turn, swapping the axes', async () => {
    const out = join(dir, 'rotated.png');
    await convertImage(source, out, 'png', { rotate: 90 });

    const meta = await probeImage(out);
    expect(meta.width).toBe(180);
    expect(meta.height).toBe(240);
  }, 30_000);

  it('honours quality on a lossy target', async () => {
    const low = join(dir, 'low.jpg');
    const high = join(dir, 'high.jpg');
    await convertImage(source, low, 'jpg', { quality: 20 });
    await convertImage(source, high, 'jpg', { quality: 95 });

    expect(statSync(low).size).toBeLessThan(statSync(high).size);
  }, 30_000);

  it('rejects a target that is not a still format', async () => {
    await expect(convertImage(source, join(dir, 'x.mp4'), 'mp4' as Format, {})).rejects.toThrow();
  });
});
