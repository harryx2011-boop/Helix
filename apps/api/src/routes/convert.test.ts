import { describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerConvert, type ConvertRouteDeps } from './convert.js';
import { ExtractHttpError, type ConvertResult, type ExtractClient } from '../extract/client.js';
import type { Lookup } from '../parse/remote.js';

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
const PNG = Buffer.concat([Buffer.from([0x89]), Buffer.from('PNG\r\n\x1a\n', 'latin1'), Buffer.alloc(16)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(16)]);
const HTML = Buffer.from('<!DOCTYPE html><html><body>Not a document</body></html>');
const DOCX_BYTES = Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.alloc(32)]);
const RASTERIZED = Buffer.from('fake-png-bytes');

const CONVERTED: ConvertResult = {
  data: RASTERIZED,
  contentType: 'image/png',
  pages: 3,
  pageConverted: 1,
};

function extractClient(overrides: Partial<{ convert: unknown }> = {}): ExtractClient {
  return {
    convert: vi.fn(async () => CONVERTED),
    health: vi.fn(async () => true),
    ...overrides,
  } as unknown as ExtractClient;
}

function remote(bytes: Buffer, init: { status?: number; headers?: Record<string, string> } = {}): typeof fetch {
  return vi.fn(
    async () => new Response(new Uint8Array(bytes), { status: init.status ?? 200, headers: init.headers ?? {} }),
  ) as unknown as typeof fetch;
}

const publicLookup: Lookup = async () => [{ address: '93.184.216.34', family: 4 }];
const privateLookup: Lookup = async () => [{ address: '127.0.0.1', family: 4 }];

async function build(deps: Partial<ConvertRouteDeps> = {}): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(
    async (instance) => {
      await registerConvert(instance, {
        extractClient: deps.extractClient ?? extractClient(),
        maxUploadBytes: deps.maxUploadBytes ?? 1024 * 1024,
        maxInFlight: deps.maxInFlight,
        userAgent: 'HelixTest/0',
        fetchImpl: deps.fetchImpl ?? remote(PDF, { headers: { 'content-type': 'application/pdf' } }),
        lookup: deps.lookup ?? publicLookup,
      });
    },
    { prefix: '/v1' },
  );
  await app.ready();
  return app;
}

async function multipart(
  fields: Record<string, string>,
  file?: { name: string; type: string; bytes: Buffer },
): Promise<{ headers: Record<string, string>; payload: Buffer }> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  if (file) form.set('file', new File([new Uint8Array(file.bytes)], file.name, { type: file.type }));
  const encoded = new Response(form);
  return {
    headers: { 'content-type': encoded.headers.get('content-type') ?? '' },
    payload: Buffer.from(await encoded.arrayBuffer()),
  };
}

const post = (app: FastifyInstance, url: string, body: unknown) =>
  app.inject({ method: 'POST', url, payload: body as Record<string, unknown> });

describe('POST /v1/convert', () => {
  it('rasterizes a PDF page and returns it with the pagination headers', async () => {
    const app = await build();
    const { headers, payload } = await multipart({ to: 'png' }, { name: 'report.pdf', type: 'application/pdf', bytes: PDF });

    const response = await app.inject({ method: 'POST', url: '/v1/convert', headers, payload });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.rawPayload.equals(RASTERIZED)).toBe(true);
    expect(response.headers['content-disposition']).toBe('attachment; filename="report.png"');
    expect(response.headers['x-helix-convert-pages']).toBe('3');
    expect(response.headers['x-helix-convert-page']).toBe('1');
    await app.close();
  });

  it('fetches a url and converts it', async () => {
    const app = await build();
    const response = await post(app, '/v1/convert', { url: 'https://example.com/files/report.pdf', to: 'png' });

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.equals(RASTERIZED)).toBe(true);
    await app.close();
  });

  it('passes page and dpi through to the extract client for a pdf source', async () => {
    const convert = vi.fn(async () => CONVERTED);
    const app = await build({ extractClient: extractClient({ convert }) });
    await post(app, '/v1/convert', { url: 'https://example.com/report.pdf', to: 'jpeg', page: 2, dpi: 288 });

    expect(convert).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'jpeg', page: 2, dpi: 288, contentType: 'application/pdf' }),
    );
    await app.close();
  });

  it('does not send page or dpi for an image source', async () => {
    const convert = vi.fn(async () => ({ ...CONVERTED, contentType: 'image/jpeg', pages: 1, pageConverted: undefined }));
    const app = await build({
      extractClient: extractClient({ convert }),
      fetchImpl: remote(PNG, { headers: { 'content-type': 'image/png' } }),
    });
    await post(app, '/v1/convert', { url: 'https://example.com/photo.png', to: 'jpeg' });

    expect(convert).toHaveBeenCalledWith(expect.objectContaining({ page: undefined, dpi: undefined }));
    await app.close();
  });

  it('converts png to jpeg', async () => {
    const app = await build({
      extractClient: extractClient({ convert: vi.fn(async () => ({ ...CONVERTED, contentType: 'image/jpeg', pageConverted: undefined })) }),
    });
    const { headers, payload } = await multipart({ to: 'jpeg' }, { name: 'photo.png', type: 'image/png', bytes: PNG });

    const response = await app.inject({ method: 'POST', url: '/v1/convert', headers, payload });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.headers['content-disposition']).toBe('attachment; filename="photo.jpg"');
    expect(response.headers['x-helix-convert-page']).toBe('');
    await app.close();
  });

  it('converts jpeg to png', async () => {
    const app = await build({
      extractClient: extractClient({ convert: vi.fn(async () => ({ ...CONVERTED, contentType: 'image/png', pageConverted: undefined })) }),
    });
    const { headers, payload } = await multipart({ to: 'png' }, { name: 'photo.jpg', type: 'image/jpeg', bytes: JPEG });

    const response = await app.inject({ method: 'POST', url: '/v1/convert', headers, payload });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    await app.close();
  });

  it('rejects a source that cannot reach the requested target', async () => {
    const app = await build();
    const { headers, payload } = await multipart({ to: 'png' }, { name: 'photo.png', type: 'image/png', bytes: PNG });

    const response = await app.inject({ method: 'POST', url: '/v1/convert', headers, payload });

    expect(response.statusCode).toBe(415);
    expect(response.json().field).toBe('to');
    expect(response.json().message).toContain('cannot convert to png');
    await app.close();
  });

  it('rejects an unsupported source type as a typed failure', async () => {
    const app = await build();
    const { headers, payload } = await multipart(
      { to: 'png' },
      { name: 'memo.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: DOCX_BYTES },
    );

    const response = await app.inject({ method: 'POST', url: '/v1/convert', headers, payload });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(false);
    expect(body.failure.reason).toBe('unsupported_type');
    await app.close();
  });

  it('reports an HTML page as a typed failure rather than converting it', async () => {
    const app = await build();
    const { headers, payload } = await multipart({ to: 'png' }, { name: 'page.html', type: 'text/html', bytes: HTML });

    const response = await app.inject({ method: 'POST', url: '/v1/convert', headers, payload });
    expect(response.json().success).toBe(false);
    expect(response.json().failure.reason).toBe('unsupported_type');
    await app.close();
  });

  it('reports an empty file as a typed failure', async () => {
    const app = await build();
    const { headers, payload } = await multipart({ to: 'png' }, { name: 'empty.pdf', type: 'application/pdf', bytes: Buffer.alloc(0) });

    const response = await app.inject({ method: 'POST', url: '/v1/convert', headers, payload });
    expect(response.json().failure.reason).toBe('empty');
    await app.close();
  });

  it('rejects a request missing to', async () => {
    const app = await build();
    const response = await post(app, '/v1/convert', { url: 'https://example.com/a.pdf' });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('to');
    await app.close();
  });

  it('answers 200 with a typed failure for a corrupt pdf rather than a 500', async () => {
    const app = await build({
      extractClient: extractClient({
        convert: vi.fn(async () => {
          throw new ExtractHttpError(422, 'the file could not be parsed as pdf: garbage');
        }),
      }),
    });
    const { headers, payload } = await multipart({ to: 'png' }, { name: 'broken.pdf', type: 'application/pdf', bytes: PDF });

    const response = await app.inject({ method: 'POST', url: '/v1/convert', headers, payload });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(false);
    expect(body.failure.reason).toBe('unsupported_type');
    expect(body.failure.escalationAvailable).toBe(false);
    await app.close();
  });

  it('turns an unreachable helix-extract into an escalatable failure, not a 500', async () => {
    const app = await build({
      extractClient: extractClient({
        convert: vi.fn(async () => {
          throw new ExtractHttpError(503, 'connection refused');
        }),
      }),
    });
    const response = await post(app, '/v1/convert', { url: 'https://example.com/a.pdf', to: 'png' });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.failure.reason).toBe('service_unavailable');
    expect(body.failure.escalationAvailable).toBe(true);
    await app.close();
  });

  it('refuses a url that resolves to a private address', async () => {
    const app = await build({ lookup: privateLookup });
    const response = await post(app, '/v1/convert', { url: 'https://internal.example.com/a.pdf', to: 'png' });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('url');
    await app.close();
  });

  it('answers 413 when a fetched file exceeds the ceiling', async () => {
    const app = await build({
      maxUploadBytes: 16,
      fetchImpl: remote(Buffer.alloc(64, 0x25), { headers: { 'content-type': 'application/pdf' } }),
    });
    const response = await post(app, '/v1/convert', { url: 'https://example.com/big.pdf', to: 'png' });

    expect(response.statusCode).toBe(413);
    expect(response.json().error).toBe('payload_too_large');
    await app.close();
  });

  it('answers 503 with Retry-After once the in-flight ceiling is reached', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const app = await build({
      maxInFlight: 1,
      extractClient: extractClient({
        convert: vi.fn(async () => {
          await gate;
          return CONVERTED;
        }),
      }),
    });

    const first = post(app, '/v1/convert', { url: 'https://example.com/a.pdf', to: 'png' });
    await new Promise((resolve) => setImmediate(resolve));
    const second = await post(app, '/v1/convert', { url: 'https://example.com/b.pdf', to: 'png' });

    expect(second.statusCode).toBe(503);
    expect(second.headers['retry-after']).toBe('1');

    release();
    expect((await first).statusCode).toBe(200);
    await app.close();
  });
});
