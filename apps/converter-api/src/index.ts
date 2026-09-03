import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { JobManager } from './jobs/manager.js';
import { registerJobRoutes } from './routes/jobs.js';
import { MAX_FILE_BYTES } from './routes/upload.js';
import { startSweeper } from './storage/temp.js';

const PORT = Number(process.env.PORT ?? 8400);
const HOST = process.env.HOST ?? '127.0.0.1';
const ORIGIN = process.env.CONVERT_ORIGIN ?? 'http://localhost:4400';

export async function build() {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { level: process.env.LOG_LEVEL ?? 'info' },
    bodyLimit: MAX_FILE_BYTES,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: ORIGIN, credentials: true });
  await app.register(multipart, {
    limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 8 },
  });

  const manager = new JobManager();
  registerJobRoutes(app, manager);

  app.get('/health', async () => ({
    status: 'ok',
    concurrency: manager.queue.concurrency,
    queued: manager.queue.depth,
  }));

  startSweeper(app.log);
  return app;
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  const app = await build();
  await app.listen({ port: PORT, host: HOST });
}
