import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { composeSheet, dHash, fetchImageBytes, hamming } from './visual.js';

async function gradient(flip: boolean): Promise<Buffer> {
  const raw = Buffer.alloc(64 * 48);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) raw[y * 64 + x] = flip ? 255 - x * 3 : x * 3;
  return sharp(raw, { raw: { width: 64, height: 48, channels: 1 } }).png().toBuffer();
}

describe('dHash', () => {
  it('is stable under resizing and slight dimming, and far from the opposite ramp', async () => {
    const a = await dHash(await gradient(false));
    const small = await dHash(await sharp(await gradient(false)).resize(32, 24).png().toBuffer());
    const dim = await dHash(await sharp(await gradient(false)).modulate({ brightness: 0.9 }).png().toBuffer());
    const opposite = await dHash(await gradient(true));

    expect(hamming(a!, small!)).toBeLessThanOrEqual(4);
    expect(hamming(a!, dim!)).toBeLessThanOrEqual(4);
    expect(hamming(a!, opposite!)).toBeGreaterThan(32);
  });

  it('answers undefined for bytes that are not an image', async () => {
    expect(await dHash(Buffer.from('<html>not an image</html>'))).toBeUndefined();
  });
});

describe('composeSheet', () => {
  it('lays cells out row-major in a fixed grid and leaves a gap for a missing cell', async () => {
    const cell = await gradient(false);
    const sheet = await composeSheet([cell, undefined, cell, cell, cell, cell, cell, cell]);
    const meta = await sharp(sheet.png).metadata();

    expect(sheet).toMatchObject({ columns: 6, rows: 2, cells: 8 });
    expect(meta).toMatchObject({ format: 'png', width: sheet.width, height: sheet.height });
    expect(sheet.width).toBe(6 * sheet.cellWidth + 7 * 4);
  });
});

describe('fetchImageBytes', () => {
  let server: Server | undefined;
  afterEach(() => void server?.close());

  async function serve(handler: Parameters<typeof createServer>[1]): Promise<string> {
    server = createServer(handler);
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/x`;
  }
  const open = { guard: async () => ({ ok: true as const }) };

  it('refuses a private address by default', async () => {
    const url = await serve((_q, s) => s.end('x'));
    expect(await fetchImageBytes(url, AbortSignal.timeout(2000))).toBeUndefined();
  });

  it('returns image bytes, and nothing for a non-image type or an oversized body', async () => {
    const png = await gradient(false);
    const url = await serve((req, res) => {
      if (req.url === '/x') res.writeHead(200, { 'content-type': 'image/png' }).end(png);
    });
    expect((await fetchImageBytes(url, AbortSignal.timeout(2000), open))?.length).toBe(png.length);

    const html = await serve((_q, s) => s.writeHead(200, { 'content-type': 'text/html' }).end('<p>x</p>'));
    expect(await fetchImageBytes(html, AbortSignal.timeout(2000), open)).toBeUndefined();

    const big = await serve((_q, s) => s.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.alloc(3_000_000)));
    expect(await fetchImageBytes(big, AbortSignal.timeout(2000), open)).toBeUndefined();
  });
});
