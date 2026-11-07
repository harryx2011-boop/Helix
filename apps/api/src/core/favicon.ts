
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

function resolveHref(href: string, finalUrl: string): string | undefined {
  if (/^data:/i.test(href)) return href;

  try {
    return new URL(href, finalUrl).toString();
  } catch {
    return undefined;
  }
}

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
