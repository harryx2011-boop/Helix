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
  /** Per-request provider override; the key must be configured on the instance. */
  provider?: string | undefined;
  model?: string | undefined;
  includeSources?: boolean | undefined;
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

/**
 * A structured-extraction failure with the upstream status attached, so the
 * route can tell a schema problem (the caller's) from missing credentials (the
 * operator's).
 */
export class StructuredError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'StructuredError';
    this.status = status;
  }
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

  async structured(options: StructuredOptions): Promise<StructuredResult> {
    const response = await fetch(`${this.#baseUrl}/structured`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: options.content,
        schema: options.schema,
        prompt: options.prompt ?? null,
        provider: options.provider ?? null,
        model: options.model ?? null,
        include_sources: options.includeSources ?? false,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      let message = detail.slice(0, 500);
      try {
        const parsed = JSON.parse(detail) as { detail?: unknown };
        if (typeof parsed.detail === 'string') message = parsed.detail;
      } catch {
        // Not JSON; the raw text is the best detail available.
      }
      throw new StructuredError(response.status, message || `helix-extract returned HTTP ${response.status}`);
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
    } catch {
      return false;
    }
  }
}
