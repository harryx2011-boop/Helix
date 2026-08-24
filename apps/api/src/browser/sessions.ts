import { randomBytes } from 'node:crypto';
import type { Page } from 'playwright';
import type { Log } from '../core/logger.js';
import type { LeaseOptions, PageLease } from './pool.js';

/**
 * Interact session registry.
 *
 * A session is one leased page that outlives the request that opened it. With
 * no per-minute billing to discourage a caller from holding a browser forever,
 * every bound is operator-configured and enforced here: a cap on simultaneous
 * sessions, an idle timeout, and a hard timeout that fires regardless of
 * activity. The registry owns closing; routes only ask.
 *
 * Sessions are scoped to the API key that opened them. Another key asking for
 * the id gets the same answer as asking for one that never existed.
 */

export interface SessionRegistryOptions {
  lease: (options: LeaseOptions) => Promise<PageLease>;
  maxSessions: number;
  idleTimeoutMs: number;
  hardTimeoutMs: number;
  logger?: Log | undefined;
}

export type CloseReason = 'closed' | 'idle' | 'expired' | 'shutdown';

export interface Session {
  id: string;
  apiKeyId: string;
  /** Bearer for the live view; the viewer page cannot send an API key header. */
  viewToken: string;
  page: Page;
  createdAt: number;
  lastActivityAt: number;
  /** Hard deadline: the session closes at this time whatever happens. */
  expiresAt: number;
  busy: boolean;
  /** Runs when the session closes, from any cause. Returns an unsubscribe. */
  onClose(listener: (reason: CloseReason) => void): () => void;
}

interface SessionRecord extends Session {
  lease: PageLease;
  listeners: Set<(reason: CloseReason) => void>;
  closing: boolean;
}

export class SessionLimitError extends Error {
  readonly limit: number;
  constructor(limit: number) {
    super(`Session limit reached (${limit} open). Close a session or raise HELIX_INTERACT_MAX_SESSIONS.`);
    this.name = 'SessionLimitError';
    this.limit = limit;
  }
}

export class SessionBusyError extends Error {
  constructor(id: string) {
    super(`Session ${id} is running another request. Wait for it to return before sending more actions.`);
    this.name = 'SessionBusyError';
  }
}

export class SessionRegistry {
  readonly #options: SessionRegistryOptions;
  readonly #logger: Log | undefined;
  readonly #sessions = new Map<string, SessionRecord>();
  /** Opens that hold a slot while their lease is still being created. */
  #pending = 0;
  #sweeper: NodeJS.Timeout | undefined;

  constructor(options: SessionRegistryOptions) {
    this.#options = options;
    this.#logger = options.logger;
  }

  get idleTimeoutMs(): number {
    return this.#options.idleTimeoutMs;
  }

  get hardTimeoutMs(): number {
    return this.#options.hardTimeoutMs;
  }

  get maxSessions(): number {
    return this.#options.maxSessions;
  }

  count(): number {
    return this.#sessions.size;
  }

  async open(apiKeyId: string, options: LeaseOptions = {}): Promise<Session> {
    // Expired sessions still on the books must not count against the caller.
    await this.sweep();

    // The slot is taken before the lease is awaited: a burst of opens that all
    // read the size first would each pass the check and together overshoot it.
    if (this.#sessions.size + this.#pending >= this.#options.maxSessions) {
      throw new SessionLimitError(this.#options.maxSessions);
    }
    this.#pending++;

    let lease: PageLease;
    try {
      lease = await this.#options.lease(options);
    } finally {
      this.#pending--;
    }
    const now = Date.now();
    const listeners = new Set<(reason: CloseReason) => void>();

    const record: SessionRecord = {
      id: `sess_${randomBytes(8).toString('hex')}`,
      apiKeyId,
      viewToken: randomBytes(24).toString('hex'),
      page: lease.page,
      createdAt: now,
      lastActivityAt: now,
      expiresAt: now + this.#options.hardTimeoutMs,
      busy: false,
      lease,
      listeners,
      closing: false,
      onClose: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };

    this.#sessions.set(record.id, record);
    this.#logger?.info({ sessionId: record.id, open: this.#sessions.size }, 'interact session opened');
    return record;
  }

  get(id: string, apiKeyId: string): Session | undefined {
    const record = this.#sessions.get(id);
    if (!record || record.closing || record.apiKeyId !== apiKeyId) return undefined;
    if (this.#deadline(record) <= Date.now()) return undefined;
    return record;
  }

  /** Live-view lookup: the token stands in for the API key. */
  getByViewToken(id: string, token: string): Session | undefined {
    const record = this.#sessions.get(id);
    if (!record || record.closing || token.length === 0 || record.viewToken !== token) return undefined;
    return record;
  }

  /**
   * Hold the session for one request. Two callers sending actions to the same
   * page at once would interleave clicks; the second is told to wait instead.
   */
  acquire(session: Session): () => void {
    const record = this.#sessions.get(session.id);
    if (!record || record.closing || record.busy) throw new SessionBusyError(session.id);
    record.busy = true;
    record.lastActivityAt = Date.now();
    return () => {
      record.busy = false;
      record.lastActivityAt = Date.now();
    };
  }

  /** When the session closes if nothing else happens. */
  idleDeadline(session: Session): number {
    return Math.min(session.lastActivityAt + this.#options.idleTimeoutMs, session.expiresAt);
  }

  async close(id: string, apiKeyId: string): Promise<boolean> {
    const record = this.#sessions.get(id);
    if (!record || record.closing || record.apiKeyId !== apiKeyId) return false;
    await this.#closeRecord(record, 'closed');
    return true;
  }

  /** Close everything past its idle or hard deadline. */
  async sweep(): Promise<number> {
    const now = Date.now();
    let closed = 0;
    for (const record of [...this.#sessions.values()]) {
      if (record.closing) continue;
      if (record.expiresAt <= now) {
        await this.#closeRecord(record, 'expired');
        closed++;
      } else if (!record.busy && record.lastActivityAt + this.#options.idleTimeoutMs <= now) {
        await this.#closeRecord(record, 'idle');
        closed++;
      }
    }
    return closed;
  }

  startSweeper(intervalMs = 5_000): void {
    if (this.#sweeper) return;
    this.#sweeper = setInterval(() => {
      void this.sweep().catch((error) => this.#logger?.warn({ error }, 'session sweep failed'));
    }, intervalMs);
    this.#sweeper.unref();
  }

  async closeAll(): Promise<void> {
    if (this.#sweeper) {
      clearInterval(this.#sweeper);
      this.#sweeper = undefined;
    }
    await Promise.all([...this.#sessions.values()].map((record) => this.#closeRecord(record, 'shutdown')));
  }

  stats(): { open: number; max: number } {
    return { open: this.#sessions.size, max: this.#options.maxSessions };
  }

  #deadline(record: SessionRecord): number {
    // A busy session cannot go idle: the running request is the activity.
    if (record.busy) return record.expiresAt;
    return Math.min(record.lastActivityAt + this.#options.idleTimeoutMs, record.expiresAt);
  }

  async #closeRecord(record: SessionRecord, reason: CloseReason): Promise<void> {
    if (record.closing) return;
    record.closing = true;
    this.#sessions.delete(record.id);
    for (const listener of record.listeners) {
      try {
        listener(reason);
      } catch {
        // A viewer that has already gone away must not block the close.
      }
    }
    record.listeners.clear();
    await record.lease.close().catch((error) => {
      this.#logger?.warn({ error, sessionId: record.id }, 'session lease close failed');
    });
    this.#logger?.info({ sessionId: record.id, reason, open: this.#sessions.size }, 'interact session closed');
  }
}
