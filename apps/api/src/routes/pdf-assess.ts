import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ExtractHttpError, type ExtractClient } from '../extract/client.js';
import { classifyFile } from '../parse/file-type.js';
import { fetchRemote, readMultipart, RequestError, type FileInput } from './parse.js';
import { defaultLookup, HostNotAllowedError, type Lookup } from '../parse/remote.js';

/**
 * Whether a PDF needs OCR, without converting it.
 *
 * Wraps helix-extract's `/assess` — the same classifier `/parse` runs before
 * choosing a parser — so a caller can decide whether a full parse is worth
 * paying for, or route straight to OCR, before spending either.
 */

const PdfAssessJsonRequestSchema = z.object({
  url: z.string().url(),
  timeout: z.number().int().min(1_000).max(300_000).default(30_000),
});

export interface PdfAssessRouteDeps {
  extractClient: ExtractClient;
  maxUploadBytes: number;
  userAgent: string;
  fetchImpl?: typeof fetch | undefined;
  lookup?: Lookup | undefined;
}

const MAX_UPLOAD_HEADROOM = 64 * 1024;

function invalid(message: string, field?: string): RequestError {
  return new RequestError(400, 'invalid_request', message, field);
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

export async function registerPdfAssess(app: FastifyInstance, deps: PdfAssessRouteDeps): Promise<void> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const lookup = deps.lookup ?? defaultLookup;
  const bodyLimit = deps.maxUploadBytes + MAX_UPLOAD_HEADROOM;

  await app.register(async (scope) => {
    scope.addContentTypeParser(
      'multipart/form-data',
      { parseAs: 'buffer', bodyLimit },
      (_request, body, done) => done(null, body),
    );

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
        return reply.code(status).send({ error: 'invalid_request', message, requestId: request.id });
      }
      request.log.error({ error }, 'pdf-assess route failed');
      return reply.code(500).send({
        error: 'internal_error',
        message: 'The assessment request failed unexpectedly.',
        requestId: request.id,
      });
    });

    scope.post('/pdf-assess', { bodyLimit }, async (request, reply) => {
      const contentType = request.headers['content-type'] ?? '';
      const isMultipart = contentType.toLowerCase().startsWith('multipart/form-data');

      let file: FileInput;

      try {
        if (isMultipart) {
          const raw = request.body;
          if (!Buffer.isBuffer(raw)) throw invalid('multipart body was empty.', 'file');
          const read = await readMultipart(raw, contentType);
          (request as { body: unknown }).body = undefined;
          file = read.file;
        } else {
          const parsed = PdfAssessJsonRequestSchema.safeParse(request.body);
          if (!parsed.success) {
            const first = parsed.error.issues[0];
            const missingUrl = parsed.error.issues.some((i) => i.path[0] === 'url' && i.code === 'invalid_type');
            throw invalid(
              missingUrl
                ? 'Send a `url` in a JSON body, or a `file` part in a multipart body.'
                : first
                  ? `${first.path.join('.')}: ${first.message}`
                  : 'invalid request body',
              missingUrl ? 'url' : first?.path.join('.'),
            );
          }

          const fetched = await fetchRemote(parsed.data.url, {
            fetchImpl,
            lookup,
            userAgent: deps.userAgent,
            timeoutMs: parsed.data.timeout,
            maxBytes: deps.maxUploadBytes,
          });
          if (!fetched.ok) {
            if ('tooLarge' in fetched) return reply.code(413).send(tooLargeBody(request, deps.maxUploadBytes));
            return reply.code(200).send({
              success: false,
              failure: { url: parsed.data.url, ...fetched.failure, detectedBy: [], escalationAvailable: false },
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
          failure: { url: file.sourceUrl, reason: 'empty', detail: 'the file has no bytes', detectedBy: [], escalationAvailable: false },
        });
      }

      const classified = classifyFile({ bytes: file.bytes, contentType: file.contentType, filename: file.filename });
      if (classified.fileType !== 'pdf') {
        return reply.code(200).send({
          success: false,
          failure: {
            url: file.sourceUrl,
            reason: 'unsupported_type',
            detail: classified.fileType
              ? `assessment is only defined for PDFs, not ${classified.fileType}`
              : classified.reason,
            detectedBy: [],
            escalationAvailable: false,
          },
        });
      }
      try {
        const assessment = await deps.extractClient.assessPdf({ data: file.bytes });
        return reply.code(200).send({
          success: true,
          data: {
            pageCount: assessment.pages,
            charsExtracted: assessment.charsExtracted,
            needsOcr: assessment.needsOcr,
            suspectedGarbledText: assessment.suspectedGarbledText,
            reason: assessment.reason,
            metadata: {
              filename: file.filename,
              sizeBytes: file.bytes.length,
              sourceUrl: file.sourceUrl,
            },
          },
        });
      } catch (error) {
        const detail =
          error instanceof ExtractHttpError ? error.detail : error instanceof Error ? error.message : String(error);
        return reply.code(200).send({
          success: false,
          failure: {
            url: file.sourceUrl,
            reason: 'service_unavailable',
            detail,
            detectedBy: [],
            escalationAvailable: true,
          },
        });
      }
    });
  });
}
