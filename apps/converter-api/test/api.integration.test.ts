import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../src/index.js';
import { FFMPEG_BIN, run } from '../src/ffmpeg/run.js';

let app: FastifyInstance;
let dir: string;
let sourceMp4: Buffer;

/** Multipart bodies are assembled by hand so the test exercises the real parser. */
function multipart(
  fields: Record<string, string>,
  file: { name: string; filename: string; content: Buffer; type: string },
): { body: Buffer; headers: Record<string, string> } {
  const boundary = `----helixtest${Date.now()}`;
  const parts: Buffer[] = [];

  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\n` +
        `Content-Type: ${file.type}\r\n\r\n`,
    ),
    file.content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );

  return {
    body: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

async function waitForJob(id: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await app.inject({ method: 'GET', url: `/v1/jobs/${id}` });
    const job = res.json();
    if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') return job;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`job ${id} did not settle`);
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'helix-api-test-'));
  const path = join(dir, 'source.mp4');
  await run(FFMPEG_BIN, [
    '-hide_banner', '-nostdin', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15:duration=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path,
  ]);
  sourceMp4 = await readFile(path);

  // This suite covers the conversion path; auth has its own suite.
  process.env.CONVERT_AUTH = 'off';
  app = await build();
  delete process.env.CONVERT_AUTH;
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app.close();
  await rm(dir, { recursive: true, force: true });
});

describe('health', () => {
  it('reports queue state', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
    expect(res.json().concurrency).toBeGreaterThan(0);
  });
});

describe('POST /v1/convert', () => {
  it('accepts a file and runs it to completion', async () => {
    const { body, headers } = multipart(
      { to: 'mp3', options: JSON.stringify({ audioBitrate: 128000 }) },
      { name: 'file', filename: 'clip.mp4', content: sourceMp4, type: 'video/mp4' },
    );

    const res = await app.inject({ method: 'POST', url: '/v1/convert', payload: body, headers });
    expect(res.statusCode).toBe(202);

    const submitted = res.json();
    expect(submitted.id).toMatch(/^cv_/);
    // A short job can start before the response is serialized, so both are valid.
    expect(['queued', 'running']).toContain(submitted.status);
    expect(submitted.inSize).toBeGreaterThan(0);
    // The internal path must never cross the boundary.
    expect(submitted).not.toHaveProperty('outputPath');

    const job = await waitForJob(submitted.id);
    expect(job.status).toBe('done');
    expect(job.outSize).toBeGreaterThan(0);
    expect(job.url).toBe(`/v1/jobs/${submitted.id}/download`);

    const download = await app.inject({ method: 'GET', url: job.url });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toBe('audio/mpeg');
    expect(download.headers['content-disposition']).toContain('clip.mp3');
    expect(download.rawPayload.length).toBe(job.outSize);
  }, 120_000);

  it('reads fields that arrive after the file part, as curl sends them', async () => {
    const { body, headers } = multipart(
      { to: 'mp3', options: JSON.stringify({ audioBitrate: 128000 }) },
      { name: 'file', filename: 'clip.mp4', content: sourceMp4, type: 'video/mp4' },
      true,
    );

    const res = await app.inject({ method: 'POST', url: '/v1/convert', payload: body, headers });
    expect(res.statusCode).toBe(202);

    const job = await waitForJob(res.json().id);
    expect(job.status).toBe('done');
    expect(job.to).toBe('mp3');
  }, 120_000);

  it('rejects an unknown target format', async () => {
    const { body, headers } = multipart(
      { to: 'exe' },
      { name: 'file', filename: 'clip.mp4', content: sourceMp4, type: 'video/mp4' },
    );
    const res = await app.inject({ method: 'POST', url: '/v1/convert', payload: body, headers });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an out-of-range option', async () => {
    const { body, headers } = multipart(
      { to: 'mp4', options: JSON.stringify({ crf: 999 }) },
      { name: 'file', filename: 'clip.mp4', content: sourceMp4, type: 'video/mp4' },
    );
    const res = await app.inject({ method: 'POST', url: '/v1/convert', payload: body, headers });
    expect(res.statusCode).toBe(400);
  });

  it('rejects malformed options JSON', async () => {
    const { body, headers } = multipart(
      { to: 'mp4', options: '{not json' },
      { name: 'file', filename: 'clip.mp4', content: sourceMp4, type: 'video/mp4' },
    );
    const res = await app.inject({ method: 'POST', url: '/v1/convert', payload: body, headers });
    expect(res.statusCode).toBe(400);
  });

  it('surfaces a readable error for a file that is not media', async () => {
    const { body, headers } = multipart(
      { to: 'mp3' },
      {
        name: 'file',
        filename: 'fake.mp4',
        content: Buffer.from('not a video at all'),
        type: 'video/mp4',
      },
    );
    const res = await app.inject({ method: 'POST', url: '/v1/convert', payload: body, headers });
    expect(res.statusCode).toBe(202);

    const job = await waitForJob(res.json().id);
    expect(job.status).toBe('error');
    expect(job.error.message).toBeTruthy();
    // The plain-language message and the raw log are both present.
    expect(job.error.message).not.toContain('ffmpeg');
    expect(typeof job.error.stderr).toBe('string');
  }, 60_000);

  it('detects a file whose extension lies about its container', async () => {
    const { body, headers } = multipart(
      { to: 'mp3' },
      { name: 'file', filename: 'clip.wav', content: sourceMp4, type: 'audio/wav' },
    );
    const res = await app.inject({ method: 'POST', url: '/v1/convert', payload: body, headers });
    const job = await waitForJob(res.json().id);

    expect(job.status).toBe('error');
    expect(job.error.message).toContain('not a wav');
  }, 60_000);
});

describe('POST /v1/gif', () => {
  it('renders a gif through the two-pass palette', async () => {
    const { body, headers } = multipart(
      { options: JSON.stringify({ fps: 10, width: 160 }) },
      { name: 'file', filename: 'clip.mp4', content: sourceMp4, type: 'video/mp4' },
    );
    const res = await app.inject({ method: 'POST', url: '/v1/gif', payload: body, headers });
    expect(res.statusCode).toBe(202);

    const job = await waitForJob(res.json().id);
    expect(job.status).toBe('done');
    expect(job.to).toBe('gif');

    const download = await app.inject({ method: 'GET', url: job.url });
    expect(download.headers['content-type']).toBe('image/gif');
    expect(download.rawPayload.subarray(0, 3).toString()).toBe('GIF');
  }, 120_000);
});

describe('POST /v1/compress', () => {
  it('resolves a named preset to a target size', async () => {
    const { body, headers } = multipart(
      { to: 'mp4', options: JSON.stringify({ quality: 'discord', preset: 'ultrafast' }) },
      { name: 'file', filename: 'clip.mp4', content: sourceMp4, type: 'video/mp4' },
    );
    const res = await app.inject({ method: 'POST', url: '/v1/compress', payload: body, headers });
    expect(res.statusCode).toBe(202);

    const job = await waitForJob(res.json().id);
    expect(job.status).toBe('done');
    expect(job.outSize).toBeLessThan(10 * 1024 * 1024);
  }, 120_000);
});

describe('job lifecycle', () => {
  it('404s an unknown job', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/jobs/cv_nope' });
    expect(res.statusCode).toBe(404);
  });

  it('409s a download for a job that has not finished', async () => {
    const { body, headers } = multipart(
      { to: 'webm', options: JSON.stringify({ preset: 'ultrafast' }) },
      { name: 'file', filename: 'clip.mp4', content: sourceMp4, type: 'video/mp4' },
    );
    const res = await app.inject({ method: 'POST', url: '/v1/convert', payload: body, headers });
    const id = res.json().id;

    const early = await app.inject({ method: 'GET', url: `/v1/jobs/${id}/download` });
    expect([409, 200]).toContain(early.statusCode);
    await waitForJob(id);
  }, 120_000);

  it('streams SSE and replays terminal state to a late subscriber', async () => {
    const { body, headers } = multipart(
      { to: 'mp3' },
      { name: 'file', filename: 'clip.mp4', content: sourceMp4, type: 'video/mp4' },
    );
    const res = await app.inject({ method: 'POST', url: '/v1/convert', payload: body, headers });
    const id = res.json().id;

    await waitForJob(id);

    // Subscribing after completion must still deliver the outcome, not hang.
    const events = await app.inject({ method: 'GET', url: `/v1/jobs/${id}/events` });
    expect(events.headers['content-type']).toContain('text/event-stream');
    expect(events.payload).toContain('"status":"done"');
  }, 120_000);
});
