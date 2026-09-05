import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ExtractHttpError, type ConvertFormat, type ExtractClient } from '../extract/client.js';
import type { FailureReason } from '../core/block-detection.js';
import { classifyFile, CONTENT_TYPE_FOR, type FileType } from '../parse/file-type.js';
import { defaultLookup, HostNotAllowedError, type Lookup } from '../parse/remote.js';
import { fetchRemote, RequestError, type FileInput } from './parse.js';

/**
 * POST /v1/convert -- rasterize a PDF page, or re-encode an image between PNG and JPEG.
 *
 * Scoped to what helix-extract's pipeline can actually produce: a PDF page as
 * a bitmap, and PNG/JPEG converted to each other. Nothing here authors a new
 * PDF, DOCX, PPTX or XLSX -- that direction needs a document-layout engine
 * this project does not carry, a separate and much larger decision.
 *
 * Same two inputs as /parse: a JSON body with `url`, or a `multipart/form-data`
 * body with a `file` part. The response body IS the converted file, the same
 * shape /metadata/scrub answers with, so a caller can stream it straight to
 * disk or into a vision call without unwrapping an envelope.
 */

const VALID_SOURCES = new Set<FileType>(['pdf', 'png', 'jpg']);

const SUPPORTED_TARGETS: Record<'pdf' | 'png' | 'jpg', readonly ConvertFormat[]> = {
  pdf: ['png', 'jpeg'],
  png: ['jpeg'],
  jpg: ['png'],
};

const ConvertOptionsSchema = z.object({
  to: z.enum(['png', 'jpeg']),
  page: z.number().int().min(1).default(1),
  dpi: z.number().int().min(36).max(600).default(144),
  timeout: z.number().int().min(1_000).max(300_000).default(30_000),
});

const ConvertJsonRequestSchema = ConvertOptionsSchema.extend({ url: z.string().url() });

type ConvertOptions = z.infer<typeof ConvertOptionsSchema>;

export interface ConvertRouteDeps {
  extractClient: ExtractClient;
  maxUploadBytes: number;
  userAgent: string;
  fetchImpl?: typeof fetch | undefined;
  lookup?: Lookup | undefined;
  maxInFlight?: number | undefined;
}

const DEFAULT_MAX_IN_FLIGHT = 8;

function invalid(message: string, field?: string): RequestError {
  return new RequestError(400, 'invalid_request', message, field);
}

async function readConvertMultipart(raw: Buffer, contentType: string): Promise<{ file: FileInput; options: unknown }> {
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
  const to = form.get('to');
  if (typeof to === 'string' && to.trim()) options['to'] = to.trim();

  for (const key of ['page', 'dpi', 'timeout'] as const) {
    const value = form.get(key);
    if (typeof value === 'string' && value.trim()) {
      const n = Number(value);
      options[key] = Number.isFinite(n) ? n : value;
    }
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

function unsupportedTarget(fileType: 'pdf' | 'png' | 'jpg', to: ConvertFormat): RequestError {
  const allowed = SUPPORTED_TARGETS[fileType];
  return new RequestError(
    415,
    'unsupported_type',
    `${fileType} cannot convert to ${to}; supported targets: ${allowed.join(', ')}`,
    'to',
  );
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
    message: `The file exceeds this instance's limit of ${Math.round(maxBytes / (1024 * 1024))} MB (HELIX_PARSE_MAX_UPLOAD_MB).`,
    field: 'file',
    requestId: request.id,
  };
}

function saturatedBody(request: FastifyRequest, maxInFlight: number): Record<string, unknown> {
  return {
    error: 'service_unavailable',
    message: `This instance is already converting ${maxInFlight} files (HELIX_PARSE_MAX_INFLIGHT). Retry shortly.`,
    requestId: request.id,
  };
}

interface Failure {
  reason: FailureReason;
  detail: string;
  statusCode?: number | undefined;
}

function convertFailure(error: unknown): Failure | RequestError {
  if (error instanceof ExtractHttpError) {
    if (error.status === 415) return { reason: 'unsupported_type', detail: error.detail };
    if (error.status === 422) return { reason: 'unsupported_type', detail: error.detail };
    if (error.status === 400) return invalid(error.detail);
    return { reason: 'service_unavailable', detail: error.detail || `helix-extract answered HTTP ${error.status}` };
  }
  const err = error as { name?: string; message?: string };
  if (err.name === 'TimeoutError' || err.name === 'AbortError') {
    return { reason: 'timeout', detail: 'helix-extract did not finish converting the file in time' };
  }
  return { reason: 'service_unavailable', detail: err.message ?? 'helix-extract is unreachable' };
}

// Quotes, control characters and a path separator would break out of
// Content-Disposition or let a client save the name as a directory traversal.
function sanitizeFilenamePart(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const isControl = code < 0x20;
    const isUnsafe = char === '"' || char === '\\' || char === '/';
    out += isControl || isUnsafe ? '_' : char;
  }
  return out.trim();
}

function convertedFilename(filename: string | undefined, to: ConvertFormat): string {
  const ext = to === 'jpeg' ? 'jpg' : to;
  const fallback = `file.${ext}`;
  if (!filename) return fallback;
  const safe = sanitizeFilenamePart(filename);
  if (!safe) return fallback;
  const dot = safe.lastIndexOf('.');
  const base = dot > 0 ? safe.slice(0, dot) : safe;
  return `${base}.${ext}`;
}

export async function registerConvert(app: FastifyInstance, deps: ConvertRouteDeps): Promise<void> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const lookup = deps.lookup ?? defaultLookup;
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
            ? 'Send a JSON body with `url` and `to`, or a multipart/form-data body with a `file` part and `to`.'
            : fastifyMessage ?? 'The request body could not be parsed.';
        return reply.code(status).send({ error: 'invalid_request', message, requestId: request.id });
      }
      request.log.error({ error }, 'convert route failed');
      return reply.code(500).send({
        error: 'internal_error',
        message: 'The convert request failed unexpectedly.',
        requestId: request.id,
      });
    });

    scope.post('/convert', { bodyLimit }, async (request, reply) => {
      if (inFlight >= maxInFlight) {
        void reply.header('retry-after', '1');
        return reply.code(503).send(saturatedBody(request, maxInFlight));
      }
      inFlight += 1;
      try {
        return await handleConvert(request, reply);
      } finally {
        inFlight -= 1;
      }
    });

    async function readOptions(raw: unknown): Promise<ConvertOptions> {
      const parsed = ConvertOptionsSchema.safeParse(raw);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const field = first?.path.join('.');
        throw invalid(field === 'to' ? 'Send `to` as `png` or `jpeg`.' : `${field}: ${first?.message}`, field);
      }
      return parsed.data;
    }

    async function handleConvert(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
      const contentType = request.headers['content-type'] ?? '';
      const isMultipart = contentType.toLowerCase().startsWith('multipart/form-data');

      let file: FileInput;
      let options: ConvertOptions;

      try {
        if (isMultipart) {
          const raw = request.body;
          if (!Buffer.isBuffer(raw)) throw invalid('multipart body was empty.', 'file');
          const read = await readConvertMultipart(raw, contentType);
          (request as { body: unknown }).body = undefined;
          file = read.file;
          options = await readOptions(read.options);
        } else {
          const parsed = ConvertJsonRequestSchema.safeParse(request.body);
          if (!parsed.success) {
            const first = parsed.error.issues[0];
            const missingUrl = parsed.error.issues.some((i) => i.path[0] === 'url' && i.code === 'invalid_type');
            const missingTo = parsed.error.issues.some((i) => i.path[0] === 'to');
            throw invalid(
              missingUrl
                ? 'Send a `url` in a JSON body, or a `file` part in a multipart body.'
                : missingTo
                  ? 'Send `to` as `png` or `jpeg`.'
                  : `${first?.path.join('.')}: ${first?.message}`,
              missingUrl ? 'url' : missingTo ? 'to' : first?.path.join('.'),
            );
          }
          const { url, ...rest } = parsed.data;
          options = rest;

          const fetched = await fetchRemote(url, {
            fetchImpl,
            lookup,
            userAgent: deps.userAgent,
            timeoutMs: options.timeout,
            maxBytes: deps.maxUploadBytes,
          });
          if (!fetched.ok) {
            if ('tooLarge' in fetched) {
              return reply.code(413).send(tooLargeBody(request, deps.maxUploadBytes));
            }
            return reply.code(200).send({
              success: false,
              failure: { url, ...fetched.failure, detectedBy: [], escalationAvailable: false },
            });
          }
          file = fetched.file;
        }
      } catch (error) {
        if (error instanceof RequestError) return sendRequestError(reply, request, error);
        if (error instanceof HostNotAllowedError) return sendRequestError(reply, request, invalid(error.message, 'url'));
        throw error;
      }

      if (file.bytes.length === 0) {
        return reply.code(200).send({
          success: false,
          failure: {
            url: file.sourceUrl,
            reason: 'empty',
            detail: 'the file has no bytes',
            detectedBy: [],
            escalationAvailable: false,
          },
        });
      }

      const classified = classifyFile({ bytes: file.bytes, contentType: file.contentType, filename: file.filename });
      if (!classified.fileType || !VALID_SOURCES.has(classified.fileType)) {
        return reply.code(200).send({
          success: false,
          failure: {
            url: file.sourceUrl,
            reason: 'unsupported_type',
            detail: classified.fileType
              ? `conversion is not supported from ${classified.fileType}; supported sources: pdf, png, jpg`
              : classified.reason,
            detectedBy: [],
            escalationAvailable: false,
          },
        });
      }
      const fileType = classified.fileType as 'pdf' | 'png' | 'jpg';

      if (!SUPPORTED_TARGETS[fileType].includes(options.to)) {
        return sendRequestError(reply, request, unsupportedTarget(fileType, options.to));
      }

      let converted;
      try {
        converted = await deps.extractClient.convert({
          data: file.bytes,
          contentType: CONTENT_TYPE_FOR[fileType],
          to: options.to,
          page: fileType === 'pdf' ? options.page : undefined,
          dpi: fileType === 'pdf' ? options.dpi : undefined,
        });
      } catch (error) {
        const outcome = convertFailure(error);
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

      const downloadName = convertedFilename(file.filename, options.to);

      return reply
        .code(200)
        .header('content-type', converted.contentType)
        .header('content-disposition', `attachment; filename="${downloadName}"`)
        .header('x-helix-convert-pages', String(converted.pages))
        .header('x-helix-convert-page', converted.pageConverted !== undefined ? String(converted.pageConverted) : '')
        .send(converted.data);
    }
  });
}
