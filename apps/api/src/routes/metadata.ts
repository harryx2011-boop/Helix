import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ExtractHttpError,
  type ExtractClient,
  type MetadataFinding,
  type MetadataRisk,
} from '../extract/client.js';
import type { FailureReason } from '../core/block-detection.js';
import { classifyFile, CONTENT_TYPE_FOR, type FileType } from '../parse/file-type.js';
import { contentHash } from '../parse/cache.js';
import { assertPublicUrl, defaultLookup, HostNotAllowedError, type Lookup } from '../parse/remote.js';
import { createPinnedFetch, type PinnedFetch } from '../core/pinned-fetch.js';


const OptionsSchema = z.object({
  timeout: z.number().int().min(1_000).max(300_000).default(30_000),
});

const JsonRequestSchema = OptionsSchema.extend({ url: z.string().url() });

type Options = z.infer<typeof OptionsSchema>;

const RISK_ORDER: Record<MetadataRisk, number> = { high: 0, medium: 1, low: 2 };

export interface MetadataRouteDeps {
  extractClient: ExtractClient;
  maxUploadBytes: number;
  userAgent: string;
  fetchImpl?: PinnedFetch | undefined;
  lookup?: Lookup | undefined;
  maxInFlight?: number | undefined;
}

const DEFAULT_MAX_IN_FLIGHT = 8;
const MAX_REDIRECTS = 5;

interface FileInput {
  bytes: Buffer;
  filename?: string | undefined;
  contentType?: string | undefined;
  sourceUrl?: string | undefined;
}

interface Failure {
  reason: FailureReason;
  detail: string;
  statusCode?: number | undefined;
}

class RequestError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly field: string | undefined;

  constructor(statusCode: number, code: string, message: string, field?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.field = field;
  }
}

function invalid(message: string, field?: string): RequestError {
  return new RequestError(400, 'invalid_request', message, field);
}

function sendRequestError(reply: FastifyReply, request: FastifyRequest, error: RequestError): FastifyReply {
  return reply.code(error.statusCode).send({
    error: error.code,
    message: error.message,
    ...(error.field ? { field: error.field } : {}),
    requestId: request.id,
  });
}

function tooLargeBody(request: FastifyRequest, maxBytes: number): Record<string, unknown> {
  return {
    error: 'payload_too_large',
    message: `The file exceeds this instance's ceiling of ${Math.round(maxBytes / (1024 * 1024))} MB (HELIX_PARSE_MAX_UPLOAD_MB).`,
    requestId: request.id,
  };
}

function saturatedBody(request: FastifyRequest, maxInFlight: number): Record<string, unknown> {
  return {
    error: 'service_unavailable',
    message: `This instance is already holding ${maxInFlight} files in memory (HELIX_PARSE_MAX_INFLIGHT). Retry shortly.`,
    requestId: request.id,
  };
}


async function readMultipart(raw: Buffer, contentType: string): Promise<{ file: FileInput; options: unknown }> {
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(raw), { headers: { 'content-type': contentType } }).formData();
  } catch (error) {
    throw invalid(
      `multipart body could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      'file',
    );
  }

  const entry = form.get('file');
  if (!entry || typeof entry === 'string') {
    throw invalid('multipart requests need a `file` part.', 'file');
  }

  const options: Record<string, unknown> = {};
  const timeout = form.get('timeout');
  if (typeof timeout === 'string' && timeout.trim()) {
    const value = Number(timeout);
    options['timeout'] = Number.isFinite(value) ? value : timeout;
  }

  return {
    file: {
      bytes: Buffer.from(await entry.arrayBuffer()),
      filename: entry.name || undefined,
      contentType: entry.type || undefined,
    },
    options,
  };
}


function filenameFromUrl(url: string): string | undefined {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : undefined;
  } catch {
    return undefined;
  }
}

function filenameFromDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  const star = /filename\*=(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      return star[1];
    }
  }
  return /filename="?([^";]+)"?/.exec(header)?.[1]?.trim() || undefined;
}

function classifyRemoteError(error: unknown): Failure {
  const err = error as { name?: string; cause?: { code?: string } };
  const code = err.cause?.code ?? '';

  if (err.name === 'TimeoutError' || err.name === 'AbortError') {
    return { reason: 'timeout', detail: 'the remote file did not finish downloading within `timeout`' };
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return { reason: 'dns', detail: `the hostname could not be resolved (${code})` };
  }
  if (code.startsWith('ERR_TLS') || code.startsWith('CERT_') || code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
    return { reason: 'tls', detail: `the TLS handshake failed (${code})` };
  }
  return { reason: 'http_error', detail: code ? `the remote fetch failed (${code})` : 'the remote fetch failed' };
}

async function fetchRemote(
  url: string,
  deps: { fetchImpl: PinnedFetch; lookup: Lookup; userAgent: string; timeoutMs: number; maxBytes: number },
): Promise<{ ok: true; file: FileInput } | { ok: false; failure: Failure } | { ok: false; tooLarge: true }> {
  const deadline = Date.now() + deps.timeoutMs;
  let current = new URL(url);
  let response: Response;

  for (let hop = 0; ; hop += 1) {
    await assertPublicUrl(current, deps.lookup);

    const remaining = deadline - Date.now();
    if (remaining <= 0) return { ok: false, failure: classifyRemoteError({ name: 'TimeoutError' }) };

    try {
      response = await deps.fetchImpl(current.toString(), {
        redirect: 'manual',
        headers: {
          'user-agent': deps.userAgent,
          accept:
            'application/pdf, application/vnd.openxmlformats-officedocument.*, image/png, image/jpeg, */*;q=0.5',
        },
        signal: AbortSignal.timeout(remaining),
      });
    } catch (error) {
      return { ok: false, failure: classifyRemoteError(error) };
    }

    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) break;

    await response.body?.cancel().catch(() => undefined);
    if (hop >= MAX_REDIRECTS) {
      return {
        ok: false,
        failure: { reason: 'http_error', detail: `the remote server redirected more than ${MAX_REDIRECTS} times` },
      };
    }
    try {
      current = new URL(location, current);
    } catch {
      return { ok: false, failure: { reason: 'http_error', detail: 'the remote server sent an invalid redirect' } };
    }
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return {
      ok: false,
      failure: {
        reason: 'http_error',
        detail: `the remote server answered HTTP ${response.status}`,
        statusCode: response.status,
      },
    };
  }

  const declaredLength = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declaredLength) && declaredLength > deps.maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false, tooLarge: true };
  }

  const chunks: Buffer[] = [];
  let received = 0;
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > deps.maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, tooLarge: true };
      }
      chunks.push(Buffer.from(value));
    }
  }

  return {
    ok: true,
    file: {
      bytes: Buffer.concat(chunks),
      filename: filenameFromDisposition(response.headers.get('content-disposition')) ?? filenameFromUrl(url),
      contentType: response.headers.get('content-type') ?? undefined,
      sourceUrl: url,
    },
  };
}


interface Intake {
  file: FileInput;
  options: Options;
}

function extractFailure(error: unknown): Failure | RequestError {
  if (error instanceof ExtractHttpError) {
    if (error.status === 415) return { reason: 'unsupported_type', detail: error.detail };
    if (error.status === 422) return { reason: 'unsupported_type', detail: error.detail };
    if (error.status === 400) return invalid(error.detail);
    return { reason: 'service_unavailable', detail: error.detail || `helix-extract answered HTTP ${error.status}` };
  }
  const err = error as { name?: string; message?: string };
  if (err.name === 'TimeoutError' || err.name === 'AbortError') {
    return { reason: 'timeout', detail: 'helix-extract did not finish reading the file in time' };
  }
  return { reason: 'service_unavailable', detail: err.message ?? 'helix-extract is unreachable' };
}

function byRisk(a: MetadataFinding, b: MetadataFinding): number {
  return RISK_ORDER[a.risk] - RISK_ORDER[b.risk];
}

export async function registerMetadata(app: FastifyInstance, deps: MetadataRouteDeps): Promise<void> {
  const lookup = deps.lookup ?? defaultLookup;
  const fetchImpl = deps.fetchImpl ?? createPinnedFetch({ lookup });
  const maxInFlight = deps.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT;
  const bodyLimit = deps.maxUploadBytes + 64 * 1024;

  let inFlight = 0;

  await app.register(async (scope) => {
    scope.addContentTypeParser(
      'multipart/form-data',
      { parseAs: 'buffer', bodyLimit },
      (_request, body, done) => done(null, body),
    );

    scope.addHook('preParsing', async (request, reply) => {
      if (inFlight >= maxInFlight) {
        void reply.header('retry-after', '1');
        return reply.code(503).send(saturatedBody(request, maxInFlight));
      }
      return undefined;
    });

    scope.setErrorHandler((error, request, reply) => {
      const { statusCode: status, message: fastifyMessage } = error as { statusCode?: number; message?: string };
      if (status === 413) return reply.code(413).send(tooLargeBody(request, deps.maxUploadBytes));
      if (status !== undefined && status >= 400 && status < 500) {
        const message =
          status === 415
            ? 'Send a JSON body with `url`, or a multipart/form-data body with a `file` part.'
            : fastifyMessage ?? 'The request body could not be parsed.';
        return reply.code(status).send({ error: 'invalid_request', message, requestId: request.id });
      }
      request.log.error({ error }, 'metadata route failed');
      return reply.code(500).send({
        error: 'internal_error',
        message: 'The metadata request failed unexpectedly.',
        requestId: request.id,
      });
    });

    async function intake(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<Intake | { sent: FastifyReply }> {
      const contentType = request.headers['content-type'] ?? '';
      const isMultipart = contentType.toLowerCase().startsWith('multipart/form-data');

      if (isMultipart) {
        const raw = request.body;
        if (!Buffer.isBuffer(raw)) throw invalid('multipart body was empty.', 'file');
        const read = await readMultipart(raw, contentType);
        (request as { body: unknown }).body = undefined;
        return { file: read.file, options: OptionsSchema.parse(read.options) };
      }

      const parsed = JsonRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const missingUrl = parsed.error.issues.some((i) => i.path[0] === 'url' && i.code === 'invalid_type');
        throw invalid(
          missingUrl
            ? 'Send a `url` in a JSON body, or a `file` part in a multipart body.'
            : `${first?.path.join('.')}: ${first?.message}`,
          missingUrl ? 'url' : first?.path.join('.'),
        );
      }

      const { url, ...rest } = parsed.data;
      const options = OptionsSchema.parse(rest);
      const fetched = await fetchRemote(url, {
        fetchImpl,
        lookup,
        userAgent: deps.userAgent,
        timeoutMs: options.timeout,
        maxBytes: deps.maxUploadBytes,
      });

      if (!fetched.ok) {
        if ('tooLarge' in fetched) {
          return { sent: await reply.code(413).send(tooLargeBody(request, deps.maxUploadBytes)) };
        }
        return {
          sent: await reply.code(200).send({
            success: false,
            failure: { url, ...fetched.failure, detectedBy: [], escalationAvailable: false },
          }),
        };
      }
      return { file: fetched.file, options };
    }

    function classify(file: FileInput, reply: FastifyReply): FileType | { sent: FastifyReply } {
      if (file.bytes.length === 0) {
        return {
          sent: reply.code(200).send({
            success: false,
            failure: {
              url: file.sourceUrl,
              reason: 'empty' as FailureReason,
              detail: 'the file has no bytes',
              detectedBy: [],
              escalationAvailable: false,
            },
          }) as unknown as FastifyReply,
        };
      }

      const classified = classifyFile({
        bytes: file.bytes,
        contentType: file.contentType,
        filename: file.filename,
      });
      if (!classified.fileType) {
        return {
          sent: reply.code(200).send({
            success: false,
            failure: {
              url: file.sourceUrl,
              reason: 'unsupported_type' as FailureReason,
              detail: classified.reason,
              detectedBy: [],
              escalationAvailable: false,
            },
          }) as unknown as FastifyReply,
        };
      }
      return classified.fileType;
    }

    function guard<T>(handler: () => Promise<T>): Promise<T> {
      inFlight += 1;
      return handler().finally(() => {
        inFlight -= 1;
      });
    }

    scope.post('/metadata', { bodyLimit }, async (request, reply) => {
      if (inFlight >= maxInFlight) {
        void reply.header('retry-after', '1');
        return reply.code(503).send(saturatedBody(request, maxInFlight));
      }
      return guard(() => handleScan(request, reply));
    });

    scope.post('/metadata/scrub', { bodyLimit }, async (request, reply) => {
      if (inFlight >= maxInFlight) {
        void reply.header('retry-after', '1');
        return reply.code(503).send(saturatedBody(request, maxInFlight));
      }
      return guard(() => handleScrub(request, reply));
    });

    async function handleScan(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
      const started = Date.now();
      let file: FileInput;

      try {
        const read = await intake(request, reply);
        if ('sent' in read) return read.sent;
        file = read.file;
      } catch (error) {
        if (error instanceof RequestError) return sendRequestError(reply, request, error);
        if (error instanceof HostNotAllowedError) return sendRequestError(reply, request, invalid(error.message, 'url'));
        throw error;
      }

      const classified = classify(file, reply);
      if (typeof classified !== 'string') return classified.sent;

      let scanned;
      try {
        scanned = await deps.extractClient.metadataScan({
          data: file.bytes,
          contentType: CONTENT_TYPE_FOR[classified],
        });
      } catch (error) {
        const outcome = extractFailure(error);
        if (outcome instanceof RequestError) return sendRequestError(reply, request, outcome);
        return reply.code(200).send({
          success: false,
          failure: {
            url: file.sourceUrl,
            ...outcome,
            detectedBy: [],
            escalationAvailable: outcome.reason === 'service_unavailable' || outcome.reason === 'timeout',
          },
        });
      }

      const findings = [...scanned.findings].sort(byRisk);
      return reply.code(200).send({
        success: true,
        data: {
          findings,
          riskSummary: scanned.riskSummary,
          metadata: {
            filename: file.filename,
            fileType: scanned.fileType,
            sizeBytes: file.bytes.length,
            contentHash: contentHash(file.bytes),
            sourceUrl: file.sourceUrl,
            scannedAt: new Date().toISOString(),
            timingMs: Date.now() - started,
          },
        },
        ...(scanned.warnings.length > 0 ? { warnings: scanned.warnings } : {}),
      });
    }

    async function handleScrub(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
      const started = Date.now();
      let file: FileInput;

      try {
        const read = await intake(request, reply);
        if ('sent' in read) return read.sent;
        file = read.file;
      } catch (error) {
        if (error instanceof RequestError) return sendRequestError(reply, request, error);
        if (error instanceof HostNotAllowedError) return sendRequestError(reply, request, invalid(error.message, 'url'));
        throw error;
      }

      const classified = classify(file, reply);
      if (typeof classified !== 'string') return classified.sent;

      let scrubbed;
      try {
        scrubbed = await deps.extractClient.metadataScrub({
          data: file.bytes,
          contentType: CONTENT_TYPE_FOR[classified],
        });
      } catch (error) {
        const outcome = extractFailure(error);
        if (outcome instanceof RequestError) return sendRequestError(reply, request, outcome);
        return reply.code(200).send({
          success: false,
          failure: {
            url: file.sourceUrl,
            ...outcome,
            detectedBy: [],
            escalationAvailable: outcome.reason === 'service_unavailable' || outcome.reason === 'timeout',
          },
        });
      }

      const report = {
        removed: [...scrubbed.removed].sort(byRisk),
        retained: [...scrubbed.retained].sort(byRisk),
        riskSummary: scrubbed.riskSummary,
        metadata: {
          filename: file.filename,
          fileType: scrubbed.fileType,
          bytesBefore: scrubbed.bytesBefore,
          bytesAfter: scrubbed.bytesAfter,
          sourceUrl: file.sourceUrl,
          scrubbedAt: new Date().toISOString(),
          timingMs: Date.now() - started,
        },
        ...(scrubbed.warnings.length > 0 ? { warnings: scrubbed.warnings } : {}),
      };

      const downloadName = scrubbedFilename(file.filename, classified);

      return reply
        .code(200)
        .header('content-type', CONTENT_TYPE_FOR[classified])
        .header('content-disposition', `attachment; filename="${downloadName}"`)
        .header('x-helix-metadata-report', JSON.stringify(report))
        .header('x-helix-metadata-removed', String(scrubbed.removed.length))
        .header('x-helix-metadata-retained', String(scrubbed.retained.length))
        .send(scrubbed.data);
    }
  });
}

export function scrubbedFilename(filename: string | undefined, fileType: FileType): string {
  const fallback = `file.scrubbed.${fileType}`;
  if (!filename) return fallback;
  const safe = filename.replace(/[\r\n"\\/]/g, '_').trim();
  if (!safe) return fallback;
  const dot = safe.lastIndexOf('.');
  if (dot <= 0) return `${safe}.scrubbed.${fileType}`;
  return `${safe.slice(0, dot)}.scrubbed${safe.slice(dot)}`;
}
