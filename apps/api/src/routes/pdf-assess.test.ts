import { describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerPdfAssess, type PdfAssessRouteDeps } from './pdf-assess.js';
import { ExtractHttpError, type ExtractClient, type PdfAssessment } from '../extract/client.js';
import type { Lookup } from '../parse/remote.js';

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
const HTML = Buffer.from('<!DOCTYPE html><html><body>Not a document</body></html>');

const ASSESSMENT: PdfAssessment = {
  pages: 12,
  charsExtracted: 4200,
  needsOcr: false,
  suspectedGarbledText: false,
  reason: 'the text layer is usable',
};

function extractClient(overrides: Partial<{ assessPdf: unknown }> = {}): ExtractClient {
  return {
    assessPdf: vi.fn(async () => ASSESSMENT),
    ...overrides,
  } as unknown as ExtractClient;
}

function remote(bytes: Buffer, init: { status?: number; headers?: Record<string, string> } = {}): typeof fetch {
  return vi.fn(async () => new Response(new Uint8Array(bytes), { status: init.status ?? 200, headers: init.headers ?? {} })) as unknown as typeof fetch;
}

const publicLookup: Lookup = async () => [{ address: '93.184.216.34', family: 4 }];

async function build(deps: Partial<PdfAssessRouteDeps> = {}): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(
    async (instance) => {
      await registerPdfAssess(instance, {
        extractClient: deps.extractClient ?? extractClient(),
        maxUploadBytes: deps.maxUploadBytes ?? 1024 * 1024,
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

async function postJson(app: FastifyInstance, body: unknown) {
  return app.inject({ method: 'POST', url: '/v1/pdf-assess', payload: body as Record<string, unknown> });
}

describe('POST /v1/pdf-assess — url path', () => {
  it('fetches the PDF and returns its assessment', async () => {
    const client = extractClient();
    const app = await build({ extractClient: client });

    const response = await postJson(app, { url: 'https://example.com/report.pdf' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      pageCount: 12,
      charsExtracted: 4200,
      needsOcr: false,
      suspectedGarbledText: false,
      reason: 'the text layer is usable',
    });
    expect(body.data.metadata.sourceUrl).toBe('https://example.com/report.pdf');
  });

  it('rejects a missing url and missing file', async () => {
    const app = await build();

    const response = await postJson(app, {});

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('url');
  });

  it('rejects a non-url', async () => {
    const app = await build();

    const response = await postJson(app, { url: 'not-a-url' });

    expect(response.statusCode).toBe(400);
  });

  it('reports an HTML page as unsupported_type without calling assessPdf', async () => {
    const client = extractClient();
    const app = await build({
      extractClient: client,
      fetchImpl: remote(HTML, { headers: { 'content-type': 'text/html' } }),
    });

    const response = await postJson(app, { url: 'https://example.com/page' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.failure.reason).toBe('unsupported_type');
    expect(client.assessPdf).not.toHaveBeenCalled();
  });

  it('reports a 413 when the remote file exceeds the upload limit', async () => {
    const app = await build({
      maxUploadBytes: 4,
      fetchImpl: remote(PDF, { headers: { 'content-type': 'application/pdf', 'content-length': String(PDF.length) } }),
    });

    const response = await postJson(app, { url: 'https://example.com/big.pdf' });

    expect(response.statusCode).toBe(413);
  });

  it('reports service_unavailable when helix-extract fails', async () => {
    const client = extractClient({ assessPdf: vi.fn(async () => { throw new ExtractHttpError(503, 'assess unavailable'); }) });
    const app = await build({ extractClient: client });

    const response = await postJson(app, { url: 'https://example.com/report.pdf' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.failure.reason).toBe('service_unavailable');
  });
});

describe('POST /v1/pdf-assess — multipart path', () => {
  it('accepts an uploaded PDF and returns its assessment', async () => {
    const client = extractClient();
    const app = await build({ extractClient: client });
    const { headers, payload } = await multipart({}, { name: 'report.pdf', type: 'application/pdf', bytes: PDF });

    const response = await app.inject({ method: 'POST', url: '/v1/pdf-assess', headers, payload });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.metadata.filename).toBe('report.pdf');
    expect(client.assessPdf).toHaveBeenCalledWith({ data: PDF });
  });

  it('rejects an uploaded non-PDF file as unsupported_type', async () => {
    const client = extractClient();
    const app = await build({ extractClient: client });
    const { headers, payload } = await multipart({}, { name: 'page.html', type: 'text/html', bytes: HTML });

    const response = await app.inject({ method: 'POST', url: '/v1/pdf-assess', headers, payload });

    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.failure.reason).toBe('unsupported_type');
    expect(client.assessPdf).not.toHaveBeenCalled();
  });

  it('rejects multipart with no file part', async () => {
    const app = await build();
    const { headers, payload } = await multipart({});

    const response = await app.inject({ method: 'POST', url: '/v1/pdf-assess', headers, payload });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('file');
  });

  it('rejects an oversized multipart upload with 413', async () => {
    const app = await build({ maxUploadBytes: 8 });
    const { headers, payload } = await multipart({}, { name: 'report.pdf', type: 'application/pdf', bytes: Buffer.alloc(200 * 1024) });

    const response = await app.inject({ method: 'POST', url: '/v1/pdf-assess', headers, payload });

    expect(response.statusCode).toBe(413);
  });
});
