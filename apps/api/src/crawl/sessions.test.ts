import { describe, expect, it } from 'vitest';
import { SessionPool } from './sessions.js';

const PROFILES = ['chrome-148', 'chrome-137'];

describe('SessionPool', () => {
  it('reuses a session that keeps working', () => {
    const pool = new SessionPool({ profileIds: PROFILES, maxSessions: 1 });

    const first = pool.acquire();
    pool.release(first, { statusCode: 200 });
    const second = pool.acquire();

    expect(second.id).toBe(first.id);
  });

  it('retires a session once it has earned enough blocks', () => {
    const pool = new SessionPool({ profileIds: PROFILES, maxSessions: 1, maxBlocks: 2 });

    const session = pool.acquire();
    expect(pool.release(session, { blocked: true }).retired).toBe(false);
    expect(pool.release(session, { blocked: true }).retired).toBe(true);

    expect(session.retired).toBe(true);
    expect(pool.acquire().id).not.toBe(session.id);
  });

  it('survives one block, because a block is often the page rather than the identity', () => {
    const pool = new SessionPool({ profileIds: PROFILES, maxSessions: 1, maxBlocks: 2 });

    const session = pool.acquire();
    pool.release(session, { blocked: true });

    expect(pool.acquire().id).toBe(session.id);
  });

  it('treats a challenge served as 200 as hostile', () => {
    const pool = new SessionPool({ profileIds: PROFILES, maxBlocks: 1 });

    const session = pool.acquire();
    expect(pool.release(session, { statusCode: 200, blocked: true }).retired).toBe(true);
  });

  it('counts a 403 and a 429 against the identity', () => {
    const pool = new SessionPool({ profileIds: PROFILES, maxBlocks: 1 });

    expect(pool.release(pool.acquire(), { statusCode: 403 }).retired).toBe(true);
    expect(pool.release(pool.acquire(), { statusCode: 429 }).retired).toBe(true);
  });

  it('does not count an ordinary 404 against the identity', () => {
    const pool = new SessionPool({ profileIds: PROFILES, maxSessions: 1, maxBlocks: 1 });

    const session = pool.acquire();
    expect(pool.release(session, { statusCode: 404 }).retired).toBe(false);
  });

  it('retires a session that has served its request ceiling', () => {
    const pool = new SessionPool({ profileIds: PROFILES, maxSessions: 1, maxRequests: 3 });

    const session = pool.acquire();
    pool.release(session, { statusCode: 200 });
    pool.release(session, { statusCode: 200 });
    expect(pool.release(session, { statusCode: 200 }).retired).toBe(true);
  });

  it('reports a session already retired as retired rather than reviving it', () => {
    const pool = new SessionPool({ profileIds: PROFILES, maxBlocks: 1 });

    const session = pool.acquire();
    pool.release(session, { blocked: true });

    const again = pool.release(session, { statusCode: 200 });
    expect(again.retired).toBe(true);
    expect(session.successes).toBe(0);
  });
});

describe('SessionPool — identity coherence', () => {
  it('pins one profile for a session lifetime', () => {
    const pool = new SessionPool({ profileIds: PROFILES, maxSessions: 1 });

    const session = pool.acquire();
    const pinned = session.profileId;

    for (let i = 0; i < 20; i++) {
      pool.release(pool.acquire(), { statusCode: 200 });
    }

    expect(session.profileId).toBe(pinned);
  });

  it('pins the proxy exit to the same session as the profile', () => {
    const pool = new SessionPool({
      profileIds: PROFILES,
      proxyUrls: ['http://p1.example:8080', 'http://p2.example:8080'],
      maxSessions: 2,
    });

    const a = pool.acquire();
    const b = pool.acquire();

    expect(a.proxyUrl).not.toBe(b.proxyUrl);
    expect(a.profileId).not.toBe(b.profileId);
    for (let i = 0; i < 10; i++) pool.release(a, { statusCode: 200 });
    expect(a.proxyUrl).toBe('http://p1.example:8080');
  });

  it('gives a replacement a different pairing from the one that was blocked', () => {
    const pool = new SessionPool({
      profileIds: PROFILES,
      proxyUrls: ['http://p1.example:8080', 'http://p2.example:8080'],
      maxSessions: 1,
      maxBlocks: 1,
    });

    const blockedSession = pool.acquire();
    pool.release(blockedSession, { blocked: true });

    const replacement = pool.acquire();
    expect(
      replacement.profileId !== blockedSession.profileId ||
        replacement.proxyUrl !== blockedSession.proxyUrl,
    ).toBe(true);
  });

  it('goes direct rather than inventing a proxy when none is configured', () => {
    const pool = new SessionPool({ profileIds: PROFILES });

    expect(pool.acquire().proxyUrl).toBeUndefined();
  });

  it('carries the cookie jar with the identity that earned it', () => {
    const pool = new SessionPool({ profileIds: PROFILES, maxSessions: 1 });

    const session = pool.acquire();
    pool.release(session, { statusCode: 200, cookies: { sid: 'abc' } });
    pool.release(session, { statusCode: 200, cookies: { csrf: 'xyz' } });

    expect(pool.cookieHeader(session)).toBe('sid=abc; csrf=xyz');
  });

  it('starts a replacement with an empty jar', () => {
    const pool = new SessionPool({ profileIds: PROFILES, maxSessions: 1, maxBlocks: 1 });

    const first = pool.acquire();
    pool.release(first, { statusCode: 200, cookies: { sid: 'abc' } });
    pool.release(first, { blocked: true });

    expect(pool.cookieHeader(pool.acquire())).toBeUndefined();
  });

  it('spreads load across live identities instead of burning one down', () => {
    const pool = new SessionPool({ profileIds: PROFILES, maxSessions: 3 });

    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const session = pool.acquire();
      seen.add(session.id);
      pool.release(session, { statusCode: 200 });
    }

    expect(seen.size).toBe(3);
    expect(pool.stats().live).toBe(3);
  });
});
