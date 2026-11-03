import { getProfile, loadProfiles, type BrowserProfile } from '../browser/profiles.js';
import type { Log } from '../core/logger.js';


export interface SessionPoolOptions {
  proxyUrls?: string[] | undefined;
  profileIds?: string[] | undefined;
  maxSessions?: number | undefined;
  maxBlocks?: number | undefined;
  maxRequests?: number | undefined;
  logger?: Log | undefined;
}

export interface Session {
  readonly id: string;
  readonly profileId: string | undefined;
  readonly proxyUrl: string | undefined;
  cookies: Record<string, string>;
  requests: number;
  blocks: number;
  successes: number;
  retired: boolean;
  createdAt: number;
}

export interface SessionOutcome {
  blocked?: boolean | undefined;
  statusCode?: number | undefined;
  cookies?: Record<string, string> | undefined;
}

const DEFAULTS = {
  maxSessions: 8,
  maxBlocks: 2,
  maxRequests: 500,
} as const;

let counter = 0;

export class SessionPool {
  readonly #maxSessions: number;
  readonly #maxBlocks: number;
  readonly #maxRequests: number;
  readonly #proxyUrls: (string | undefined)[];
  readonly #profileIds: (string | undefined)[];
  readonly #logger: Log | undefined;
  readonly #sessions: Session[] = [];
  #retiredCount = 0;
  #nextProxy = 0;
  #nextProfile = 0;

  constructor(options: SessionPoolOptions = {}) {
    this.#logger = options.logger;
    this.#maxSessions = Math.max(1, options.maxSessions ?? DEFAULTS.maxSessions);
    this.#maxBlocks = Math.max(1, options.maxBlocks ?? DEFAULTS.maxBlocks);
    this.#maxRequests = Math.max(1, options.maxRequests ?? DEFAULTS.maxRequests);

    this.#proxyUrls =
      options.proxyUrls && options.proxyUrls.length > 0 ? [...options.proxyUrls] : [undefined];

    const ids = options.profileIds ?? [...loadProfiles(this.#logger).keys()];
    this.#profileIds = ids.length > 0 ? [...ids] : [undefined];
  }

  acquire(): Session {
    const live = this.#sessions.filter((s) => !s.retired);

    if (live.length < this.#maxSessions) return this.#create();

    let chosen = live[0] as Session;
    for (const session of live) {
      if (session.requests < chosen.requests) chosen = session;
    }
    return chosen;
  }

  release(session: Session, outcome: SessionOutcome): { retired: boolean } {
    if (session.retired) return { retired: true };

    session.requests++;

    if (outcome.cookies) Object.assign(session.cookies, outcome.cookies);

    const hostile =
      outcome.blocked === true || outcome.statusCode === 403 || outcome.statusCode === 429;

    if (hostile) {
      session.blocks++;
      if (session.blocks >= this.#maxBlocks) {
        this.#retire(session, 'blocked');
        return { retired: true };
      }
      return { retired: false };
    }

    session.successes++;

    if (session.requests >= this.#maxRequests) {
      this.#retire(session, 'exhausted');
      return { retired: true };
    }

    return { retired: false };
  }

  #retire(session: Session, reason: 'blocked' | 'exhausted'): void {
    session.retired = true;
    this.#retiredCount++;
    this.#logger?.debug(
      { session: session.id, reason, requests: session.requests, blocks: session.blocks },
      'session retired',
    );

    const index = this.#sessions.indexOf(session);
    if (index >= 0) this.#sessions.splice(index, 1);
  }

  #create(): Session {
    const proxyUrl = this.#proxyUrls[this.#nextProxy % this.#proxyUrls.length];
    const profileId = this.#profileIds[this.#nextProfile % this.#profileIds.length];
    this.#nextProxy++;
    this.#nextProfile++;

    counter += 1;
    const session: Session = {
      id: `s${counter}`,
      profileId,
      proxyUrl,
      cookies: {},
      requests: 0,
      blocks: 0,
      successes: 0,
      retired: false,
      createdAt: Date.now(),
    };

    this.#sessions.push(session);
    return session;
  }

  profileFor(session: Session, logger?: Log): BrowserProfile | undefined {
    return getProfile(session.profileId, logger ?? this.#logger);
  }

  cookieHeader(session: Session): string | undefined {
    const pairs = Object.entries(session.cookies);
    if (pairs.length === 0) return undefined;
    return pairs.map(([name, value]) => `${name}=${value}`).join('; ');
  }

  get live(): number {
    return this.#sessions.filter((s) => !s.retired).length;
  }

  stats(): { live: number; retired: number; requests: number; blocks: number } {
    let requests = 0;
    let blocks = 0;
    for (const session of this.#sessions) {
      requests += session.requests;
      blocks += session.blocks;
    }
    return { live: this.live, retired: this.#retiredCount, requests, blocks };
  }
}
