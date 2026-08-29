import { describe, expect, it } from 'vitest';
import {
  CONTENT_FLOOR_CHARS,
  canonicaliseUrl,
  dedupeByUrl,
  isBlocklistedSocial,
  isParkedPage,
  isPlaceholderPage,
  screenSource,
} from './guards.js';

const REAL_PAGE = `
Acme Robotics builds warehouse automation for mid-market distributors. Founded in
2011 and headquartered in Rotterdam, the company employs 240 people across three
sites. Our flagship product, the Acme Picker, handles 1,200 units an hour and is
deployed at 60 customers in the Benelux region. We publish our reliability data
quarterly and our support team answers within one business day.
`.repeat(4);

describe('content floor', () => {
  it('rejects a page with less text than the floor', () => {
    const verdict = screenSource({ url: 'https://acme.example/about', text: 'Acme.' });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('below_content_floor');
    expect(verdict.detail).toContain(String(CONTENT_FLOOR_CHARS));
  });

  it('accepts a page that clears the floor', () => {
    expect(screenSource({ url: 'https://acme.example/about', text: REAL_PAGE }).ok).toBe(true);
  });
});

describe('parked domains', () => {
  it('rejects a for-sale parking page', () => {
    const parked = 'This domain is for sale. Inquire about this domain today. Related searches: robotics, automation.';
    expect(isParkedPage('https://acme.example', parked)).toBe(true);
    expect(screenSource({ url: 'https://acme.example', text: parked }).reason).toBe('parked_domain');
  });

  it('rejects a page served by a known parking host', () => {
    expect(isParkedPage('https://acme.sedoparking.com/', REAL_PAGE)).toBe(true);
  });

  it('does not reject a long genuine page that mentions a domain sale in passing', () => {
    const article = `${REAL_PAGE}\n\nIn 2019 we saw a competitor put up a notice saying this domain is for sale, which we noted.\n${REAL_PAGE}`;
    expect(isParkedPage('https://acme.example/blog', article)).toBe(false);
  });
});

describe('placeholder pages', () => {
  it('rejects a coming-soon page', () => {
    const text = 'Coming soon. Our new website is under construction. Check back shortly.';
    expect(isPlaceholderPage(text)).toBe(true);
    expect(screenSource({ url: 'https://acme.example', text }).reason).toBe('placeholder_page');
  });

  it('rejects a default server page', () => {
    expect(isPlaceholderPage('Welcome to nginx! If you are the site owner, configure your server.')).toBe(true);
  });

  it('does not reject a long roadmap that says coming soon', () => {
    const roadmap = `${REAL_PAGE} Our next product is coming soon. ${REAL_PAGE}`;
    expect(roadmap.length).toBeGreaterThan(2_000);
    expect(isPlaceholderPage(roadmap)).toBe(false);
  });
});

describe('social blocklist', () => {
  it.each(['https://www.facebook.com/acme', 'https://x.com/acme', 'https://uk.linkedin.example/x'])(
    'screens %s',
    (url) => {
      const blocked = isBlocklistedSocial(url);
      if (url.includes('facebook') || url.includes('x.com')) expect(blocked).toBe(true);
      else expect(blocked).toBe(false);
    },
  );

  it('blocks subdomains of a blocked host', () => {
    expect(isBlocklistedSocial('https://m.facebook.com/acme')).toBe(true);
  });

  it('does not block a host that merely ends in the same letters', () => {
    expect(isBlocklistedSocial('https://notfacebook.com/acme')).toBe(false);
  });

  it('rejects a social URL before the content floor is considered', () => {
    expect(screenSource({ url: 'https://x.com/acme', text: REAL_PAGE }).reason).toBe('blocklisted_social');
  });
});

describe('dedupe', () => {
  it('collapses tracking params, www and trailing slashes', () => {
    expect(canonicaliseUrl('https://WWW.Acme.example/about/?utm_source=x#team')).toBe('https://acme.example/about');
    const items = [
      { url: 'https://acme.example/about' },
      { url: 'https://www.acme.example/about/' },
      { url: 'https://acme.example/team' },
    ];
    expect(dedupeByUrl(items)).toHaveLength(2);
  });
});
