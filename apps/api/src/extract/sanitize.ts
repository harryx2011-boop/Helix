/**
 * The `html` format: the page's markup with everything that executes or styles
 * removed, so it can be stored or shown without carrying the page's scripts.
 *
 * `rawHtml` is the untouched alternative. This is deliberately a small,
 * predictable pass rather than a full parser: it strips whole `script`,
 * `style`, `noscript`, `iframe`, `object` and `embed` elements, HTML comments,
 * inline event handlers and `javascript:` URLs. It does not try to make the
 * output safe to render inside another origin's DOM.
 *
 * The element pass is a single left-to-right walk over tags. A regex with a
 * lazy body and a backreference would rescan to end-of-input for every
 * unclosed `<script>`, which is quadratic on a hostile page; this walk visits
 * each character a bounded number of times whatever the input.
 */

const BLOCKED_ELEMENTS = new Set(['script', 'style', 'noscript', 'iframe', 'object', 'template']);

/** Void in HTML: the tag alone is removed, nothing after it is treated as content. */
const BLOCKED_VOID_ELEMENTS = new Set(['embed']);

/**
 * A comment (unterminated ones run to end-of-input, as in a browser) or a tag.
 * `[^<>]*` rather than `[^>]*` so a stray `<` never makes a tag scan past the
 * next tag start.
 */
const TOKEN = /<!--(?:[\s\S]*?-->|[\s\S]*$)|<(\/?)([a-zA-Z][\w:-]*)\b[^<>]*>/g;

/** `onclick="..."`, `onload='...'`, `onerror=bare`. An unclosed quote runs to end-of-input, as in a browser. */
const EVENT_HANDLERS = /\s+on[a-z]{3,}\s*=\s*(?:"[^"]*(?:"|$)|'[^']*(?:'|$)|[^\s>]+)/gi;

/** `href="javascript:..."` and friends. The attribute is kept; the value is emptied. */
const JAVASCRIPT_URLS =
  /(\s+(?:href|src|action|formaction|xlink:href)\s*=\s*)(?:"\s*javascript:[^"]*(?:"|$)|'\s*javascript:[^']*(?:'|$)|javascript:[^\s>]+)/gi;

function stripBlockedElements(html: string): string {
  let out = '';
  let cursor = 0;
  let skipping: string | undefined;

  TOKEN.lastIndex = 0;
  for (let match = TOKEN.exec(html); match; match = TOKEN.exec(html)) {
    const end = match.index + match[0].length;
    const closing = match[1] === '/';
    const name = match[2]?.toLowerCase();

    if (skipping !== undefined) {
      if (closing && name === skipping) {
        skipping = undefined;
        cursor = end;
      }
      continue;
    }

    if (name === undefined) {
      out += html.slice(cursor, match.index);
      cursor = end;
      continue;
    }

    if (BLOCKED_VOID_ELEMENTS.has(name) || (closing && BLOCKED_ELEMENTS.has(name))) {
      out += html.slice(cursor, match.index);
      cursor = end;
      continue;
    }

    if (BLOCKED_ELEMENTS.has(name)) {
      out += html.slice(cursor, match.index);
      // Dropped to end-of-input unless a matching close tag turns up, which is
      // what a browser does with an unterminated script.
      cursor = html.length;
      skipping = name;
    }
  }

  return out + html.slice(cursor);
}

export function sanitizeHtml(html: string): string {
  return stripBlockedElements(html).replace(EVENT_HANDLERS, '').replace(JAVASCRIPT_URLS, '$1""');
}
