import sharp, { type OverlayOptions } from 'sharp';
import { checkUrl, type UrlVerdict } from '../core/url-guard.js';

/**
 * Pixels for the image sheet: bytes of a search hit's thumbnail, a perceptual
 * hash to spot near-duplicates, and a fixed-size contact-sheet PNG. The hit URLs
 * come from a search backend, so every fetch goes through the same egress guard
 * as a scrape.
 */

const MAX_BYTES = 2_000_000;
const MAX_HOPS = 3;
/** A decoded image may not exceed this many pixels; a small file can claim a huge canvas. */
const MAX_PIXELS = 40_000_000;
const DECODE = { limitInputPixels: MAX_PIXELS, failOn: 'error' } as const;

export const CELL_WIDTH = 160;
export const CELL_HEIGHT = 120;
export const CELL_GAP = 4;
export const MAX_COLUMNS = 6;
/** Cells on one sheet. */
export const MAX_CELLS = 24;
/** Hash bits that may differ (of 64) for two images to count as the same picture. */
export const NEAR_DUPLICATE_BITS = 6;

export interface FetchImageOptions {
  guard?: ((url: string) => Promise<UrlVerdict>) | undefined;
}

export type ImageFetcher = (url: string, signal: AbortSignal) => Promise<Buffer | undefined>;

async function readCapped(response: Response): Promise<Buffer | undefined> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_BYTES || !response.body) return undefined;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.length;
    if (total > MAX_BYTES) return undefined;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** The bytes of a public raster image, or undefined for anything else: a blocked address, a non-image type, an oversized body, a failure. */
export async function fetchImageBytes(
  url: string,
  signal: AbortSignal,
  options: FetchImageOptions = {},
): Promise<Buffer | undefined> {
  const guard = options.guard ?? ((u: string) => checkUrl(u));
  try {
    let target = url;
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      if (!(await guard(target)).ok) return undefined;
      const response = await fetch(target, { redirect: 'manual', signal, headers: { accept: 'image/*' } });
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        target = new URL(location, target).href;
        continue;
      }
      if (!response.ok) return undefined;
      const type = response.headers.get('content-type') ?? '';
      // SVG is a document that can reference other URLs; only raster formats are decoded.
      if (!type.startsWith('image/') || type.startsWith('image/svg')) return undefined;
      return await readCapped(response);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** A 64-bit difference hash: each bit says whether a pixel is brighter than its right neighbour on a 9x8 grayscale thumbnail. */
export async function dHash(bytes: Buffer): Promise<bigint | undefined> {
  try {
    const px = await sharp(bytes, DECODE)
      .flatten({ background: '#ffffff' })
      .grayscale()
      .resize(9, 8, { fit: 'fill' })
      .raw()
      .toBuffer();
    let hash = 0n;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        hash = (hash << 1n) | (px[y * 9 + x]! > px[y * 9 + x + 1]! ? 1n : 0n);
      }
    }
    return hash;
  } catch {
    return undefined;
  }
}

export function hamming(a: bigint, b: bigint): number {
  let diff = a ^ b;
  let bits = 0;
  while (diff) {
    bits += Number(diff & 1n);
    diff >>= 1n;
  }
  return bits;
}

export interface Sheet {
  png: Buffer;
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  width: number;
  height: number;
  /** Cells laid out, filled or not. */
  cells: number;
}

/** Row-major grid of fixed-size cells; an undefined or undecodable entry leaves its cell blank. */
export async function composeSheet(images: (Buffer | undefined)[]): Promise<Sheet> {
  const cells = Math.min(images.length, MAX_CELLS);
  const columns = Math.min(cells, MAX_COLUMNS);
  const rows = Math.ceil(cells / columns);
  const width = columns * CELL_WIDTH + (columns + 1) * CELL_GAP;
  const height = rows * CELL_HEIGHT + (rows + 1) * CELL_GAP;

  const layers: OverlayOptions[] = [];
  await Promise.all(
    images.slice(0, cells).map(async (bytes, i) => {
      if (!bytes) return;
      try {
        const input = await sharp(bytes, DECODE)
          .flatten({ background: '#ffffff' })
          .resize(CELL_WIDTH, CELL_HEIGHT, { fit: 'cover' })
          .png()
          .toBuffer();
        layers.push({
          input,
          left: CELL_GAP + (i % columns) * (CELL_WIDTH + CELL_GAP),
          top: CELL_GAP + Math.floor(i / columns) * (CELL_HEIGHT + CELL_GAP),
        });
      } catch {
        // an undecodable image leaves its cell blank
      }
    }),
  );

  const png = await sharp({ create: { width, height, channels: 3, background: '#202020' } })
    .composite(layers)
    .png({ palette: true, quality: 80 })
    .toBuffer();
  return { png, columns, rows, cellWidth: CELL_WIDTH, cellHeight: CELL_HEIGHT, width, height, cells };
}
