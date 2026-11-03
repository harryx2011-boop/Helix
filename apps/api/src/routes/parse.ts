import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ExtractHttpError, type DocumentResult, type ExtractClient } from '../extract/client.js';
import type { FailureReason } from '../core/block-detection.js';
import { classifyFile, CONTENT_TYPE_FOR, type FileType } from '../parse/file-type.js';
import { contentHash, ParseCache } from '../parse/cache.js';
import { assertPublicUrl, defaultLookup, HostNotAllowedError, type Lookup } from '../parse/remote.js';
import { createPinnedFetch, type PinnedFetch } from '../core/pinned-fetch.js';
import { rejectFabricationKeywords } from './scrape.js';
import { resolveProviderKeys, toClientKeys } from '../providers/resolve.js';


const JsonOptionsSchema = z
  .object({
    schema: z.record(z.unknown()).optional(),
    prompt: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
  })
  .strict();

const ParseOptionsSchema = z.object({
  formats: z.array(z.enum(['markdown', 'json'])).min(1).default(['markdown']),
  ocr: z.enum(['auto', 'force', 'off']).default('auto'),
  maxPages: z.number().int().min(1).optional(),
  tables: z.enum(['auto', 'high-fidelity']).default('auto'),
  timeout: z.number().int().min(1_000).max(300_000).default(30_000),
  jsonOptions: JsonOptionsSchema.optional(),
});

const ParseJsonRequestSchema = ParseOptionsSchema.extend({ url: z.string().url() });

type ParseOptions = z.infer<typeof ParseOptionsSchema>;

const OCR_MODE: Record<ParseOptions['ocr'], 'auto' | 'always' | 'never'> = {
  auto: 'auto',
  force: 'always',
  off: 'never',
};

export interface ParseRouteDeps {
  extractClient: ExtractClient;
  maxUploadBytes: number;
  userAgent: string;
  fetchImpl?: PinnedFetch | undefined;
  lookup?: Lookup | undefined;
  maxInFlight?: number | undefined;
  cache?: ParseCache<DocumentResult> | undefined;
  encryptionKey?: Buffer | undefined;
}

const DEFAULT_MAX_IN_FLIGHT = 8;
const MAX_REDIRECTS = 5;

export interface FileInput {
  bytes: Buffer;
  filename?: string | undefined;
  contentType?: string | undefined;
  sourceUrl?: string | undefined;
}

export interface ParseFailure {
  reason: FailureReason;
  detail: string;
  statusCode?: number | undefined;
}

export class RequestError extends Error {
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

function firstIssueMessage(error: z.ZodError): { message: string; field: string | undefined } {
  const first = error.issues[0];
  const field = first ? first.path.join('.') : undefined;
  return { message: first ? `${field}: ${first.message}` : 'invalid request body', field };
}


function parseFormats(values: FormDataEntryValue[]): string[] | undefined {
  const flat = values
    .filter((v): v is string => typeof v === 'string')
    .flatMap((v) => {
      const trimmed = v.trim();
      if (trimmed.startsWith('[')) {
        try {
          const arr = JSON.parse(trimmed) as unknown;
          return Array.isArray(arr) ? arr.map(String) : [trimmed];
        } catch {
          return [trimmed];
        }
      }
      return trimmed.split(',');
    })
    .map((v) => v.trim())
    .filter(Boolean);
  return flat.length > 0 ? flat : undefined;
}

export async function readMultipart(
  raw: Buffer,
  contentType: string,
): Promise<{ file: FileInput; options: unknown }> {
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

  const bytes = Buffer.from(await entry.arrayBuffer());
  const options: Record<string, unknown> = {};

  const formats = parseFormats(form.getAll('formats'));
  if (formats) options['formats'] = formats;

  for (const key of ['ocr', 'tables'] as const) {
    const value = form.get(key);
    if (typeof value === 'string' && value.trim()) options[key] = value.trim();
  }

  for (const key of ['maxPages', 'timeout'] as const) {
    const value = form.get(key);
    if (typeof value === 'string' && value.trim()) {
      const n = Number(value);
      options[key] = Number.isFinite(n) ? n : value;
    }
  }

  const jsonOptions = form.get('jsonOptions');
  if (typeof jsonOptions === 'string' && jsonOptions.trim()) {
    try {
      options['jsonOptions'] = JSON.parse(jsonOptions) as unknown;
    } catch {
      throw invalid('`jsonOptions` must be a JSON object encoded as a string.', 'jsonOptions');
    }
  }

  return {
    file: {
      bytes,
      filename: entry.name || undefined,
      contentType: entry.type || undefined,
    },
    options,
  };
}


function filenameFromUrl(url: string): string | undefined {
  try {
    const path = new URL(url).pathname;
    const last = path.split('/').filter(Boolean).pop();
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
  const plain = /filename="?([^";]+)"?/.exec(header);
  return plain?.[1]?.trim() || undefined;
}

function classifyRemoteError(error: unknown): ParseFailure {
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

export async function fetchRemote(
  url: string,
  deps: {
    fetchImpl: PinnedFetch;
    lookup: Lookup;
    userAgent: string;
    timeoutMs: number;
    maxBytes: number;
    signal?: AbortSignal | undefined;
  },
): Promise<{ ok: true; file: FileInput } | { ok: false; failure: ParseFailure } | { ok: false; tooLarge: true }> {
  const deadline = Date.now() + deps.timeoutMs;
  let current = new URL(url);
  let response: Response;

  for (let hop = 0; ; hop += 1) {
    if (deps.signal?.aborted) {
      return { ok: false, failure: classifyRemoteError({ name: 'AbortError' }) };
    }
    await assertPublicUrl(current, deps.lookup);

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return { ok: false, failure: classifyRemoteError({ name: 'TimeoutError' }) };
    }

    try {
      const timeout = AbortSignal.timeout(remaining);
      response = await deps.fetchImpl(current.toString(), {
        redirect: 'manual',
        headers: {
          'user-agent': deps.userAgent,
          accept:
            'application/pdf, application/vnd.openxmlformats-officedocument.*, image/png, image/jpeg, */*;q=0.5',
        },
        signal: deps.signal ? AbortSignal.any([timeout, deps.signal]) : timeout,
      });
    } catch (error) {
      if (deps.signal?.aborted) {
        return { ok: false, failure: { reason: 'aborted', detail: 'the caller disconnected before the download finished' } };
      }
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
    try {
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
    } catch (error) {
      return { ok: false, failure: classifyRemoteError(error) };
    }
  }

  return {
    ok: true,
    file: {
      bytes: Buffer.concat(chunks),
      filename:
        filenameFromDisposition(response.headers.get('content-disposition')) ?? filenameFromUrl(current.toString()),
      contentType: response.headers.get('content-type') ?? undefined,
      sourceUrl: url,
    },
  };
}


function validateOptions(raw: unknown): ParseOptions {
  const parsed = ParseOptionsSchema.safeParse(raw);
  if (!parsed.success) {
    const { message, field } = firstIssueMessage(parsed.error);
    throw invalid(message, field);
  }
  return checkJsonOptions(parsed.data);
}

function checkJsonOptions(options: ParseOptions): ParseOptions {
  const wantsJson = options.formats.includes('json');
  const hasInstruction = Boolean(options.jsonOptions?.schema || options.jsonOptions?.prompt);

  if (wantsJson && !hasInstruction) {
    throw invalid('The `json` format requires `jsonOptions` with a `schema` or a `prompt`.', 'formats');
  }

  if (options.jsonOptions?.schema) {
    try {
      rejectFabricationKeywords(options.jsonOptions.schema, 'jsonOptions.schema');
    } catch (error) {
      const e = error as Error & { field?: string; hint?: string };
      throw new RequestError(400, 'invalid_schema', e.hint ? `${e.message} ${e.hint}` : e.message, e.field);
    }
  }

  return options;
}

function sendRequestError(reply: FastifyReply, request: FastifyRequest, error: RequestError): FastifyReply {
  return reply.code(error.statusCode).send({
    error: error.code,
    message: error.message,
    field: error.field,
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

function documentFailure(error: unknown): ParseFailure | RequestError {
  if (error instanceof ExtractHttpError) {
    if (error.status === 415) return { reason: 'unsupported_type', detail: error.detail };
    if (error.status === 422) return { reason: 'unsupported_type', detail: error.detail };
    if (error.status === 400) return invalid(error.detail);
    return { reason: 'service_unavailable', detail: error.detail || `helix-extract answered HTTP ${error.status}` };
  }
  const err = error as { name?: string; message?: string };
  if (err.name === 'AbortError') {
    return { reason: 'aborted', detail: 'the caller disconnected before parsing finished' };
  }
  if (err.name === 'TimeoutError') {
    return { reason: 'timeout', detail: 'helix-extract did not finish parsing in time' };
  }
  return { reason: 'service_unavailable', detail: err.message ?? 'helix-extract is unreachable' };
}

function saturatedBody(request: FastifyRequest, maxInFlight: number): Record<string, unknown> {
  return {
    error: 'service_unavailable',
    message: `This instance is already parsing ${maxInFlight} documents (HELIX_PARSE_MAX_INFLIGHT). Retry shortly.`,
    requestId: request.id,
  };
}

export async function registerParse(app: FastifyInstance, deps: ParseRouteDeps): Promise<void> {
  const lookup = deps.lookup ?? defaultLookup;
  const fetchImpl = deps.fetchImpl ?? createPinnedFetch({ lookup });
  const cache = deps.cache ?? new ParseCache<DocumentResult>();
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
      if (status === 413) {
        return reply.code(413).send(tooLargeBody(request, deps.maxUploadBytes));
      }
      if (status !== undefined && status >= 400 && status < 500) {
        const message =
          status === 415
            ? 'Send a JSON body with `url`, or a multipart/form-data body with a `file` part.'
            : fastifyMessage ?? 'The request body could not be parsed.';
        return reply.code(status).send({
          error: 'invalid_request',
          message,
          requestId: request.id,
        });
      }
      request.log.error({ error }, 'parse route failed');
      return reply.code(500).send({
        error: 'internal_error',
        message: 'The parse request failed unexpectedly.',
        requestId: request.id,
      });
    });

    scope.post('/parse', { bodyLimit }, async (request, reply) => {
      if (inFlight >= maxInFlight) {
        void reply.header('retry-after', '1');
        return reply.code(503).send(saturatedBody(request, maxInFlight));
      }
      inFlight += 1;
      try {
        return await handleParse(request, reply);
      } finally {
        inFlight -= 1;
      }
    });

    async function handleParse(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
      const started = Date.now();
      const contentType = request.headers['content-type'] ?? '';
      const isMultipart = contentType.toLowerCase().startsWith('multipart/form-data');

      const controller = new AbortController();
      const onClose = (): void => {
        if (!reply.raw.writableFinished) controller.abort();
      };
      reply.raw.on('close', onClose);

      try {
      let file: FileInput;
      let options: ParseOptions;

      try {
        if (isMultipart) {
          const raw = request.body;
          if (!Buffer.isBuffer(raw)) throw invalid('multipart body was empty.', 'file');
          const read = await readMultipart(raw, contentType);
          (request as { body: unknown }).body = undefined;
          file = read.file;
          options = validateOptions(read.options);
        } else {
          const parsed = ParseJsonRequestSchema.safeParse(request.body);
          if (!parsed.success) {
            const { message, field } = firstIssueMessage(parsed.error);
            const missingUrl = parsed.error.issues.some(
              (i) => i.path[0] === 'url' && i.code === 'invalid_type',
            );
            throw invalid(
              missingUrl ? 'Send a `url` in a JSON body, or a `file` part in a multipart body.' : message,
              missingUrl ? 'url' : field,
            );
          }
          const { url, ...rest } = parsed.data;
          options = checkJsonOptions(rest);

          const fetched = await fetchRemote(url, {
            fetchImpl,
            lookup,
            userAgent: deps.userAgent,
            timeoutMs: options.timeout,
            maxBytes: deps.maxUploadBytes,
            signal: controller.signal,
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

      const classified = classifyFile({
        bytes: file.bytes,
        contentType: file.contentType,
        filename: file.filename,
      });
      if (!classified.fileType) {
        return reply.code(200).send({
          success: false,
          failure: {
            url: file.sourceUrl,
            reason: 'unsupported_type',
            detail: classified.reason,
            detectedBy: [],
            escalationAvailable: false,
          },
        });
      }
      const fileType: FileType = classified.fileType;

      const hash = contentHash(file.bytes);
      const cacheKey = ParseCache.key(hash, {
        fileType,
        ocr: options.ocr,
        maxPages: options.maxPages,
        tables: options.tables,
      });

      let parsed = cache.get(cacheKey);
      const fromCache = parsed !== undefined;

      if (!parsed) {
        try {
          parsed = await deps.extractClient.document({
            data: file.bytes,
            contentType: CONTENT_TYPE_FOR[fileType],
            ocr: OCR_MODE[options.ocr],
            maxPages: options.maxPages,
            tables: options.tables,
            signal: controller.signal,
          });
        } catch (error) {
          const outcome = documentFailure(error);
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
        cache.set(cacheKey, parsed);
      }

      const warnings: string[] = [];
      if (parsed.needsOcr && !parsed.ocrApplied) {
        const layer = parsed.markdown.trim()
          ? 'The text layer is sparse, so this text may be incomplete,'
          : 'The text layer is missing or unreadable';
        warnings.push(
          options.ocr === 'off'
            ? `${layer} and OCR was not applied (\`ocr: off\`).`
            : `${layer} and no OCR parser is installed on this instance.`,
        );
      }
      if (parsed.suspectedGarbledText && !parsed.ocrApplied) {
        warnings.push('The extracted text looks garbled (broken font encoding); consider `ocr: force`.');
      }

      const data: Record<string, unknown> = {};
      if (options.formats.includes('markdown')) data['markdown'] = parsed.markdown;

      if (options.formats.includes('json') && options.jsonOptions) {
        try {
          const apiKeyId = request.apiKey?.id;
          const resolved =
            apiKeyId && deps.encryptionKey ? await resolveProviderKeys(apiKeyId, deps.encryptionKey) : {};
          const { providerKeys, providerModels, providerBaseUrls } = toClientKeys(resolved);

          const structured = await deps.extractClient.structured({
            content: parsed.markdown,
            schema: options.jsonOptions.schema,
            prompt: options.jsonOptions.prompt,
            model: options.jsonOptions.model,
            providerKeys,
            providerModels,
            providerBaseUrls,
            signal: controller.signal,
          });
          data['json'] = structured.data;
          data['usage'] = {
            tokens: { input: structured.tokensInput, output: structured.tokensOutput },
            model: structured.modelUsed,
          };
        } catch (error) {
          if (error instanceof ExtractHttpError && error.status === 400) {
            return sendRequestError(reply, request, new RequestError(400, 'invalid_schema', error.detail));
          }
          const detail =
            error instanceof ExtractHttpError ? error.detail : error instanceof Error ? error.message : String(error);
          warnings.push(`json: structured extraction failed: ${detail}`);
        }
      }

      data['metadata'] = {
        filename: file.filename,
        pageCount: parsed.pages,
        fileType,
        ocrUsed: parsed.ocrApplied,
        needsOcr: parsed.needsOcr,
        suspectedGarbledText: parsed.suspectedGarbledText,
        parser: parsed.parserUsed,
        sizeBytes: file.bytes.length,
        contentHash: hash,
        sourceUrl: file.sourceUrl,
        fetchedAt: new Date().toISOString(),
        timingMs: Date.now() - started,
        fromCache,
      };

      return reply.code(200).send({
        success: true,
        data,
        ...(warnings.length > 0 ? { warnings } : {}),
      });
      } finally {
        reply.raw.off('close', onClose);
      }
    }
  });
}
