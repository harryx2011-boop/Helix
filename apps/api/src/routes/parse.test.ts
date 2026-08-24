import { describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerParse, type ParseRouteDeps } from './parse.js';
import { ExtractHttpError, type DocumentResult, type ExtractClient } from '../extract/client.js';
import { ParseCache } from '../parse/cache.js';

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
const PNG = Buffer.concat([Buffer.from([0x89]), Buffer.from('PNG\r\n\x1a\n', 'latin1'), Buffer.alloc(16)]);
const ZIP = Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.alloc(32)]);
const HTML = Buffer.from('<!DOCTYPE html><html><body>Not a document</body></html>');

const PARSED: DocumentResult = {
  markdown: '# Q3 Report\n\nRevenue grew.',
  pages: 12,
  needsOcr: false,
  ocrApplied: false,
  suspectedGarbledText: false,
  parserUsed: 'pypdfium2',
};

function extractClient(overrides: Partial<{ document: unknown; structured: unknown }> = {}): ExtractClient {
  return {
    document: vi.fn(async () => PARSED),
    structured: vi.fn(async () => ({
      data: { invoiceTotal: 4820 },
      tokensInput: 120,
      tokensOutput: 20,
      modelUsed: 'test-model',
    })),
    health: vi.fn(async () => true),
    ...overrides,
  } as unknown as ExtractClient;
}

function remote(
  bytes: Buffer,
  init: { status?: number; headers?: Record<string, string> } = {},
): typeof fetch {
  return vi.fn(async () => new Response(new Uint8Array(bytes), { status: init.status ?? 200, headers: init.headers ?? {} })) as unknown as typeof fetch;
}

async function build(deps: Partial<ParseRouteDeps> = {}): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(
    async (instance) => {
      await registerParse(instance, {
        extractClient: deps.extractClient ?? extractClient(),
        maxUploadBytes: deps.maxUploadBytes ?? 1024 * 1024,
        userAgent: 'HelixTest/0',
        fetchImpl: deps.fetchImpl ?? remote(PDF, { headers: { 'content-type': 'application/pdf' } }),
        cache: deps.cache ?? new ParseCache<DocumentResult>(),
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
  return app.inject({ method: 'POST', url: '/v1/parse', payload: body as Record<string, unknown> });
}

describe('POST /v1/parse — url path', () => {
  it('fetches the file, parses it and returns the parse envelope', async () => {
    const client = extractClient();
    const app = await build({ extractClient: client });
    const response = await postJson(app, { url: 'https://example.com/files/report.pdf' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.markdown).toBe(PARSED.markdown);
    expect(body.data.json).toBeUndefined();
    expect(body.data.metadata).toMatchObject({
      filename: 'report.pdf',
      pageCount: 12,
      fileType: 'pdf',
      ocrUsed: false,
      sourceUrl: 'https://example.com/files/report.pdf',
      fromCache: false,
    });
    expect(typeof body.data.metadata.contentHash).toBe('string');

    const call = (client.document as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(call).toMatchObject({ contentType: 'application/pdf', ocr: 'auto', tables: 'auto' });
    expect(Buffer.isBuffer(call.data)).toBe(true);
  });

  it('maps ocr force/off onto helix-extract always/never', async () => {
    const client = extractClient();
    const app = await build({ extractClient: client });

    await postJson(app, { url: 'https://example.com/a.pdf', ocr: 'force' });
    await postJson(app, { url: 'https://example.com/b.pdf', ocr: 'off', maxPages: 3 });

    const calls = (client.document as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]?.[0]).toMatchObject({ ocr: 'always' });
    expect(calls[1]?.[0]).toMatchObject({ ocr: 'never', maxPages: 3 });
  });

  it('rejects a body with neither url nor file', async () => {
    const app = await build();
    const response = await postJson(app, { formats: ['markdown'] });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_request', field: 'url' });
    expect(response.json().requestId).toBeDefined();
  });

  it('reports a non-2xx remote as a typed http_error failure', async () => {
    const app = await build({ fetchImpl: remote(Buffer.from('nope'), { status: 404 }) });
    const response = await postJson(app, { url: 'https://example.com/missing.pdf' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: false,
      failure: { reason: 'http_error', statusCode: 404, url: 'https://example.com/missing.pdf' },
    });
  });

  it('classifies a DNS failure from the remote fetch', async () => {
    const failing = vi.fn(async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    }) as unknown as typeof fetch;
    const app = await build({ fetchImpl: failing });
    const response = await postJson(app, { url: 'https://nope.invalid/x.pdf' });
    expect(response.json()).toMatchObject({ success: false, failure: { reason: 'dns' } });
  });

  it('refuses an HTML page as unsupported_type and points at /scrape', async () => {
    const app = await build({ fetchImpl: remote(HTML, { headers: { 'content-type': 'text/html' } }) });
    const response = await postJson(app, { url: 'https://example.com/page' });
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.failure.reason).toBe('unsupported_type');
    expect(body.failure.detail).toContain('/v1/scrape');
  });

  it('sniffs a PDF served as application/octet-stream', async () => {
    const app = await build({
      fetchImpl: remote(PDF, { headers: { 'content-type': 'application/octet-stream' } }),
    });
    const response = await postJson(app, { url: 'https://cdn.example.com/blob/1234' });
    expect(response.json().data.metadata.fileType).toBe('pdf');
  });

  it('takes the filename from Content-Disposition when present', async () => {
    const app = await build({
      fetchImpl: remote(PDF, {
        headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="invoice-0142.pdf"' },
      }),
    });
    const response = await postJson(app, { url: 'https://example.com/download?id=9' });
    expect(response.json().data.metadata.filename).toBe('invoice-0142.pdf');
  });

  it('returns 413 when the remote file exceeds the upload ceiling', async () => {
    const app = await build({ maxUploadBytes: 16, fetchImpl: remote(PDF, { headers: { 'content-type': 'application/pdf' } }) });
    const response = await postJson(app, { url: 'https://example.com/big.pdf' });
    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ error: 'payload_too_large', field: 'file' });
  });
});

describe('POST /v1/parse — upload path', () => {
  it('parses a multipart file without touching the network', async () => {
    const client = extractClient();
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const app = await build({ extractClient: client, fetchImpl });

    const { headers, payload } = await multipart({ ocr: 'auto' }, { name: 'deck.pdf', type: 'application/pdf', bytes: PDF });
    const response = await app.inject({ method: 'POST', url: '/v1/parse', headers, payload });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.metadata).toMatchObject({ filename: 'deck.pdf', fileType: 'pdf' });
    expect('sourceUrl' in response.json().data.metadata).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts comma-separated formats and a JSON-encoded jsonOptions field', async () => {
    const client = extractClient();
    const app = await build({ extractClient: client });

    const { headers, payload } = await multipart(
      {
        formats: 'markdown,json',
        jsonOptions: JSON.stringify({ schema: { type: 'object', properties: { invoiceTotal: { type: 'number' } } } }),
      },
      { name: 'invoice.pdf', type: 'application/pdf', bytes: PDF },
    );
    const response = await app.inject({ method: 'POST', url: '/v1/parse', headers, payload });

    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.json).toEqual({ invoiceTotal: 4820 });
    expect(body.data.usage).toMatchObject({ tokens: { input: 120, output: 20 } });
    expect(client.structured).toHaveBeenCalledWith(
      expect.objectContaining({ content: PARSED.markdown, schema: expect.objectContaining({ type: 'object' }) }),
    );
  });

  it('rejects a multipart request without a file part', async () => {
    const app = await build();
    const { headers, payload } = await multipart({ ocr: 'auto' });
    const response = await app.inject({ method: 'POST', url: '/v1/parse', headers, payload });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_request', field: 'file' });
  });

  it('rejects malformed jsonOptions', async () => {
    const app = await build();
    const { headers, payload } = await multipart({ jsonOptions: '{not json' }, { name: 'a.pdf', type: 'application/pdf', bytes: PDF });
    const response = await app.inject({ method: 'POST', url: '/v1/parse', headers, payload });
    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('jsonOptions');
  });

  it('returns 413 for an upload over the ceiling', async () => {
    const app = await build({ maxUploadBytes: 8 });
    const { headers, payload } = await multipart({}, { name: 'a.pdf', type: 'application/pdf', bytes: Buffer.alloc(200 * 1024) });
    const response = await app.inject({ method: 'POST', url: '/v1/parse', headers, payload });
    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ error: 'payload_too_large' });
  });

  it('classifies Office files from the declared type when the bytes are a zip', async () => {
    const client = extractClient();
    const app = await build({ extractClient: client });
    const { headers, payload } = await multipart(
      {},
      {
        name: 'deck.pptx',
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        bytes: ZIP,
      },
    );
    const response = await app.inject({ method: 'POST', url: '/v1/parse', headers, payload });
    expect(response.json().data.metadata.fileType).toBe('pptx');
    expect((client.document as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
  });

  it('falls back to the extension for a zip with a generic content type', async () => {
    const app = await build();
    const { headers, payload } = await multipart({}, { name: 'sheet.xlsx', type: 'application/octet-stream', bytes: ZIP });
    const response = await app.inject({ method: 'POST', url: '/v1/parse', headers, payload });
    expect(response.json().data.metadata.fileType).toBe('xlsx');
  });

  it('reports an empty upload as an empty failure', async () => {
    const app = await build();
    const { headers, payload } = await multipart({}, { name: 'a.pdf', type: 'application/pdf', bytes: Buffer.alloc(0) });
    const response = await app.inject({ method: 'POST', url: '/v1/parse', headers, payload });
    expect(response.json()).toMatchObject({ success: false, failure: { reason: 'empty' } });
  });
});

describe('POST /v1/parse — json format', () => {
  it('requires jsonOptions when json is requested', async () => {
    const app = await build();
    const response = await postJson(app, { url: 'https://example.com/a.pdf', formats: ['json'] });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_request', field: 'formats' });
  });

  it('rejects length keywords in the schema', async () => {
    const app = await build();
    const response = await postJson(app, {
      url: 'https://example.com/a.pdf',
      formats: ['json'],
      jsonOptions: { schema: { type: 'array', minItems: 3 } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_schema', field: 'jsonOptions.schema.minItems' });
  });

  it('rejects a provider override instead of silently ignoring it', async () => {
    const app = await build();
    const response = await postJson(app, {
      url: 'https://example.com/a.pdf',
      formats: ['json'],
      jsonOptions: { prompt: 'total', provider: 'openai' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('provider');
  });

  it('keeps the markdown and warns when the model step fails', async () => {
    const client = extractClient({
      structured: vi.fn(async () => {
        throw new ExtractHttpError(503, 'No LLM provider configured');
      }),
    });
    const app = await build({ extractClient: client });
    const response = await postJson(app, {
      url: 'https://example.com/a.pdf',
      formats: ['markdown', 'json'],
      jsonOptions: { prompt: 'Extract the total' },
    });
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.markdown).toBe(PARSED.markdown);
    expect(body.data.json).toBeUndefined();
    expect(body.warnings[0]).toContain('No LLM provider configured');
  });
});

describe('POST /v1/parse — parser outcomes', () => {
  it('maps a 415 from helix-extract to unsupported_type', async () => {
    const client = extractClient({
      document: vi.fn(async () => {
        throw new ExtractHttpError(415, 'unsupported content type: image/png');
      }),
    });
    const app = await build({ extractClient: client, fetchImpl: remote(PNG, { headers: { 'content-type': 'image/png' } }) });
    const response = await postJson(app, { url: 'https://example.com/scan.png' });
    expect(response.json()).toMatchObject({
      success: false,
      failure: { reason: 'unsupported_type', detail: 'unsupported content type: image/png' },
    });
  });

  it('reports an unreachable helix-extract as service_unavailable with escalation available', async () => {
    const client = extractClient({
      document: vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    });
    const app = await build({ extractClient: client });
    const response = await postJson(app, { url: 'https://example.com/a.pdf' });
    expect(response.json()).toMatchObject({
      success: false,
      failure: { reason: 'service_unavailable', escalationAvailable: true },
    });
  });

  it('warns when the text layer is missing and OCR was off', async () => {
    const client = extractClient({
      document: vi.fn(async () => ({ ...PARSED, markdown: '', needsOcr: true, ocrApplied: false })),
    });
    const app = await build({ extractClient: client });
    const response = await postJson(app, { url: 'https://example.com/scan.pdf', ocr: 'off' });
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.metadata).toMatchObject({ ocrUsed: false, needsOcr: true });
    expect(body.warnings[0]).toContain('ocr: off');
  });

  it('reports ocrUsed when OCR ran', async () => {
    const client = extractClient({
      document: vi.fn(async () => ({ ...PARSED, needsOcr: true, ocrApplied: true, parserUsed: 'marker' })),
    });
    const app = await build({ extractClient: client });
    const response = await postJson(app, { url: 'https://example.com/scan.pdf' });
    expect(response.json().data.metadata).toMatchObject({ ocrUsed: true, parser: 'marker' });
    expect(response.json().warnings).toBeUndefined();
  });
});

describe('POST /v1/parse — cache', () => {
  it('parses identical bytes once and marks the second answer fromCache', async () => {
    const client = extractClient();
    const app = await build({ extractClient: client });

    const first = await postJson(app, { url: 'https://a.example.com/report.pdf' });
    const second = await postJson(app, { url: 'https://mirror.example.com/report.pdf' });

    expect(first.json().data.metadata.fromCache).toBe(false);
    expect(second.json().data.metadata.fromCache).toBe(true);
    expect(second.json().data.metadata.contentHash).toBe(first.json().data.metadata.contentHash);
    expect(client.document).toHaveBeenCalledTimes(1);
  });

  it('does not serve a text-layer result to an ocr: force request', async () => {
    const client = extractClient();
    const app = await build({ extractClient: client });

    await postJson(app, { url: 'https://example.com/report.pdf' });
    await postJson(app, { url: 'https://example.com/report.pdf', ocr: 'force' });

    expect(client.document).toHaveBeenCalledTimes(2);
  });
});
