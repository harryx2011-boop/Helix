import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  compressBody,
  convertBody,
  gifBody,
  imageBody,
  PRESET_TARGETS,
} from '../ffmpeg/options.js';
import { JobManager } from '../jobs/manager.js';
import type { Format } from '../ffmpeg/formats.js';
import { createJobDir, removeJobDir } from '../storage/temp.js';
import { publicJob, type JobEvent, type JobOp } from '../jobs/types.js';
import { MAX_FILE_BYTES, parseOptions, saveUpload, UploadError } from './upload.js';

type JobParams = { Params: { id: string } };

/** @fastify/multipart's parts() iterator, narrowed to what this route uses. */
type Part =
  | { type: 'file'; fieldname: string; filename?: string; file: NodeJS.ReadableStream & { truncated: boolean; bytesRead: number } }
  | { type: 'field'; fieldname: string; value: unknown };

type PartsRequest = FastifyRequest & {
  parts: (opts?: { limits?: { fileSize?: number } }) => AsyncIterableIterator<Part>;
};

const CONTENT_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  gif: 'image/gif',
  apng: 'image/apng',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  tiff: 'image/tiff',
  heic: 'image/heic',
};

export function registerJobRoutes(app: FastifyInstance, manager: JobManager): void {
  const submit =
    (op: JobOp, schema: z.ZodTypeAny) => async (request: FastifyRequest, reply: FastifyReply) => {
    // Fields that arrive AFTER the file part are absent from `file.fields`, and
    // curl sends -F file=@... first. Walking every part is the only ordering
    // that works for real clients, so the file is streamed to disk mid-walk and
    // the remaining fields are collected around it.
    const id = JobManager.allocateId();
    const dir = await createJobDir(id);

    const fields: Record<string, { value?: unknown } | undefined> = {};
    let upload: Awaited<ReturnType<typeof saveUpload>> | null = null;

    try {
      for await (const part of (request as PartsRequest).parts({ limits: { fileSize: MAX_FILE_BYTES } })) {
        if (part.type === 'file') {
          if (upload) {
            await part.file.resume();
            continue;
          }
          upload = await saveUpload(part, dir);
        } else {
          fields[part.fieldname] = { value: part.value };
        }
      }
    } catch (err) {
      await removeJobDir(id);
      if (err instanceof UploadError) return reply.code(413).send({ error: err.message });
      throw err;
    }

    if (!upload) {
      await removeJobDir(id);
      return reply.code(400).send({ error: 'No file was uploaded.' });
    }

    let body: { to?: Format; options: Record<string, unknown> };
    try {
      body = schema.parse({
        to: fields.to?.value,
        target: fields.target?.value,
        options: parseOptions(fields.options?.value),
      });
    } catch (err) {
      await removeJobDir(id);
      if (err instanceof UploadError) return reply.code(400).send({ error: err.message });
      if (err instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Invalid options.', details: err.flatten() });
      }
      throw err;
    }

    if (op === 'compress' && body.options.quality && !body.options.target) {
      const preset = PRESET_TARGETS[body.options.quality as keyof typeof PRESET_TARGETS];
      if (preset) body.options.target = preset;
    }

    const to = body.to ?? (op === 'gif' ? 'gif' : upload.format);
    if (!to) {
      await removeJobDir(id);
      return reply.code(400).send({ error: 'Could not determine the output format.' });
    }

    const job = manager.submit(id, {
      ownerId: request.apiKey?.id ?? null,
      op,
      to,
      filename: upload.filename,
      inputPath: upload.path,
      inSize: upload.size,
      claimedFormat: upload.format,
      options: body.options,
    });

    return reply.code(202).send(publicJob(job));
  };

  app.post('/v1/convert', submit('convert', convertBody));
  app.post('/v1/compress', submit('compress', compressBody));
  app.post('/v1/gif', submit('gif', gifBody));
  app.post('/v1/image', submit('image', imageBody));

  app.get<JobParams>('/v1/jobs/:id', async (request, reply) => {
    const job = manager.getOwned(request.params.id, request.apiKey?.id ?? null);
    if (!job) return reply.code(404).send({ error: 'No such job.' });
    return publicJob(job);
  });

  app.delete<JobParams>('/v1/jobs/:id', async (request, reply) => {
    if (!manager.getOwned(request.params.id, request.apiKey?.id ?? null)) {
      return reply.code(404).send({ error: 'No such job.' });
    }
    const cancelled = manager.cancel(request.params.id);
    if (!cancelled) return reply.code(404).send({ error: 'No such job, or it already finished.' });
    return { status: 'cancelled' };
  });

  app.get<JobParams>('/v1/jobs/:id/events', (request, reply) => {
    const job = manager.getOwned(request.params.id, request.apiKey?.id ?? null);
    if (!job) return reply.code(404).send({ error: 'No such job.' });

    // Writing to reply.raw bypasses the CORS plugin's onSend hook, so the
    // headers it would have added have to be carried over by hand.
    const cors: Record<string, string> = {};
    for (const [key, value] of Object.entries(reply.getHeaders())) {
      if (key.toLowerCase().startsWith('access-control-') && value !== undefined) {
        cors[key] = String(value);
      }
    }
    const origin = request.headers.origin;
    if (origin && !cors['access-control-allow-origin']) {
      cors['access-control-allow-origin'] = origin;
      cors['access-control-allow-credentials'] = 'true';
      cors['vary'] = 'Origin';
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...cors,
    });

    const send = (event: JobEvent) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);

    // A job can finish between the POST and the client opening this stream, so
    // replay terminal state rather than waiting for an event that already fired.
    if (job.status === 'done' && job.outSize !== null) {
      send({ status: 'done', url: `/v1/jobs/${job.id}/download`, size: job.outSize });
      reply.raw.end();
      return reply;
    }
    if (job.status === 'error' && job.error) {
      send({ status: 'error', ...job.error });
      reply.raw.end();
      return reply;
    }

    const channel = `job:${job.id}`;
    const listener = (event: JobEvent) => {
      send(event);
      if (event.status !== 'running') {
        manager.off(channel, listener);
        reply.raw.end();
      }
    };
    manager.on(channel, listener);

    const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), 15_000);
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      manager.off(channel, listener);
    });

    return reply;
  });

  app.get<JobParams>('/v1/jobs/:id/download', async (request, reply) => {
    const job = manager.getOwned(request.params.id, request.apiKey?.id ?? null);
    if (!job) return reply.code(404).send({ error: 'No such job.' });
    if (job.status !== 'done' || !job.outputPath) {
      return reply.code(409).send({ error: 'This job has not finished.' });
    }

    try {
      await stat(job.outputPath);
    } catch {
      return reply.code(410).send({ error: 'This file has expired.' });
    }

    const base = job.filename.replace(/\.[^.]+$/, '');
    return reply
      .header('Content-Type', CONTENT_TYPES[job.to] ?? 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${encodeURIComponent(base)}.${job.to}"`)
      .send(createReadStream(job.outputPath));
  });
}
