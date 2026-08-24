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

describe('classifyTransportError', () => {
  it('names a down Helix service as service_unavailable, never a block', () => {
    // The bug this exists to prevent: a fetch service being down was reported as
    // a Cloudflare challenge, sending operators to chase an anti-bot problem
    // that did not exist.
    for (const msg of ['fetch failed', 'connect ECONNREFUSED 127.0.0.1:7401', 'helix-fetch unreachable']) {
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
