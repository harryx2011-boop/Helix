import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import type { MultipartFile } from '@fastify/multipart';
import { ALL_FORMATS, type Format } from '../ffmpeg/formats.js';

export const MAX_FILE_BYTES = Number(process.env.CONVERT_MAX_BYTES ?? 5 * 1024 * 1024 * 1024);

export class UploadError extends Error {}

/**
 * The client's filename is display metadata and nothing else: the file lands
 * under a server-generated name, so nothing a caller sends reaches a path.
 */
export function claimedFormat(filename: string): Format | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return (ALL_FORMATS as readonly string[]).includes(ext) ? (ext as Format) : null;
}

export function safeDisplayName(filename: string): string {
  return filename.replace(/[\r\n\t]/g, '').slice(0, 255) || 'file';
}

export async function saveUpload(
  file: MultipartFile,
  dir: string,
): Promise<{ path: string; size: number; filename: string; format: Format | null }> {
  const filename = safeDisplayName(file.filename ?? 'file');
  const format = claimedFormat(filename);
  const path = join(dir, `in${format ? `.${format}` : ''}`);

  await pipeline(file.file, createWriteStream(path));
  if (file.file.truncated) {
    throw new UploadError(`File exceeds the ${Math.round(MAX_FILE_BYTES / 1024 ** 3)} GB limit.`);
  }

  return { path, size: file.file.bytesRead, filename, format };
}

export function parseOptions(raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === '') return {};
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new UploadError('options must be valid JSON.');
  }
}
