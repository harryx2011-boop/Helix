import sharp from 'sharp';
import type { Format } from './formats.js';
import type { ImageOptions } from './options.js';

/**
 * Stills go through libvips rather than ffmpeg: it handles HEIC and AVIF, and
 * produces better output faster for everything else.
 */
export async function convertImage(
  input: string,
  output: string,
  to: Format,
  o: ImageOptions,
): Promise<void> {
  // A second .rotate() is ignored by sharp, so the EXIF auto-orient call and
  // the user's rotation have to be the same one: pass the angle when there is
  // one, and use the bare call for auto-orient only when there is not.
  let pipeline = sharp(input, { failOn: 'none' });
  pipeline = o.rotate ? pipeline.rotate(o.rotate) : pipeline.rotate();

  if (o.width || o.height) {
    pipeline = pipeline.resize({
      width: o.width,
      height: o.height,
      fit: o.fit ?? 'inside',
      withoutEnlargement: true,
    });
  }
  if (o.flip === 'v' || o.flip === 'hv') pipeline = pipeline.flip();
  if (o.flip === 'h' || o.flip === 'hv') pipeline = pipeline.flop();

  const quality = o.quality ?? 82;
  switch (to) {
    case 'jpg':
    case 'jpeg':
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
      break;
    case 'png':
      pipeline = pipeline.png({ compressionLevel: 9, palette: quality < 90 });
      break;
    case 'webp':
      pipeline = pipeline.webp({ quality, lossless: o.lossless ?? false });
      break;
    case 'avif':
      pipeline = pipeline.avif({ quality, lossless: o.lossless ?? false });
      break;
    case 'tiff':
      pipeline = pipeline.tiff({ quality });
      break;
    case 'gif':
      pipeline = pipeline.gif();
      break;
    case 'heic':
      // libvips requires the codec to be named; without it sharp throws
      // "Expected one of: av1, hevc for compression".
      pipeline = pipeline.heif({ quality, compression: 'av1' });
      break;
    default:
      throw new Error(`Unsupported image target: ${to}`);
  }

  await pipeline.toFile(output);
}

export async function probeImage(
  input: string,
): Promise<{ width: number | null; height: number | null; format: string | null }> {
  const meta = await sharp(input, { failOn: 'none' }).metadata();
  return { width: meta.width ?? null, height: meta.height ?? null, format: meta.format ?? null };
}
