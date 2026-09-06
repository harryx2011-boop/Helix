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
import type { ImageOptions } from '../options';
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
      image = await applyResize(image, target, req.options.fit ?? 'fill');
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

/**
 * Resize honouring `fit`.
 *
 * jSquash offers only `stretch` and `contain`, so the other three modes are
 * computed here rather than declared and ignored. `cover` is the one that
 * needs real work: scale so the shorter side fills the box, then crop the
 * overflow from the centre — a plain `contain` would letterbox instead, which
 * is a different picture, not a differently-sized one.
 */
async function applyResize(
  image: ImageData,
  target: { width: number; height: number },
  fit: NonNullable<ImageOptions['fit']>,
): Promise<ImageData> {
  const scaleX = target.width / image.width;
  const scaleY = target.height / image.height;

  if (fit === 'fill') {
    return resizeImageData(image, { ...target, fitMethod: 'stretch', method: 'lanczos3' });
  }

  if (fit === 'contain') {
    return resizeImageData(image, { ...target, fitMethod: 'contain', method: 'lanczos3' });
  }

  if (fit === 'inside' || fit === 'outside') {
    // Both keep the aspect ratio and neither crops; they differ only in which
    // side the box constrains, so the target is a bound rather than a size.
    const scale = fit === 'inside' ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
    return resizeImageData(image, {
      width: Math.max(1, Math.round(image.width * scale)),
      height: Math.max(1, Math.round(image.height * scale)),
      fitMethod: 'stretch',
      method: 'lanczos3',
    });
  }

  // cover: fill the box, then take the middle.
  const scale = Math.max(scaleX, scaleY);
  const scaled = await resizeImageData(image, {
    width: Math.max(target.width, Math.round(image.width * scale)),
    height: Math.max(target.height, Math.round(image.height * scale)),
    fitMethod: 'stretch',
    method: 'lanczos3',
  });
  return cropCentre(scaled, target.width, target.height);
}

/** Centre crop. Rows are copied whole, so this is one memcpy per row rather than per pixel. */
function cropCentre(src: ImageData, width: number, height: number): ImageData {
  const w = Math.min(width, src.width);
  const h = Math.min(height, src.height);
  const left = Math.floor((src.width - w) / 2);
  const top = Math.floor((src.height - h) / 2);

  const out = new ImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    const from = ((top + y) * src.width + left) * 4;
    out.data.set(src.data.subarray(from, from + w * 4), y * w * 4);
  }
  return out;
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
