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

export interface StructuredOptions {
  content: string;
  schema: Record<string, unknown>;
  prompt?: string | undefined;
  model?: string | undefined;
}

export interface StructuredResult {
  data: Record<string, unknown>;
  tokensInput: number;
  tokensOutput: number;
  modelUsed: string;
  blocksKept: number;
  blocksTotal: number;
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

  /** Structured extraction with the operator's configured model (BYOK). */
  async structured(options: StructuredOptions): Promise<StructuredResult> {
    const response = await fetch(`${this.#baseUrl}/structured`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: options.content,
        schema: options.schema,
        prompt: options.prompt ?? null,
        model: options.model ?? null,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.#logger?.warn({ status: response.status, model: options.model }, 'helix-extract structured call failed');
      throw new Error(`helix-extract returned HTTP ${response.status}: ${detail.slice(0, 200)}`);
    }

    const body = (await response.json()) as {
      data: Record<string, unknown>;
      tokens_input: number;
      tokens_output: number;
      model_used: string;
      blocks_kept?: number;
      blocks_total?: number;
    };

    return {
      data: body.data,
      tokensInput: body.tokens_input,
      tokensOutput: body.tokens_output,
      modelUsed: body.model_used,
      blocksKept: body.blocks_kept ?? 0,
      blocksTotal: body.blocks_total ?? 0,
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
