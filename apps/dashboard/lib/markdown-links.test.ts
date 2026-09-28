import { describe, expect, it } from 'vitest';
import { isHttpHref, isSafeHref, markdownUrlTransform } from './markdown-links';

describe('isSafeHref', () => {
  it('allows http and https', () => {
    expect(isSafeHref('http://example.com')).toBe(true);
    expect(isSafeHref('https://example.com')).toBe(true);
  });

  it('allows mailto', () => {
    expect(isSafeHref('mailto:x@example.com')).toBe(true);
  });

  it('allows a relative or hash URL', () => {
    expect(isSafeHref('/docs')).toBe(true);
    expect(isSafeHref('#section')).toBe(true);
    expect(isSafeHref('./relative')).toBe(true);
  });

  it('refuses javascript, data, file and vbscript', () => {
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref('data:text/html,evil')).toBe(false);
    expect(isSafeHref('file:///etc/passwd')).toBe(false);
    expect(isSafeHref('vbscript:msgbox(1)')).toBe(false);
  });

  it('refuses schemes upstream defaultUrlTransform would allow but the policy narrows out', () => {
    expect(isSafeHref('irc://example.com')).toBe(false);
    expect(isSafeHref('xmpp:x@example.com')).toBe(false);
  });

  it('refuses a protocol-relative URL, which a browser resolves against the current scheme', () => {
    expect(isSafeHref('//evil.com')).toBe(false);
    expect(isSafeHref('//evil.com/phish')).toBe(false);
  });

  it('refuses backslash forms that browsers normalise to protocol-relative', () => {
    expect(isSafeHref('\\\\evil.com')).toBe(false);
    expect(isSafeHref('/\\evil.com')).toBe(false);
    expect(isSafeHref('\\/evil.com')).toBe(false);
  });

  it('refuses a protocol-relative URL hidden behind leading whitespace or control characters', () => {
    expect(isSafeHref('   //evil.com')).toBe(false);
    expect(isSafeHref('\t\n//evil.com')).toBe(false);
    expect(isSafeHref('\u0000//evil.com')).toBe(false);
    expect(isSafeHref('\u001f\\\\evil.com')).toBe(false);
  });

  it('still allows an ordinary relative path after leading whitespace is stripped', () => {
    expect(isSafeHref('  /docs')).toBe(true);
    expect(isSafeHref('\n/docs')).toBe(true);
  });

  it('refuses a percent-encoded colon smuggling a dangerous scheme', () => {
    expect(isSafeHref('javascript%3Aalert(1)')).toBe(false);
    expect(isSafeHref('java%3ascript:alert(1)')).toBe(false);
  });

  it('refuses an HTML-entity-encoded colon smuggling a dangerous scheme', () => {
    expect(isSafeHref('javascript&#58;alert(1)')).toBe(false);
    expect(isSafeHref('javascript&#0058;alert(1)')).toBe(false);
    expect(isSafeHref('javascript&#x3a;alert(1)')).toBe(false);
    expect(isSafeHref('javascript&colon;alert(1)')).toBe(false);
  });
});

describe('isHttpHref', () => {
  it('is true only for http(s), sharing isSafeHref’s own scheme detection', () => {
    expect(isHttpHref('https://example.com')).toBe(true);
    expect(isHttpHref('http://example.com')).toBe(true);
    expect(isHttpHref('mailto:x@example.com')).toBe(false);
    expect(isHttpHref('/docs')).toBe(false);
  });

  it('is false for a protocol-relative URL, matching isSafeHref refusing it', () => {
    expect(isHttpHref('//evil.com')).toBe(false);
  });
});

describe('markdownUrlTransform', () => {
  it('passes a safe URL through unchanged', () => {
    expect(markdownUrlTransform('https://example.com')).toBe('https://example.com');
  });

  it('drops an unsafe URL to an empty string', () => {
    expect(markdownUrlTransform('javascript:alert(1)')).toBe('');
  });
});
