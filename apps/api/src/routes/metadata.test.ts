import { describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerMetadata, scrubbedFilename, type MetadataRouteDeps } from './metadata.js';
import {
  ExtractHttpError,
  type ExtractClient,
  type MetadataFinding,
  type MetadataScanResult,
  type MetadataScrubResult,
} from '../extract/client.js';
import type { Lookup } from '../parse/remote.js';

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
const HTML = Buffer.from('<!DOCTYPE html><html><body>Not a document</body></html>');
const CLEANED = Buffer.from('%PDF-1.7\ncleaned\n%%EOF');

const finding = (over: Partial<MetadataFinding> = {}): MetadataFinding => ({
  group: 'docinfo',
  key: 'Author',
  value: 'Jane Roe',
  risk: 'high',
  category: 'identity',
  removable: true,
  ...over,
});

const SCAN: MetadataScanResult = {
  fileType: 'pdf',
  findings: [
    finding({ key: 'Producer', value: 'Acrobat 24', risk: 'medium', category: 'software' }),
    finding({ key: 'CreationDate', value: 'D:20260101', risk: 'low', category: 'timestamp' }),
    finding(),
  ],
  riskSummary: { high: 1, medium: 1, low: 1 },
  warnings: [],
};

const SCRUB: MetadataScrubResult = {
  data: CLEANED,
  fileType: 'pdf',
  removed: [finding({ key: 'Producer', risk: 'medium', category: 'software' }), finding()],
  retained: [],
  riskSummary: { high: 1, medium: 1, low: 0 },
  warnings: [],
  bytesBefore: PDF.length,
  bytesAfter: CLEANED.length,
};

function extractClient(
  overrides: Partial<{ metadataScan: unknown; metadataScrub: unknown }> = {},
): ExtractClient {
  return {
    metadataScan: vi.fn(async () => SCAN),
    metadataScrub: vi.fn(async () => SCRUB),
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

async function build(deps: Partial<MetadataRouteDeps> = {}): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(
    async (instance) => {
      await registerMetadata(instance, {
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

describe('POST /v1/metadata', () => {
  it('scans an uploaded file and ranks findings worst-first', async () => {
    const app = await build();
    const { headers, payload } = await multipart({}, { name: 'report.pdf', type: 'application/pdf', bytes: PDF });

    const response = await app.inject({ method: 'POST', url: '/v1/metadata', headers, payload });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.success).toBe(true);
    // Ordered by consequence, not by the order helix-extract happened to read them.
    expect(body.data.findings.map((f: MetadataFinding) => f.risk)).toEqual(['high', 'medium', 'low']);
    expect(body.data.riskSummary).toEqual({ high: 1, medium: 1, low: 1 });
    expect(body.data.metadata.fileType).toBe('pdf');
    expect(body.data.metadata.filename).toBe('report.pdf');
    expect(body.data.metadata.contentHash).toMatch(/^[0-9a-f]{64}$/);
    await app.close();
  });

  it('fetches a url and reports the source on the result', async () => {
    const app = await build();
    const response = await post(app, '/v1/metadata', { url: 'https://example.com/files/report.pdf' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.metadata.sourceUrl).toBe('https://example.com/files/report.pdf');
    expect(body.data.metadata.filename).toBe('report.pdf');
    await app.close();
  });

  it('surfaces the scan warnings so a partial report is never read as a clean one', async () => {
    const app = await build({
      extractClient: extractClient({
        metadataScan: vi.fn(async () => ({ ...SCAN, warnings: ['docProps/custom.xml is not valid XML'] })),
      }),
    });
    const response = await post(app, '/v1/metadata', { url: 'https://example.com/a.pdf' });

    expect(response.json().warnings).toEqual(['docProps/custom.xml is not valid XML']);
    await app.close();
  });

  it('refuses a url that resolves to a private address, on the first hop', async () => {
    const app = await build({ lookup: privateLookup });
    const response = await post(app, '/v1/metadata', { url: 'https://internal.example.com/a.pdf' });

    expect(response.statusCode).toBe(400);
    expect(response.json().field).toBe('url');
    await app.close();
  });

  it('refuses a redirect into a private address', async () => {
    let hop = 0;
    const lookup: Lookup = async () => (hop++ === 0 ? [{ address: '93.184.216.34', family: 4 }] : [{ address: '10.0.0.5', family: 4 }]);
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: 'https://internal.example.com/a.pdf' } }),
    ) as unknown as typeof fetch;

    const app = await build({ fetchImpl, lookup });
    const response = await post(app, '/v1/metadata', { url: 'https://example.com/a.pdf' });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('answers 413 when a fetched file exceeds the ceiling', async () => {
    const app = await build({
      maxUploadBytes: 16,
      fetchImpl: remote(Buffer.alloc(64, 0x25), { headers: { 'content-type': 'application/pdf' } }),
    });
    const response = await post(app, '/v1/metadata', { url: 'https://example.com/big.pdf' });

    expect(response.statusCode).toBe(413);
    expect(response.json().error).toBe('payload_too_large');
    await app.close();
  });

  it('reports an HTML page as a typed failure rather than scanning it', async () => {
    const app = await build();
    const { headers, payload } = await multipart({}, { name: 'page.html', type: 'text/html', bytes: HTML });

    const response = await app.inject({ method: 'POST', url: '/v1/metadata', headers, payload });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(false);
    expect(body.failure.reason).toBe('unsupported_type');
    await app.close();
  });

  it('reports an empty file as a typed failure', async () => {
    const app = await build();
    const { headers, payload } = await multipart({}, { name: 'empty.pdf', type: 'application/pdf', bytes: Buffer.alloc(0) });

    const response = await app.inject({ method: 'POST', url: '/v1/metadata', headers, payload });
    expect(response.json().failure.reason).toBe('empty');
    await app.close();
  });

  it('turns an unreachable helix-extract into an escalatable failure, not a 500', async () => {
    const app = await build({
      extractClient: extractClient({
        metadataScan: vi.fn(async () => {
          throw new ExtractHttpError(503, 'connection refused');
        }),
      }),
    });
    const response = await post(app, '/v1/metadata', { url: 'https://example.com/a.pdf' });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.failure.reason).toBe('service_unavailable');
    expect(body.failure.escalationAvailable).toBe(true);
    await app.close();
  });

  it('rejects a body carrying neither url nor file', async () => {
    const app = await build();
    const response = await post(app, '/v1/metadata', {});

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/`url`.*`file`/);
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
        metadataScan: vi.fn(async () => {
          await gate;
          return SCAN;
        }),
      }),
    });

    const first = post(app, '/v1/metadata', { url: 'https://example.com/a.pdf' });
    // Let the first request take the slot before the second arrives.
    await new Promise((resolve) => setImmediate(resolve));
    const second = await post(app, '/v1/metadata', { url: 'https://example.com/b.pdf' });

    expect(second.statusCode).toBe(503);
    expect(second.headers['retry-after']).toBe('1');

    release();
    expect((await first).statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /v1/metadata/scrub', () => {
  it('answers with the cleaned bytes and the report in a header', async () => {
    const app = await build();
    const { headers, payload } = await multipart({}, { name: 'report.pdf', type: 'application/pdf', bytes: PDF });

    const response = await app.inject({ method: 'POST', url: '/v1/metadata/scrub', headers, payload });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.rawPayload.equals(CLEANED)).toBe(true);
    expect(response.headers['content-disposition']).toBe('attachment; filename="report.scrubbed.pdf"');
    expect(response.headers['x-helix-metadata-removed']).toBe('2');

    const report = JSON.parse(String(response.headers['x-helix-metadata-report']));
    expect(report.removed.map((f: MetadataFinding) => f.risk)).toEqual(['high', 'medium']);
    expect(report.metadata.bytesBefore).toBe(PDF.length);
    expect(report.metadata.bytesAfter).toBe(CLEANED.length);
    await app.close();
  });

  it('reports what it could NOT remove rather than implying the file is clean', async () => {
    const retained = finding({ group: 'tracked', key: 'word/comments.xml', value: 'present', removable: false });
    const app = await build({
      extractClient: extractClient({
        metadataScrub: vi.fn(async () => ({
          ...SCRUB,
          retained: [retained],
          warnings: ['1 part(s) naming people were kept'],
        })),
      }),
    });
    const { headers, payload } = await multipart({}, { name: 'memo.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.alloc(32)]) });

    const response = await app.inject({ method: 'POST', url: '/v1/metadata/scrub', headers, payload });
    const report = JSON.parse(String(response.headers['x-helix-metadata-report']));

    expect(response.headers['x-helix-metadata-retained']).toBe('1');
    expect(report.retained[0].key).toBe('word/comments.xml');
    expect(report.retained[0].removable).toBe(false);
    expect(report.warnings).toContain('1 part(s) naming people were kept');
    await app.close();
  });

  it('scrubs a fetched url', async () => {
    const app = await build();
    const response = await post(app, '/v1/metadata/scrub', { url: 'https://example.com/files/report.pdf' });

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.equals(CLEANED)).toBe(true);
    await app.close();
  });

  it('applies the same private-address refusal as the scan', async () => {
    const app = await build({ lookup: privateLookup });
    const response = await post(app, '/v1/metadata/scrub', { url: 'https://internal.example.com/a.pdf' });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('returns a typed failure, not bytes, when helix-extract refuses the file', async () => {
    const app = await build({
      extractClient: extractClient({
        metadataScrub: vi.fn(async () => {
          throw new ExtractHttpError(422, 'the file could not be read as pdf');
        }),
      }),
    });
    const response = await post(app, '/v1/metadata/scrub', { url: 'https://example.com/a.pdf' });

    expect(response.statusCode).toBe(200);
    expect(response.json().failure.reason).toBe('unsupported_type');
    await app.close();
  });
});

describe('scrubbedFilename', () => {
  it('inserts .scrubbed before the extension', () => {
    expect(scrubbedFilename('report.pdf', 'pdf')).toBe('report.scrubbed.pdf');
    expect(scrubbedFilename('a.b.docx', 'docx')).toBe('a.b.scrubbed.docx');
  });

  it('names a file that arrived without one', () => {
    expect(scrubbedFilename(undefined, 'png')).toBe('file.scrubbed.png');
    expect(scrubbedFilename('   ', 'png')).toBe('file.scrubbed.png');
  });

  it('strips characters that would break out of the Content-Disposition header', () => {
    // A quote would end the filename token; a newline would inject a header.
    expect(scrubbedFilename('a"b.pdf', 'pdf')).toBe('a_b.scrubbed.pdf');
    expect(scrubbedFilename('a\r\nb.pdf', 'pdf')).toBe('a__b.scrubbed.pdf');
    expect(scrubbedFilename('../../etc/passwd.pdf', 'pdf')).toBe('.._.._etc_passwd.scrubbed.pdf');
  });

  it('appends rather than splitting on a leading dot', () => {
    expect(scrubbedFilename('.hidden', 'png')).toBe('.hidden.scrubbed.png');
  });
});
