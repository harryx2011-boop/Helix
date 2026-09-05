/// <reference lib="webworker" />
import decodeJpeg, { init as initJpegDec } from '@jsquash/jpeg/decode';
import encodeJpeg, { init as initJpegEnc } from '@jsquash/jpeg/encode';
import decodePng, { init as initPngDec } from '@jsquash/png/decode';
import encodePng, { init as initPngEnc } from '@jsquash/png/encode';
import decodeWebp, { init as initWebpDec } from '@jsquash/webp/decode';
import encodeWebp, { init as initWebpEnc } from '@jsquash/webp/encode';
import decodeAvif, { init as initAvifDec } from '@jsquash/avif/decode';
import encodeAvif, { init as initAvifEnc } from '@jsquash/avif/encode';
import resizeImageData from '@jsquash/resize';
import UTIF from 'utif2';
import type { ImageWorkerRequest, WorkerMessage } from '../types';
import { HEIC_INPUT_EXTS } from '../formats';

declare const self: DedicatedWorkerGlobalScope;

let heifModuleReady: Promise<typeof import('libheif-js/wasm-bundle')> | null = null;

async function decodeHeic(data: ArrayBuffer): Promise<ImageData> {
  heifModuleReady ??= import('libheif-js/wasm-bundle');
  const mod = await heifModuleReady;
  const decoder = new mod.default.HeifDecoder();
  const images = decoder.decode(new Uint8Array(data));
  const image = images[0];
  if (!image) throw new Error('This HEIC file has no readable image.');
  const width = image.get_width();
  const height = image.get_height();
  const buffer = new Uint8ClampedArray(width * height * 4);
  await new Promise<void>((resolve, reject) => {
    image.display({ data: buffer, width, height }, (result: unknown) => {
      if (!result) reject(new Error('This HEIC file could not be decoded.'));
      else resolve();
    });
  });
  return new ImageData(buffer, width, height);
}

function decodeTiff(data: ArrayBuffer): ImageData {
  const ifds = UTIF.decode(data);
  const first = ifds[0];
  if (!first) throw new Error('This TIFF file has no readable image.');
  UTIF.decodeImage(data, first);
  const rgba = UTIF.toRGBA8(first);
  const clamped = new Uint8ClampedArray(rgba.length);
  clamped.set(rgba);
  return new ImageData(clamped, first.width, first.height);
}

function encodeTiff(image: ImageData): ArrayBuffer {
  return UTIF.encodeImage(new Uint8Array(image.data.buffer), image.width, image.height);
}

async function decodeSource(data: ArrayBuffer, sourceExt: string): Promise<ImageData> {
  const ext = sourceExt.toLowerCase();
  if ((HEIC_INPUT_EXTS as readonly string[]).includes(ext)) return decodeHeic(data);
  if (ext === 'tiff' || ext === 'tif') return decodeTiff(data);
  if (ext === 'png') {
    await initPngDec();
    return decodePng(data);
  }
  if (ext === 'webp') {
    await initWebpDec();
    return decodeWebp(data);
  }
  if (ext === 'avif') {
    await initAvifDec();
    const decoded = await decodeAvif(data);
    if (!decoded) throw new Error('This AVIF file could not be decoded.');
    return decoded;
  }
  // jpg, jpeg, and anything else decodable by the browser's own ImageDecoder
  // fall through to mozjpeg, which also handles baseline/progressive jpeg.
  await initJpegDec();
  return decodeJpeg(data);
}

async function encodeTarget(image: ImageData, to: string, quality: number, lossless: boolean): Promise<{ buffer: ArrayBuffer; mime: string }> {
  switch (to) {
    case 'jpg':
    case 'jpeg':
      await initJpegEnc();
      return { buffer: await encodeJpeg(image, { quality }), mime: 'image/jpeg' };
    case 'png':
      await initPngEnc();
      return { buffer: await encodePng(image), mime: 'image/png' };
    case 'webp':
      await initWebpEnc();
      return { buffer: await encodeWebp(image, { quality, lossless: lossless ? 1 : 0 }), mime: 'image/webp' };
    case 'avif':
      await initAvifEnc();
      return { buffer: await encodeAvif(image, { quality }), mime: 'image/avif' };
    case 'tiff':
      return { buffer: encodeTiff(image), mime: 'image/tiff' };
    default:
      throw new Error(`Unsupported image target: ${to}`);
  }
}

async function run(req: ImageWorkerRequest): Promise<void> {
  try {
    let image = await decodeSource(req.data, req.sourceExt);

    if (req.options.rotate === 90 || req.options.rotate === 270) {
      image = rotate90(image, req.options.rotate === 270);
    } else if (req.options.rotate === 180) {
      image = rotate180(image);
    }
    if (req.options.flip === 'h' || req.options.flip === 'hv') image = flipHorizontal(image);
    if (req.options.flip === 'v' || req.options.flip === 'hv') image = flipVertical(image);

    const target = req.options.resize;
    if (target) {
      image = await resizeImageData(image, { width: target.width, height: target.height, fitMethod: 'stretch', method: 'lanczos3' });
    }

    const { buffer, mime } = await encodeTarget(image, req.to, req.options.quality ?? 82, req.options.lossless ?? false);
    const message: WorkerMessage = { kind: 'done', data: buffer, mime };
    self.postMessage(message, [buffer]);
  } catch (err) {
    const message: WorkerMessage = {
      kind: 'error',
      message: err instanceof Error ? err.message : 'Image conversion failed.',
      stderr: '',
    };
    self.postMessage(message);
  }
}

function rotate90(src: ImageData, counterClockwise: boolean): ImageData {
  const { width: w, height: h, data } = src;
  const out = new ImageData(h, w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const [dx, dy] = counterClockwise ? [y, w - 1 - x] : [h - 1 - y, x];
      const di = (dy * h + dx) * 4;
      out.data[di] = data[si] ?? 0;
      out.data[di + 1] = data[si + 1] ?? 0;
      out.data[di + 2] = data[si + 2] ?? 0;
      out.data[di + 3] = data[si + 3] ?? 0;
    }
  }
  return out;
}

function rotate180(src: ImageData): ImageData {
  const { width: w, height: h, data } = src;
  const out = new ImageData(w, h);
  const total = w * h;
  for (let i = 0; i < total; i++) {
    const si = i * 4;
    const di = (total - 1 - i) * 4;
    out.data[di] = data[si] ?? 0;
    out.data[di + 1] = data[si + 1] ?? 0;
    out.data[di + 2] = data[si + 2] ?? 0;
    out.data[di + 3] = data[si + 3] ?? 0;
  }
  return out;
}

function flipHorizontal(src: ImageData): ImageData {
  const { width: w, height: h, data } = src;
  const out = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = (y * w + (w - 1 - x)) * 4;
      out.data[di] = data[si] ?? 0;
      out.data[di + 1] = data[si + 1] ?? 0;
      out.data[di + 2] = data[si + 2] ?? 0;
      out.data[di + 3] = data[si + 3] ?? 0;
    }
  }
  return out;
}

function flipVertical(src: ImageData): ImageData {
  const { width: w, height: h, data } = src;
  const out = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    const srcRow = data.subarray(y * w * 4, (y + 1) * w * 4);
    out.data.set(srcRow, (h - 1 - y) * w * 4);
  }
  return out;
}

self.onmessage = (event: MessageEvent<ImageWorkerRequest>) => {
  void run(event.data);
};
