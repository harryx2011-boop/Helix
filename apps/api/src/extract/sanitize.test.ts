import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './sanitize.js';

describe('sanitizeHtml', () => {
  it('removes script, style and noscript elements with their contents', () => {
    const html = '<p>a</p><script type="module">x()</script><style>p{}</style><noscript><img src=x></noscript><p>b</p>';
    expect(sanitizeHtml(html)).toBe('<p>a</p><p>b</p>');
  });

  it('removes iframes, objects, embeds and templates, closed or not', () => {
    const html = '<iframe src="a"></iframe><embed src="b"><object data="c"></object><template><b>t</b></template><p>ok</p>';
    expect(sanitizeHtml(html)).toBe('<p>ok</p>');
  });

  it('removes comments', () => {
    expect(sanitizeHtml('<p>a</p><!-- hidden --><p>b</p>')).toBe('<p>a</p><p>b</p>');
  });

  it('strips inline event handlers in every quoting style', () => {
    const html = `<div onclick="go()" onmouseover='hover()' onload=bare>x</div>`;
    expect(sanitizeHtml(html)).toBe('<div>x</div>');
  });

  it('empties javascript: URLs but keeps ordinary links', () => {
    const html = `<a href="javascript:alert(1)">a</a><a href='JavaScript:void(0)'>b</a><a href="https://example.com/">c</a>`;
    expect(sanitizeHtml(html)).toBe('<a href="">a</a><a href="">b</a><a href="https://example.com/">c</a>');
  });

  it('is case-insensitive about tag names', () => {
    expect(sanitizeHtml('<SCRIPT>x</SCRIPT><P>ok</P>')).toBe('<P>ok</P>');
  });

  it('leaves attribute names that merely start with "on" alone', () => {
    expect(sanitizeHtml('<div one="1" data-onx="2">x</div>')).toBe('<div one="1" data-onx="2">x</div>');
  });

  it('empties a javascript: URL split by embedded whitespace or control characters', () => {
    expect(sanitizeHtml('<a href="java\nscript:alert(1)">a</a>')).toBe('<a href="">a</a>');
    expect(sanitizeHtml('<a href="java\tscript:alert(1)">a</a>')).toBe('<a href="">a</a>');
  });

  it('empties a javascript: URL hidden behind an HTML entity', () => {
    expect(sanitizeHtml('<a href="&#106;avascript:alert(1)">a</a>')).toBe('<a href="">a</a>');
  });

  it('empties a javascript: URL inside a style attribute url(...)', () => {
    expect(sanitizeHtml('<div style="background:url(javascript:alert(1))">x</div>')).toBe('<div style="background:url()">x</div>');
  });

  it('leaves an ordinary link that merely starts with the word javascript alone', () => {
    expect(sanitizeHtml('<a href="/javascript-guide">a</a>')).toBe('<a href="/javascript-guide">a</a>');
  });
});

describe('sanitizeHtml on hostile input', () => {
  it('drops everything after an unterminated script, as a browser would', () => {
    expect(sanitizeHtml('<p>a</p><script>x(')).toBe('<p>a</p>');
    expect(sanitizeHtml('<p>a</p><!-- open')).toBe('<p>a</p>');
  });

  it('removes a stray closing tag without swallowing what follows', () => {
    expect(sanitizeHtml('<p>a</p></script><p>b</p>')).toBe('<p>a</p><p>b</p>');
  });

  it('ignores blocked tags inside a comment', () => {
    expect(sanitizeHtml('<!-- <script> --><p>ok</p>')).toBe('<p>ok</p>');
  });

  it('stays linear on many unclosed blocked tags', () => {
    const html = '<script>'.repeat(120_000) + 'x'.repeat(200_000);
    const started = performance.now();
    expect(sanitizeHtml(html)).toBe('');
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('stays linear on many unclosed attribute quotes and stray angle brackets', () => {
    const handlers = '<div onclick="go('.repeat(60_000) + 'x'.repeat(200_000);
    const brackets = '<a'.repeat(200_000);
    const started = performance.now();
    sanitizeHtml(handlers);
    expect(sanitizeHtml(brackets)).toBe(brackets);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
