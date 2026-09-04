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
 * COHERENCE IS THE INVARIANT. `apps/fetch/src/profile.rs` refuses to start on a
 * profile whose user-agent contradicts its HTTP/2 settings, because detection
 * needs only one layer to disagree. The same rule applies one level up: a
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
  /**
   * Proxy URLs this pool may hand out, already resolved from instance config.
   * Empty means direct, which is a real configuration and not a degraded one.
   */
  proxyUrls?: string[] | undefined;
  /** Profile ids to draw identities from. Defaults to everything installed. */
  profileIds?: string[] | undefined;
  /** Live sessions held at once. */
  maxSessions?: number | undefined;
  /** Blocks one session absorbs before it is retired. */
  maxBlocks?: number | undefined;
  /** Requests one session serves before it is retired regardless of health. */
  maxRequests?: number | undefined;
  logger?: Log | undefined;
}

export interface Session {
  readonly id: string;
  /** Pinned for this session's whole life. Re-picking it would break coherence. */
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
  /** The classifier's verdict. A challenge served as 200 still counts. */
  blocked?: boolean | undefined;
  statusCode?: number | undefined;
  /** Cookies the response set, merged into this session's jar. */
  cookies?: Record<string, string> | undefined;
}

const DEFAULTS = {
  maxSessions: 8,
  /**
   * Two, not one. A single block is often the page rather than the identity — a
   * URL behind a login wall retiring an otherwise healthy session would churn
   * the whole pool on a site with a handful of protected pages.
   */
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

    // `undefined` is a real entry, not an empty list: it means "go direct",
    // which an instance with no proxy configured must still be able to do.
    this.#proxyUrls =
      options.proxyUrls && options.proxyUrls.length > 0 ? [...options.proxyUrls] : [undefined];

    const ids = options.profileIds ?? [...loadProfiles(this.#logger).keys()];
    this.#profileIds = ids.length > 0 ? [...ids] : [undefined];
  }

  /**
   * Take a session to use for one request.
   *
   * The least-used live session wins rather than a round robin. Spreading load
   * evenly is what keeps every identity under the rate that gets any one of
   * them noticed; a round robin does the same until a session is retired, then
   * quietly concentrates its replacement's traffic into a burst.
   */
  acquire(): Session {
    const live = this.#sessions.filter((s) => !s.retired);

    if (live.length < this.#maxSessions) return this.#create();

    let chosen = live[0] as Session;
    for (const session of live) {
      if (session.requests < chosen.requests) chosen = session;
    }
    return chosen;
  }

  /**
   * Report how a request on this session went.
   *
   * Returns whether the session was retired, so a caller can say so rather than
   * discovering later that the identity under it silently changed.
   */
  release(session: Session, outcome: SessionOutcome): { retired: boolean } {
    if (session.retired) return { retired: true };

    session.requests++;

    if (outcome.cookies) Object.assign(session.cookies, outcome.cookies);

    // 403 and 429 count alongside the classifier's verdict because both are the
    // host reacting to this identity in particular, which is exactly the
    // evidence that should cost a session its life.
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

    // An age ceiling as well as a health one. A session that has worked five
    // hundred times carries a request history that is itself a fingerprint, and
    // cookies whose age no longer matches a plausible visit.
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
    // The two cursors advance independently so a retired pairing is not
    // immediately recreated: a session blocked on (profile A, proxy X) would
    // otherwise be replaced by that same pair whenever the two lists happen to
    // be the same length.
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

  /**
   * The profile this session presents, if it is one this instance carries.
   *
   * Read through `getProfile` rather than held on the session, so an unverified
   * definition is logged on use the way it is everywhere else.
   */
  profileFor(session: Session, logger?: Log): BrowserProfile | undefined {
    return getProfile(session.profileId, logger ?? this.#logger);
  }

  /** The jar as a `Cookie` header, or undefined while the session has none. */
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
