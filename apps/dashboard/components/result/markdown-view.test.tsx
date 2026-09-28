import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MarkdownView } from './markdown-view';

describe('MarkdownView', () => {
  it('renders a GFM table', () => {
    const { container } = render(<MarkdownView content={'| a | b |\n| - | - |\n| 1 | 2 |\n'} />);
    expect(container.querySelector('table')).toBeTruthy();
    expect(container.querySelectorAll('td')).toHaveLength(2);
  });

  it('renders a task list', () => {
    const { container } = render(<MarkdownView content={'- [x] done\n- [ ] not done\n'} />);
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(2);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
  });

  it('renders strikethrough and an autolink', () => {
    const { container } = render(<MarkdownView content={'~~gone~~ see https://example.com'} />);
    expect(container.querySelector('del')).toBeTruthy();
    const link = container.querySelector('a[href="https://example.com"]');
    expect(link).toBeTruthy();
  });

  it('highlights a fenced code block via the fence language tag, with a copy button', async () => {
    const { container } = render(<MarkdownView content={'```ts\nconst x = 1;\n```'} />);
    // Immediate render: plain <pre><code> before the lazy highlighter resolves.
    expect(container.textContent).toContain('const x = 1;');
    expect(screen.getByLabelText('Copy code')).toBeTruthy();
    await waitFor(
      () => {
        expect(container.querySelector('pre.shiki')).toBeTruthy();
      },
      { timeout: 10000 },
    );
  });

  it('falls back to plain text for an unknown fence language', () => {
    const { container } = render(<MarkdownView content={'```totally-unknown-lang\nhello\n```'} />);
    expect(container.textContent).toContain('hello');
    expect(container.querySelector('pre.shiki')).toBeFalsy();
  });

  it('renders inline math', () => {
    const { container } = render(<MarkdownView content={'The value is $x^2$ here.'} />);
    expect(container.querySelector('.katex')).toBeTruthy();
  });

  it('renders block math from $$...$$ and \\[...\\]', () => {
    const { container: a } = render(<MarkdownView content={'$$\nx = y\n$$'} />);
    expect(a.querySelector('.katex-display')).toBeTruthy();

    const { container: b } = render(<MarkdownView content={'\\[x = y\\]'} />);
    expect(b.querySelector('.katex-display')).toBeTruthy();
  });

  it('renders a one-line $$...$$ as block math', () => {
    const { container } = render(<MarkdownView content={'$$x = y$$'} />);
    expect(container.querySelector('.katex-display')).toBeTruthy();
  });

  it('renders \\(...\\) as inline math', () => {
    const { container } = render(<MarkdownView content={'\\(x + 1\\)'} />);
    const katex = container.querySelector('.katex');
    expect(katex).toBeTruthy();
    expect(container.querySelector('.katex-display')).toBeFalsy();
  });

  it('does not treat currency as math', () => {
    const { container } = render(<MarkdownView content={'It costs $5 and $10 for the pair.'} />);
    expect(container.querySelector('.katex')).toBeFalsy();
    expect(container.textContent).toContain('costs $5 and $10');
  });

  it('never renders raw HTML — a script tag is neutralised', () => {
    const { container } = render(<MarkdownView content={'before <script>alert(1)</script> after'} />);
    expect(container.querySelector('script')).toBeFalsy();
  });

  it('refuses a javascript: link and renders it as text, not an anchor', () => {
    const { container } = render(<MarkdownView content={'[click me](javascript:alert(1))'} />);
    expect(container.querySelector('a[href^="javascript:"]')).toBeFalsy();
    expect(container.textContent).toContain('click me');
  });

  it('refuses data: and file: links the same way', () => {
    const { container: a } = render(<MarkdownView content={'[x](data:text/html,evil)'} />);
    expect(a.querySelector('a[href^="data:"]')).toBeFalsy();

    const { container: b } = render(<MarkdownView content={'[x](file:///etc/passwd)'} />);
    expect(b.querySelector('a[href^="file:"]')).toBeFalsy();
  });

  it('refuses a protocol-relative link, which a browser resolves off-site', () => {
    const { container } = render(<MarkdownView content={'[x](//evil.com/phish)'} />);
    expect(container.querySelector('a')).toBeFalsy();
    expect(container.textContent).toContain('x');
  });

  // CommonMark's own backslash-escaping collapses `\\` to a single literal `\`
  // in link-destination source before it ever reaches urlTransform, so the
  // `\\evil.com` / `/\evil.com` bypass forms cannot be expressed through
  // ordinary markdown link syntax at all — they are exercised directly against
  // isSafeHref in lib/markdown-links.test.ts instead, which is where a raw
  // href (e.g. from HTML, already stripped here since there is no rehype-raw)
  // would actually reach the policy unmolested.

  it('allows http(s) and mailto links, with rel=noopener noreferrer on external links', () => {
    const { container } = render(<MarkdownView content={'[a](https://example.com) [b](mailto:x@example.com)'} />);
    const httpLink = container.querySelector('a[href="https://example.com"]');
    expect(httpLink).toBeTruthy();
    expect(httpLink?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(container.querySelector('a[href="mailto:x@example.com"]')).toBeTruthy();
  });

  it('keeps a relative link resolvable (same-origin, not a dangerous scheme)', () => {
    const { container } = render(<MarkdownView content={'[home](/docs)'} />);
    expect(container.querySelector('a[href="/docs"]')).toBeTruthy();
  });

  it('supports a components override without losing the link policy', () => {
    const { container } = render(
      <MarkdownView
        content={'[bad](javascript:alert(1))\n\n# heading'}
        components={{ h1: () => <span data-testid="custom-h1">custom</span> }}
      />,
    );
    expect(screen.getByTestId('custom-h1')).toBeTruthy();
    expect(container.querySelector('a[href^="javascript:"]')).toBeFalsy();
  });

  it('renders sensibly and never throws on an unclosed fence', () => {
    expect(() => render(<MarkdownView content={'```ts\nconst x = 1;'} />)).not.toThrow();
  });

  it('renders sensibly and never throws on unclosed $$ block math', () => {
    expect(() => render(<MarkdownView content={'Some text $$x = y'} />)).not.toThrow();
  });

  it('renders sensibly and never throws on an unclosed inline $', () => {
    expect(() => render(<MarkdownView content={'Some text $x = y'} />)).not.toThrow();
  });
});
