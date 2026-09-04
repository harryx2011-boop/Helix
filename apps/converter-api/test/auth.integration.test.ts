import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../src/index.js';
import { hashKey, isKeyShape, type VerifiedKey } from '../src/auth.js';

const ALICE = 'helix-aaaaaaaaaaaaaaaa';
const BOB = 'helix-bbbbbbbbbbbbbbbb';

const KEYS: Record<string, VerifiedKey> = {
  [ALICE]: { id: 'key_alice', name: 'Alice', rateLimit: 1000 },
  [BOB]: { id: 'key_bob', name: 'Bob', rateLimit: 1000 },
};

/** Stands in for the Postgres lookup; the shape check is the real one. */
async function verify(token: string): Promise<VerifiedKey | undefined> {
  if (!isKeyShape(token)) return undefined;
  return KEYS[token];
}

let app: FastifyInstance;
let dir: string;
let clip: Buffer;

function multipart(fields: Record<string, string>, filename: string, content: Buffer) {
  const boundary = `----auth${Date.now()}`;
  const parts: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`,
    ),
    content,
    Buffer.from('\r\n'),
  ];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

async function submitAs(token: string, to = 'mp3') {
  const { body, headers } = multipart({ to }, 'clip.mp4', clip);
  return app.inject({
    method: 'POST',
    url: '/v1/convert',
    payload: body,
    headers: { ...headers, authorization: `Bearer ${token}` },
  });
}

async function settle(id: string, token: string) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/jobs/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const job = res.json();
    if (['done', 'error', 'cancelled'].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('job did not settle');
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'converter-auth-'));
  const path = join(dir, 'clip.mp4');
  execFileSync('ffmpeg', [
    '-hide_banner', '-nostdin', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=10:duration=1',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path,
  ]);
  clip = readFileSync(path);

  app = await build({ verify });
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the gate', () => {
  it('leaves /health open so a probe needs no key', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().auth).toBe(true);
  });

  it('rejects a request with no key', async () => {
    const { body, headers } = multipart({ to: 'mp3' }, 'clip.mp4', clip);
    const res = await app.inject({ method: 'POST', url: '/v1/convert', payload: body, headers });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('unauthorized');
  });

  it('rejects a malformed key without touching the store', async () => {
    for (const bad of ['nonsense', 'Bearer', 'helix-short', 'sk-live-not-ours', '']) {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/jobs/cv_x',
        headers: { authorization: `Bearer ${bad}` },
      });
      expect(res.statusCode).toBe(401);
    }
  });

  it('treats an unknown key the same as a revoked one', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/jobs/cv_x',
      headers: { authorization: 'Bearer helix-zzzzzzzzzzzzzzzz' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Invalid API key.');
  });

  it('accepts a valid key', async () => {
    const res = await submitAs(ALICE);
    expect(res.statusCode).toBe(202);
  }, 60_000);

  it('accepts the key in a query string, since EventSource cannot set headers', async () => {
    const submitted = await submitAs(ALICE);
    const id = submitted.json().id;
    await settle(id, ALICE);

    const res = await app.inject({ method: 'GET', url: `/v1/jobs/${id}?key=${ALICE}` });
    expect(res.statusCode).toBe(200);
  }, 60_000);
});

describe('one key cannot reach another key\'s job', () => {
  it('hides the job from a different key', async () => {
    const submitted = await submitAs(ALICE);
    const id = submitted.json().id;
    await settle(id, ALICE);

    // Not 403: existence itself is not disclosed.
    for (const url of [`/v1/jobs/${id}`, `/v1/jobs/${id}/download`, `/v1/jobs/${id}/events`]) {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: `Bearer ${BOB}` },
      });
      expect(res.statusCode, `${url} leaked to another key`).toBe(404);
    }
  }, 90_000);

  it('refuses a cancel from a different key', async () => {
    const submitted = await submitAs(ALICE, 'webm');
    const id = submitted.json().id;

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/jobs/${id}`,
      headers: { authorization: `Bearer ${BOB}` },
    });
    expect(res.statusCode).toBe(404);

    // Alice's job is untouched by the attempt.
    const mine = await app.inject({
      method: 'GET',
      url: `/v1/jobs/${id}`,
      headers: { authorization: `Bearer ${ALICE}` },
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().status).not.toBe('cancelled');
  }, 90_000);

  it('lets the owner download their own output', async () => {
    const submitted = await submitAs(ALICE);
    const id = submitted.json().id;
    await settle(id, ALICE);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/jobs/${id}/download`,
      headers: { authorization: `Bearer ${ALICE}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.length).toBeGreaterThan(0);
  }, 90_000);
});

describe('key hashing', () => {
  it('never stores the key itself', () => {
    const hash = hashKey(ALICE);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain('helix');
    expect(hashKey(ALICE)).toBe(hash);
    expect(hashKey(BOB)).not.toBe(hash);
  });

  it('accepts only the Helix key shape', () => {
    expect(isKeyShape('helix-aaaaaaaaaaaaaaaa')).toBe(true);
    expect(isKeyShape('helix-tooshort')).toBe(false);
    expect(isKeyShape('helix-aaaaaaaaaaaaaaaaa')).toBe(false);
    expect(isKeyShape('other-aaaaaaaaaaaaaaaa')).toBe(false);
    expect(isKeyShape('helix-aaaaaaaaaaaaaa!!')).toBe(false);
  });
});
