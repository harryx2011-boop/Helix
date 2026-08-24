/**
 * The `html` format: the page's markup with everything that executes or styles
 * removed, so it can be stored or shown without carrying the page's scripts.
 *
 * `rawHtml` is the untouched alternative. This is deliberately a small,
 * predictable pass rather than a full parser: it strips whole `script`,
 * `style`, `noscript`, `iframe`, `object` and `embed` elements, HTML comments,
 * inline event handlers and `javascript:` URLs. It does not try to make the
 * output safe to render inside another origin's DOM.
 */

const ELEMENT_BLOCKLIST = ['script', 'style', 'noscript', 'iframe', 'object', 'embed', 'template'];

const BLOCKED_ELEMENTS = new RegExp(
  `<(${ELEMENT_BLOCKLIST.join('|')})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`,
  'gi',
);

/** A void or unterminated blocked element, e.g. `<embed src=...>` with no closing tag. */
const BLOCKED_OPEN_TAGS = new RegExp(`<\\/?(${ELEMENT_BLOCKLIST.join('|')})\\b[^>]*>`, 'gi');

const COMMENTS = /<!--[\s\S]*?-->/g;

/** `onclick="..."`, `onload='...'`, `onerror=bare`. */
const EVENT_HANDLERS = /\s+on[a-z]{3,}\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/** `href="javascript:..."` and friends. The attribute is kept; the value is emptied. */
const JAVASCRIPT_URLS = /(\s+(?:href|src|action|formaction|xlink:href)\s*=\s*)(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi;

export function sanitizeHtml(html: string): string {
  return html
    .replace(COMMENTS, '')
    .replace(BLOCKED_ELEMENTS, '')
    .replace(BLOCKED_OPEN_TAGS, '')
    .replace(EVENT_HANDLERS, '')
    .replace(JAVASCRIPT_URLS, '$1""');
}
