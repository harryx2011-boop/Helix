import { describe, expect, it } from 'vitest';
import { resolveFavicon } from './favicon.js';

const FINAL_URL = 'https://example.com/blog/post';

describe('resolveFavicon', () => {
  it('resolves a declared rel="icon"', () => {
    const html = '<html><head><link rel="icon" href="/icons/favicon.png"></head><body></body></html>';
    expect(resolveFavicon(html, FINAL_URL)).toBe('https://example.com/icons/favicon.png');
  });

  it('resolves a declared rel="shortcut icon"', () => {
    const html = '<html><head><link rel="shortcut icon" href="/legacy.ico"></head></html>';
    expect(resolveFavicon(html, FINAL_URL)).toBe('https://example.com/legacy.ico');
  });

  it('resolves apple-touch-icon when no other icon is declared', () => {
    const html = '<html><head><link rel="apple-touch-icon" href="/apple-icon-180.png"></head></html>';
    expect(resolveFavicon(html, FINAL_URL)).toBe('https://example.com/apple-icon-180.png');
  });

  it('prefers the icon with the largest declared sizes', () => {
    const html = `<html><head>
      <link rel="icon" href="/icon-16.png" sizes="16x16">
      <link rel="icon" href="/icon-32.png" sizes="32x32">
      <link rel="apple-touch-icon" href="/icon-180.png" sizes="180x180">
    </head></html>`;
    expect(resolveFavicon(html, FINAL_URL)).toBe('https://example.com/icon-180.png');
  });

  it('resolves a relative href against the final URL, not the origin path', () => {
    const html = '<html><head><link rel="icon" href="../assets/icon.png"></head></html>';
    expect(resolveFavicon(html, FINAL_URL)).toBe('https://example.com/assets/icon.png');
  });

  it('resolves a protocol-relative href against the page protocol', () => {
    const html = '<html><head><link rel="icon" href="//cdn.example.com/icon.png"></head></html>';
    expect(resolveFavicon(html, FINAL_URL)).toBe('https://cdn.example.com/icon.png');
  });

  it('falls back to /favicon.ico at the origin when nothing is declared', () => {
    const html = '<html><head><title>No icons here</title></head><body></body></html>';
    expect(resolveFavicon(html, FINAL_URL)).toBe('https://example.com/favicon.ico');
  });

  it('falls back to /favicon.ico when there is no <head> at all', () => {
    const html = '<html><body>plain page</body></html>';
    expect(resolveFavicon(html, FINAL_URL)).toBe('https://example.com/favicon.ico');
  });

  it('falls back to /favicon.ico when html is undefined', () => {
    expect(resolveFavicon(undefined, FINAL_URL)).toBe('https://example.com/favicon.ico');
  });

  it('tolerates malformed HTML (unclosed tags, no quotes) and still finds the icon', () => {
    const html = '<html><head><link rel=icon href=/fav.png></head><body><div>';
    expect(resolveFavicon(html, FINAL_URL)).toBe('https://example.com/fav.png');
  });

  it('passes a data: URI through unresolved', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    const html = `<html><head><link rel="icon" href="${dataUri}"></head></html>`;
    expect(resolveFavicon(html, FINAL_URL)).toBe(dataUri);
  });

  it('ignores unrelated <link> tags (stylesheet, preload)', () => {
    const html = `<html><head>
      <link rel="stylesheet" href="/style.css">
      <link rel="preload" href="/font.woff2">
      <link rel="icon" href="/real-icon.png">
    </head></html>`;
    expect(resolveFavicon(html, FINAL_URL)).toBe('https://example.com/real-icon.png');
  });

  it('returns undefined when finalUrl itself is unparseable and nothing is declared', () => {
    expect(resolveFavicon('<html><head></head></html>', 'not-a-url')).toBeUndefined();
  });
});
