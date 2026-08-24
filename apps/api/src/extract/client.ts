
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
  model?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface StructuredResult {
  data: Record<string, unknown>;
  tokensInput: number;
  tokensOutput: number;
  modelUsed: string;
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

  constructor(baseUrl: string) {
    this.#baseUrl = baseUrl.replace(/\/$/, '');
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
      this.#logger?.warn({ status: response.status, url: options.url }, 'helix-extract call failed');
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
        model: options.model ?? null,
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
    });

    if (!response.ok) {
      throw new ExtractHttpError(response.status, await detailOf(response));
    }

    const body = (await response.json()) as {
      data: Record<string, unknown>;
      tokens_input: number;
      tokens_output: number;
      model_used: string;
    };

    return {
      data: body.data,
      tokensInput: body.tokens_input,
      tokensOutput: body.tokens_output,
      modelUsed: body.model_used,
    };
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.#baseUrl}/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
