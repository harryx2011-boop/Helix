
const BLOCKED_ELEMENTS = new Set(['script', 'style', 'noscript', 'iframe', 'object', 'template']);

const BLOCKED_VOID_ELEMENTS = new Set(['embed']);

const TOKEN = /<!--(?:[\s\S]*?-->|[\s\S]*$)|<(\/?)([a-zA-Z][\w:-]*)\b[^<>]*>/g;

const EVENT_HANDLERS = /\s+on[a-z]{3,}\s*=\s*(?:"[^"]*(?:"|$)|'[^']*(?:'|$)|[^\s>]+)/gi;

const URL_ATTRIBUTES =
  /(\s+(?:href|src|action|formaction|xlink:href)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

const STYLE_ATTRIBUTE = /(\s+style\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi;
const STYLE_URL_FUNCTION = /url\(\s*(?:"([^"]*)"|'([^']*)'|(.*))\s*\)/gi;

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function normalizeForSchemeCheck(value: string): string {
  const decoded = value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (full: string, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? full);
  // eslint-disable-next-line no-control-regex
  return decoded.replace(/[\x00-\x20]+/g, '');
}

function hasJavascriptScheme(value: string): boolean {
  return /^javascript:/i.test(normalizeForSchemeCheck(value));
}

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
      cursor = html.length;
      skipping = name;
    }
  }

  return out + html.slice(cursor);
}

function stripJavascriptUrls(html: string): string {
  return html.replace(URL_ATTRIBUTES, (full, prefix: string, dq?: string, sq?: string, bare?: string) => {
    const value = dq ?? sq ?? bare ?? '';
    if (!hasJavascriptScheme(value)) return full;
    return `${prefix}""`;
  });
}

function stripJavascriptStyleUrls(html: string): string {
  return html.replace(STYLE_ATTRIBUTE, (full, prefix: string, dq?: string, sq?: string) => {
    const quote = dq !== undefined ? '"' : "'";
    const value = dq ?? sq ?? '';
    const cleaned = value.replace(STYLE_URL_FUNCTION, (fnFull, fnDq?: string, fnSq?: string, fnBare?: string) => {
      const inner = fnDq ?? fnSq ?? fnBare ?? '';
      return hasJavascriptScheme(inner) ? 'url()' : fnFull;
    });
    return `${prefix}${quote}${cleaned}${quote}`;
  });
}

export function sanitizeHtml(html: string): string {
  const withoutBlocked = stripBlockedElements(html).replace(EVENT_HANDLERS, '');
  return stripJavascriptStyleUrls(stripJavascriptUrls(withoutBlocked));
}
