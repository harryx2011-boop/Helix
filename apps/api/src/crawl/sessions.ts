import { getProfile, loadProfiles, type BrowserProfile } from '../browser/profiles.js';
import type { Log } from '../core/logger.js';

/**
 * Session pool for crawling.
 *
 * A session is one coherent identity — a browser profile, a proxy exit and a
 * cookie jar — held together and reused while it keeps working, retired when it
 * starts earning blocks.
 *
 * Reuse is the whole point, and it is the opposite of what most rotation code
 * does. Rotating per request throws away the thing that makes a crawl look
 * ordinary: an identity that arrived, was accepted, kept its cookies and came
 * back. A site watching one exit fetch two hundred pages under two hundred
 * different fingerprints has been handed a stronger signal than the
 * fingerprints were hiding. So: rotate on failure, never on schedule.
 *
 * COHERENCE IS THE INVARIANT. helix-scrape sends only whole curl_cffi targets
 * and never a user-agent that contradicts the TLS and HTTP/2 settings under it
 * (an Edge name sends a Chrome identity and says so), because detection needs
 * only one layer to disagree. The same rule applies one level up: a
 * session pins ONE profile id for its whole life and hands that id to every
 * tier it is used on. It never re-picks a profile per request, and it never
 * composes an identity out of parts — a Chrome UA over a Firefox TLS
 * fingerprint is more detectable than no spoofing at all.
 *
 * Proxies come from the instance's existing configuration, resolved by the
 * caller (`HELIX_PROXY_URL`, or a request's `proxy` option). This class picks
 * among the URLs it is handed; it does not read the environment, and it is not
 * a second proxy system.
 */

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
