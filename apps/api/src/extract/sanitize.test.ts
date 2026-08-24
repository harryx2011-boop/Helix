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
});
