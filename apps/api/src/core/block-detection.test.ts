import { describe, expect, it } from 'vitest';
import { classifyTransportError, detectBlock, type ResponseFacts } from './block-detection.js';

const facts = (overrides: Partial<ResponseFacts>): ResponseFacts => ({
  statusCode: 200,
  headers: {},
  body: '',
  ...overrides,
});

describe('detectBlock', () => {
  it('flags a Cloudflare challenge that returns HTTP 200', () => {
    // The case that matters most: upstream says 200, body is an interstitial.
    // Returning this as content is how a scraper silently poisons a dataset.
    const verdict = detectBlock(
      facts({
        statusCode: 200,
        headers: { 'cf-mitigated': 'challenge' },
        body: '<html><body>Checking your browser before accessing…</body></html>',
      }),
    );

    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe('challenge');
    expect(verdict.detectedBy).toContain('cloudflare-mitigated');
  });

  it('flags DataDome', () => {
    const verdict = detectBlock(
      facts({ body: '<script src="https://geo.captcha-delivery.com/captcha/"></script>' }),
    );
    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe('challenge');
  });

  it('flags PerimeterX', () => {
    const verdict = detectBlock(facts({ body: '<div id="px-captcha"></div>' }));
    expect(verdict.blocked).toBe(true);
  });

  it('flags a 429', () => {
    const verdict = detectBlock(facts({ statusCode: 429, body: 'Too Many Requests' }));
    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe('blocked');
  });

  it('passes ordinary content through', () => {
    const verdict = detectBlock(
      facts({
        body: `<html><body><article>${'Real article text. '.repeat(80)}</article></body></html>`,
        extractedText: 'Real article text. '.repeat(80),
      }),
    );
    expect(verdict.blocked).toBe(false);
  });

  it('does not flag a page merely for mentioning Cloudflare', () => {
    // A blog post about CDNs is not a block page. Fingerprints must be specific
    // enough that discussion of a vendor does not trip them.
    const body = `<html><body><article>
      We migrated our DNS to Cloudflare last quarter and saw latency improve.
      ${'This is ordinary prose about infrastructure choices. '.repeat(40)}
    </article></body></html>`;

    const verdict = detectBlock(facts({ body, extractedText: body }));
    expect(verdict.blocked).toBe(false);
  });

  it('treats a short body alone as insufficient evidence', () => {
    // A legitimately tiny page is not a block. This signal only corroborates.
    const verdict = detectBlock(facts({ body: '<html><body>Hi</body></html>' }));
    expect(verdict.blocked).toBe(false);
    expect(verdict.confidence).toBeLessThan(0.5);
  });

  it('does not flag a full page that carries Cloudflare bot-management scripts or a vendor name', () => {
    // Cloudflare injects /cdn-cgi/challenge-platform/scripts/jsd/main.js into ordinary
    // pages, sites embed Turnstile on login forms, and READMEs name DataDome. Probed
    // live 2026-10-05: discord.com, medium.com and github READMEs were all flagged,
    // walking every tier and failing pages the tls tier had already fetched.
    const prose = 'Ordinary article text about scraping tools and their trade-offs. '.repeat(40);
    for (const marker of [
      '<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>',
      '<div class="cf-turnstile" data-sitekey="x"></div>',
      '<p>Works against DataDome and PerimeterX. Access denied errors are retried.</p>',
    ]) {
      const body = `<html><body><article>${prose}</article>${marker}</body></html>`;
      expect(detectBlock(facts({ body, extractedText: prose })).blocked).toBe(false);
    }
  });

  it('still flags the Cloudflare interstitial by its challenge markers', () => {
    const body =
      '<html><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt={cvId:"3"};</script></body></html>';
    const verdict = detectBlock(facts({ statusCode: 403, body }));
    expect(verdict.blocked).toBe(true);
    expect(verdict.detectedBy).toContain('cloudflare-challenge');
  });

  it('flags a human-verification interstitial that returns HTTP 200', () => {
    // Reddit's wall: 200, a short page, no vendor marker. Scored as an empty
    // success before this signal existed, which is the worst answer available —
    // the crawl believed it had read the page.
    const verdict = detectBlock(
      facts({
        statusCode: 200,
        body: '<html><body><h1>Prove your humanity</h1><p>Press and hold to continue.</p></body></html>',
      }),
    );

    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe('challenge');
    expect(verdict.detectedBy).toContain('human-verification');
  });

  it('flags a page demanding JavaScript and cookies before it will continue', () => {
    const verdict = detectBlock(
      facts({ body: '<html><body>Enable JavaScript and cookies to continue</body></html>' }),
    );

    expect(verdict.blocked).toBe(true);
    expect(verdict.detectedBy).toContain('human-verification');
  });

  it('does not flag an article that discusses human verification', () => {
    // The same phrase in prose on a real page is content, not a wall. The
    // interstitial gate is what separates them.
    const prose = 'How CAPTCHAs prove your humanity, and why that is a problem. '.repeat(40);
    const verdict = detectBlock(
      facts({
        body: `<html><body><article>${prose}</article></body></html>`,
        extractedText: prose,
      }),
    );

    expect(verdict.blocked).toBe(false);
  });

  it('names every signal that fired, for debuggability', () => {
    const verdict = detectBlock(
      facts({
        statusCode: 403,
        body: '<div class="g-recaptcha"></div>',
      }),
    );
    expect(verdict.detectedBy.length).toBeGreaterThan(1);
    expect(verdict.detectedBy).toContain('captcha-widget');
  });
});

describe('detectBlock on a large page with little extracted text', () => {
  // Found 2026-11-01. After helix-scrape solved Cloudflare on nopecha.com/demo, the
  // real index (173 KB of HTML, 56 links, 742 chars of extracted text) was flagged
  // as perimeterx + captcha-widget. The "evidence" was an inline SVG sprite id
  // (`icon-perimeterx`, `icon-turnstile`) and nav links naming the vendors it demos.
  // A challenge page is small; a large document is content however little text
  // trafilatura recovers from it.
  const nav = ['Arkose FunCAPTCHA', 'AWS WAF CAPTCHA', 'Cloudflare Turnstile', 'PerimeterX (HUMAN)']
    .map((n) => `<li><a href="/demo/${n.split(' ')[0]?.toLowerCase()}">${n}</a></li>`)
    .join('');
  const sprite =
    '<svg style="display:none"><symbol id="icon-perimeterx"></symbol><symbol id="icon-turnstile"></symbol></svg>';
  const bundle = `<script>${'var x=1;'.repeat(20_000)}</script>`;
  const shortText = 'NopeCHA Docs CAPTCHA Demo Cloudflare Turnstile PerimeterX (HUMAN) '.repeat(10);
  const largeIndex = `<html><body><ul>${nav}</ul>${sprite}${bundle}</body></html>`;

  it('passes a solved Cloudflare page that only names captcha vendors in links and icons', () => {
    expect(largeIndex.length).toBeGreaterThan(100_000);
    const verdict = detectBlock(facts({ body: largeIndex, extractedText: shortText }));
    expect(verdict.blocked).toBe(false);
    expect(verdict.detectedBy).toEqual([]);
  });

  it('still flags a Cloudflare challenge that is padded to a large body', () => {
    // The interstitial's own state object is challenge-only evidence at any size.
    const body = `<html><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt={cvId:"3"};</script>${bundle}</body></html>`;
    const verdict = detectBlock(facts({ body, extractedText: 'Just a moment...' }));
    expect(verdict.blocked).toBe(true);
    expect(verdict.detectedBy).toContain('cloudflare-challenge');
  });

  it('still flags a PerimeterX challenge element and a DataDome frame on a large body', () => {
    for (const marker of [
      '<div id="px-captcha"></div>',
      '<iframe src="https://geo.captcha-delivery.com/captcha/?initialCid=x"></iframe>',
    ]) {
      const body = `<html><body>${marker}${bundle}</body></html>`;
      const verdict = detectBlock(facts({ body, extractedText: 'Press and hold' }));
      expect(verdict.blocked).toBe(true);
      expect(verdict.reason).toBe('challenge');
    }
  });

  it('still flags a small page whose only content is a live Turnstile widget', () => {
    // The 1.9 KB body helix-scrape returned for nopecha.com/demo/turnstile.
    const body =
      '<html><head><title>NopeCHA - Turnstile Demo</title><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async></script></head>' +
      '<body><div class="label">Cloudflare Turnstile</div><div id="example-container0"><input type="hidden" name="cf-turnstile-response" value=""></div></body></html>';
    const verdict = detectBlock(facts({ body, extractedText: 'Cloudflare Turnstile More info' }));
    expect(verdict.blocked).toBe(true);
    expect(verdict.detectedBy).toContain('captcha-widget');
  });

  it('still flags an error status on a large body', () => {
    const body = `<html><body><p>Access denied</p>${nav}${sprite}${bundle}</body></html>`;
    const verdict = detectBlock(facts({ statusCode: 403, body, extractedText: shortText }));
    expect(verdict.blocked).toBe(true);
    expect(verdict.detectedBy).toContain('status-403');
  });
});

describe('classifyTransportError', () => {
  it('names a down Helix service as service_unavailable, never a block', () => {
    // The bug this exists to prevent: a fetch service being down was reported as
    // a Cloudflare challenge, sending operators to chase an anti-bot problem
    // that did not exist.
    for (const msg of ['fetch failed', 'connect ECONNREFUSED 127.0.0.1:7403', 'helix-scrape returned HTTP 502']) {
      expect(classifyTransportError(msg)).toBe('service_unavailable');
    }
  });

  it('classifies DNS failures', () => {
    expect(classifyTransportError('net::ERR_NAME_NOT_RESOLVED')).toBe('dns');
    expect(classifyTransportError('getaddrinfo ENOTFOUND example.com')).toBe('dns');
  });

  it('classifies timeouts', () => {
    expect(classifyTransportError('request timed out after 30000ms')).toBe('timeout');
    expect(classifyTransportError('ETIMEDOUT')).toBe('timeout');
  });

  it('classifies TLS failures', () => {
    expect(classifyTransportError('SSL handshake failed')).toBe('tls');
    expect(classifyTransportError('certificate has expired')).toBe('tls');
  });

  it('falls back to http_error for anything unrecognised', () => {
    expect(classifyTransportError('some other problem')).toBe('http_error');
  });

  it('never returns a block or challenge for a transport error', () => {
    // A transport failure is a failure to reach the site at all. The site said
    // nothing, so nothing it "did" — block, challenge — can be the reason.
    const reasons = ['fetch failed', 'ENOTFOUND', 'ETIMEDOUT', 'SSL error', 'weird'].map(
      classifyTransportError,
    );
    expect(reasons).not.toContain('blocked');
    expect(reasons).not.toContain('challenge');
  });
});
