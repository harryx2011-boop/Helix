import { createHash } from 'node:crypto';

/**
 * Parsed-output cache keyed by content hash, not URL (spec §6).
 *
 * The same invoice uploaded twice, or the same PDF fetched from two mirrors,
 * parses once. Keyed on the bytes plus the options that change the output, so
 * an `ocr: force` re-run is never served a text-layer result. Bounded and
 * in-process: a self-hosted default, not a shared tier.
 */

export function contentHash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export class ParseCache<T> {
  readonly #entries = new Map<string, T>();
  readonly #max: number;

  constructor(max = 64) {
    this.#max = max;
  }

  static key(hash: string, options: Record<string, string | number | undefined>): string {
    const parts = Object.entries(options)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${String(v)}`);
    return `${hash}|${parts.join('&')}`;
  }

  get(key: string): T | undefined {
    const value = this.#entries.get(key);
    if (value === undefined) return undefined;
    // Re-insert so the map's iteration order doubles as recency.
    this.#entries.delete(key);
    this.#entries.set(key, value);
    return value;
  }

  set(key: string, value: T): void {
    if (this.#entries.has(key)) this.#entries.delete(key);
    this.#entries.set(key, value);
    if (this.#entries.size > this.#max) {
      const oldest = this.#entries.keys().next().value;
      if (oldest !== undefined) this.#entries.delete(oldest);
    }
  }

  get size(): number {
    return this.#entries.size;
  }
}
