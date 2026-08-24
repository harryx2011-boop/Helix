import type { Log } from '../core/logger.js';

/**
 * Client for helix-extract.
 *
 * Extraction, document parsing, structured output and embeddings all live in the
 * Python service, one internal HTTP hop away.
 */

export interface ExtractOptions {
  html: string;
  url: string;
  extractor?: 'trafilatura' | 'readability' | 'auto' | undefined;
  onlyMainContent?: boolean | undefined;
  includeSelectors?: string[] | undefined;
  excludeSelectors?: string[] | undefined;
}

export interface ExtractResult {
  markdown: string;
  text: string;
  title?: string | undefined;
  language?: string | undefined;
  links: string[];
  extractorUsed: string;
  /** SHA-256 of normalised content, for change detection and incremental crawl. */
  contentHash: string;
}

export interface DocumentOptions {
  data: Buffer;
  contentType: string;
  ocr?: 'auto' | 'never' | 'always' | undefined;
  maxPages?: number | undefined;
  tables?: 'auto' | 'high-fidelity' | undefined;
  timeoutMs?: number | undefined;
}

export interface DocumentResult {
  markdown: string;
  pages: number;
  needsOcr: boolean;
  ocrApplied: boolean;
  suspectedGarbledText: boolean;
  parserUsed: string;
}

export interface StructuredOptions {
  content: string;
  schema?: Record<string, unknown> | undefined;
  prompt?: string | undefined;
  /** Per-request provider override; the key must be configured on the instance. */
  provider?: string | undefined;
  model?: string | undefined;
  includeSources?: boolean | undefined;
  timeoutMs?: number | undefined;
}

export interface StructuredResult {
  data: Record<string, unknown>;
  sources: Record<string, unknown>[];
  tokensInput: number;
  tokensOutput: number;
  modelUsed: string;
  /** How much of the page reached the model, so a missing field can be told apart from a trimmed-away one. */
  blocksKept: number;
  blocksTotal: number;
}

export interface ChunkOptions {
  text: string;
  url: string;
  strategy?: 'semantic' | 'heading' | 'fixed' | undefined;
  maxTokens?: number | undefined;
  overlap?: number | undefined;
}

export interface Chunk {
  text: string;
  anchor: string;
  tokens: number;
  headingPath: string[];
  index: number;
}

/** helix-extract answered with a status the caller can act on (400 schema, 415 type, 503 provider). */
export class ExtractHttpError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(`helix-extract returned HTTP ${status}: ${detail.slice(0, 200)}`);
    this.name = 'ExtractHttpError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * A structured-extraction failure. It carries the upstream status like any
 * other, plus the request field at fault when helix-extract named one, so a
 * route can tell a schema problem (the caller's) from missing credentials (the
 * operator's). It extends ExtractHttpError so callers that only care about the
 * status still catch it.
 */
export class StructuredError extends ExtractHttpError {
  /** The request field at fault, when helix-extract named one. */
  readonly field: string | undefined;

  constructor(status: number, message: string, field?: string) {
    super(status, message);
    this.name = 'StructuredError';
    // The upstream message is the whole story here; the generic prefix is not.
    this.message = message;
    this.field = field;
  }
}

async function detailOf(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    const body = JSON.parse(text) as { detail?: unknown };
    if (typeof body.detail === 'string') return body.detail;
  } catch {
    // Not JSON; the raw text is the detail.
  }
  return text;
}

export class ExtractClient {
  readonly #baseUrl: string;
  readonly #logger: Log | undefined;

  constructor(baseUrl: string, logger?: Log) {
    this.#baseUrl = baseUrl.replace(/\/$/, '');
    this.#logger = logger;
  }

  async extract(options: ExtractOptions): Promise<ExtractResult> {
    const response = await fetch(`${this.#baseUrl}/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        html: options.html,
        url: options.url,
        extractor: options.extractor ?? 'trafilatura',
        only_main_content: options.onlyMainContent ?? true,
        include_selectors: options.includeSelectors ?? [],
        exclude_selectors: options.excludeSelectors ?? [],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.#logger?.warn({ status: response.status, url: options.url }, 'helix-extract /extract failed');
      throw new Error(`helix-extract returned HTTP ${response.status}: ${detail.slice(0, 200)}`);
    }

    const body = (await response.json()) as {
      markdown: string;
      text: string;
      title?: string;
      language?: string;
      links?: string[];
      extractor_used: string;
      content_hash: string;
    };

    return {
      markdown: body.markdown,
      text: body.text,
      title: body.title,
      language: body.language,
      links: body.links ?? [],
      extractorUsed: body.extractor_used,
      contentHash: body.content_hash,
    };
  }

  /** Parse a document's bytes. The service classifies before parsing, so OCR only runs when the text layer is missing (or forced). */
  async document(options: DocumentOptions): Promise<DocumentResult> {
    const query = new URLSearchParams({ ocr: options.ocr ?? 'auto', tables: options.tables ?? 'auto' });
    if (options.maxPages !== undefined) query.set('max_pages', String(options.maxPages));

    // The bytes travel as the raw body: base64 inside JSON would hold two more
    // copies of a 25 MB upload for the whole parse.
    const response = await fetch(`${this.#baseUrl}/document?${query.toString()}`, {
      method: 'POST',
      headers: { 'content-type': options.contentType },
      body: options.data as Uint8Array<ArrayBuffer>,
      // OCR over a long scan is the slowest thing Helix does; the default is generous on purpose.
      signal: AbortSignal.timeout(options.timeoutMs ?? 300_000),
    });

    if (!response.ok) {
      throw new ExtractHttpError(response.status, await detailOf(response));
    }

    const body = (await response.json()) as {
      markdown: string;
      pages: number;
      needs_ocr: boolean;
      ocr_applied: boolean;
      suspected_garbled_text: boolean;
      parser_used: string;
    };

    return {
      markdown: body.markdown,
      pages: body.pages,
      needsOcr: body.needs_ocr,
      ocrApplied: body.ocr_applied,
      suspectedGarbledText: body.suspected_garbled_text,
      parserUsed: body.parser_used,
    };
  }

  /** Schema- or prompt-driven extraction over already-parsed content, using the operator's configured model. */
  async structured(options: StructuredOptions): Promise<StructuredResult> {
    const response = await fetch(`${this.#baseUrl}/structured`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: options.content,
        schema: options.schema ?? {},
        prompt: options.prompt ?? null,
        provider: options.provider ?? null,
        model: options.model ?? null,
        include_sources: options.includeSources ?? false,
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
    });

    if (!response.ok) {
      const detail = await detailOf(response);
      let message = detail.slice(0, 500);
      let field: string | undefined;
      try {
        const parsed = JSON.parse(detail) as { detail?: unknown };
        if (parsed.detail && typeof parsed.detail === 'object') {
          const structured = parsed.detail as { message?: unknown; field?: unknown };
          if (typeof structured.message === 'string') message = structured.message;
          if (typeof structured.field === 'string') field = structured.field;
        }
      } catch {
        // Not JSON; `detailOf` already returned the best text available.
      }
      this.#logger?.warn({ status: response.status }, 'helix-extract /structured failed');
      throw new StructuredError(response.status, message || `helix-extract returned HTTP ${response.status}`, field);
    }

    const body = (await response.json()) as {
      data: Record<string, unknown>;
      sources?: Record<string, unknown>[];
      tokens_input: number;
      tokens_output: number;
      model_used: string;
      blocks_kept?: number;
      blocks_total?: number;
    };

    return {
      data: body.data,
      sources: body.sources ?? [],
      tokensInput: body.tokens_input,
      tokensOutput: body.tokens_output,
      modelUsed: body.model_used,
      blocksKept: body.blocks_kept ?? 0,
      blocksTotal: body.blocks_total ?? 0,
    };
  }

  async chunk(options: ChunkOptions): Promise<Chunk[]> {
    const response = await fetch(`${this.#baseUrl}/chunk`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: options.text,
        url: options.url,
        strategy: options.strategy ?? 'semantic',
        max_tokens: options.maxTokens ?? 512,
        overlap: options.overlap ?? 64,
        embed: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.#logger?.warn({ status: response.status, url: options.url }, 'helix-extract /chunk failed');
      throw new Error(`helix-extract returned HTTP ${response.status}: ${detail.slice(0, 200)}`);
    }

    const body = (await response.json()) as {
      chunks: { text: string; anchor: string; tokens: number; heading_path?: string[]; index?: number }[];
    };

    return body.chunks.map((c) => ({
      text: c.text,
      anchor: c.anchor,
      tokens: c.tokens,
      headingPath: c.heading_path ?? [],
      index: c.index ?? 0,
    }));
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.#baseUrl}/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      return response.ok;
    } catch (err) {
      this.#logger?.debug({ err }, 'helix-extract health check failed');
      return false;
    }
  }
}
