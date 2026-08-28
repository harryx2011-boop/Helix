/**
 * Favicon resolution.
 *
 * Pure string parsing — this module never fetches anything. It returns a URL
 * for the client to load, so favicon resolution stays free and side-effect-free
 * no matter how many pages a caller scrapes, crawls or searches.
 *
 * The codebase has no HTML parser dependency (extraction happens out-of-process
 * in helix-extract); a regex scan over the `<head>` follows the same house style
 * as `block-detection.ts`'s single left-to-right walk over tags, rather than
 * adding cheerio/linkedom for one field.
 */

interface IconCandidate {
  href: string;
  rel: string;
  size: number;
}

const HEAD_RE = /<head[^>]*>([\s\S]*?)<\/head>/i;
const LINK_TAG_RE = /<link\b[^>]*>/gi;
const REL_RE = /\brel\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const HREF_RE = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const SIZES_RE = /\bsizes\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

const ICON_RELS = new Set(['icon', 'shortcut icon', 'apple-touch-icon', 'apple-touch-icon-precomposed']);

function attrValue(match: RegExpMatchArray | null): string | undefined {
  if (!match) return undefined;
  return match[2] ?? match[3] ?? match[4];
}

/** `"32x32"` -> 32. `"any"` and malformed values sort last. */
function sizeOf(sizes: string | undefined): number {
  if (!sizes) return 0;
  const m = sizes.match(/(\d+)x\d+/i);
  return m?.[1] ? Number(m[1]) : 0;
}

function declaredIcons(html: string): IconCandidate[] {
  const headMatch = html.match(HEAD_RE);
  const scope = headMatch ? headMatch[1] : html;
  if (!scope) return [];

  const candidates: IconCandidate[] = [];
  const tags = scope.match(LINK_TAG_RE) ?? [];

  for (const tag of tags) {
    const rel = attrValue(tag.match(REL_RE))?.trim().toLowerCase();
    if (!rel || !ICON_RELS.has(rel)) continue;

    const href = attrValue(tag.match(HREF_RE));
    if (!href) continue;

    candidates.push({ href, rel, size: sizeOf(attrValue(tag.match(SIZES_RE))) });
  }

  return candidates;
}

/** Resolve `href` against `finalUrl`. `data:` URIs pass through unresolved. */
function resolveHref(href: string, finalUrl: string): string | undefined {
  if (/^data:/i.test(href)) return href;

  try {
    // `new URL` already resolves protocol-relative (`//host/x.ico`) hrefs
    // against the base URL's own protocol.
    return new URL(href, finalUrl).toString();
  } catch {
    return undefined;
  }
}

/**
 * Resolve the favicon URL for a page.
 *
 * Prefers the page's own declared icon (`<link rel="icon">`, `"shortcut icon"`,
 * or `"apple-touch-icon"`), picking the candidate with the largest declared
 * `sizes` (ties and undeclared sizes keep document order). Falls back to
 * `/favicon.ico` at the origin when nothing is declared or `html` is missing.
 *
 * Never makes a network request — a malformed or absent `sizes`/`href` degrades
 * gracefully rather than throwing.
 */
export function resolveFavicon(html: string | undefined, finalUrl: string): string | undefined {
  const candidates = html ? declaredIcons(html) : [];

  if (candidates.length > 0) {
    let best = candidates[0]!;
    for (const candidate of candidates.slice(1)) {
      if (candidate.size > best.size) best = candidate;
    }
    const resolved = resolveHref(best.href, finalUrl);
    if (resolved) return resolved;
  }

  try {
    const origin = new URL(finalUrl);
    return new URL('/favicon.ico', origin).toString();
  } catch {
    return undefined;
  }
}
