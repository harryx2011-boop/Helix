import { describe, expect, it } from 'vitest';
import { CookieJar, parseSetCookies } from './cookie-jar.js';

const ID = { url: 'https://www.g2.com/a', proxy: undefined, tier: 'tls' as const, profile: 'chrome-149' };

describe('parseSetCookies', () => {
  it('reads name and value, and drops attributes', () => {
    expect(parseSetCookies(['cf_clearance=abc; Path=/; HttpOnly', '__cf_bm=x=y; Max-Age=1800'])).toEqual({
      cf_clearance: 'abc',
      __cf_bm: 'x=y',
    });
  });

  it('marks a cookie the host deleted', () => {
    expect(parseSetCookies(['sid=; Max-Age=0'])).toEqual({ sid: null });
    expect(parseSetCookies(['sid=1; Expires=Thu, 01 Jan 1970 00:00:00 GMT'])).toEqual({ sid: null });
  });
});

describe('CookieJar', () => {
  it('replays a host cookie to the same identity', () => {
    const jar = new CookieJar();
    jar.store(ID, ['cf_clearance=abc; Path=/']);
    expect(jar.header({ ...ID, url: 'https://www.g2.com/b' })).toBe('cf_clearance=abc');
  });

  it('never hands a cookie to another identity', () => {
    const jar = new CookieJar();
    jar.store(ID, ['cf_clearance=abc']);
    expect(jar.header({ ...ID, profile: 'chrome-148' })).toBeUndefined();
    expect(jar.header({ ...ID, proxy: 'http://p:1' })).toBeUndefined();
    expect(jar.header({ ...ID, tier: 'chromium' })).toBeUndefined();
    expect(jar.header({ ...ID, url: 'https://example.com/' })).toBeUndefined();
  });

  it('forgets a cookie the host deleted', () => {
    const jar = new CookieJar();
    jar.store(ID, ['a=1', 'b=2']);
    jar.store(ID, ['a=; Max-Age=0']);
    expect(jar.header(ID)).toBe('b=2');
  });

  it('expires the whole identity after its time to live', () => {
    let now = 0;
    const jar = new CookieJar({ ttlMs: 1_000, now: () => now });
    jar.store(ID, ['a=1']);
    now = 1_001;
    expect(jar.header(ID)).toBeUndefined();
  });
});
