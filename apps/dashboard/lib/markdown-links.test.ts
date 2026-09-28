import { describe, expect, it } from 'vitest';
import { isSafeHref, markdownUrlTransform } from './markdown-links';

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
});

describe('markdownUrlTransform', () => {
  it('passes a safe URL through unchanged', () => {
    expect(markdownUrlTransform('https://example.com')).toBe('https://example.com');
  });

  it('drops an unsafe URL to an empty string', () => {
    expect(markdownUrlTransform('javascript:alert(1)')).toBe('');
  });
});
