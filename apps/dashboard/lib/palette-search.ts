import type { LucideIcon } from 'lucide-react';

export type PaletteGroup = 'recent' | 'navigate' | 'actions' | 'docs' | 'keys' | 'monitors' | 'jobs';

export const GROUP_ORDER: readonly PaletteGroup[] = ['recent', 'navigate', 'actions', 'docs', 'keys', 'monitors', 'jobs'];

export const GROUP_LABELS: Record<PaletteGroup, string> = {
  recent: 'Recent runs',
  navigate: 'Go to',
  actions: 'Actions',
  docs: 'Docs',
  keys: 'API keys',
  monitors: 'Monitors',
  jobs: 'Jobs',
};

export interface PaletteItem {
  id: string;
  group: PaletteGroup;
  title: string;
  subtitle?: string;
  meta?: string;
  keywords?: readonly string[];
  /** Lowercased prose; matched last and weakest, so a page that mentions "crawl" ranks under the Crawl route. */
  body?: string;
  icon: LucideIcon;
  run: () => void | Promise<void>;
}

/** One entry of `/search-index.json`, built from the markdown twins at build time. */
export interface DocIndexEntry {
  path: string;
  href: string;
  kind: 'capability' | 'docs';
  title: string;
  description: string;
  headings: string[];
  body: string;
}

export interface PaletteSection {
  group: PaletteGroup;
  items: PaletteItem[];
}

export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokens(query: string): string[] {
  return normalize(query).split(' ').filter(Boolean);
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i += 1;
    if (i === needle.length) return true;
  }
  return needle.length === 0;
}

/**
 * Higher is better; 0 is no match. The ladder is deliberate: a title equal to
 * the query beats one that starts with it, which beats one that contains it,
 * and any of those beats a keyword hit, which beats a fuzzy subsequence, which
 * beats a body mention. Body matching only counts tokens of three characters
 * or more, or "how do i use crawl" would match every page on "i" and "do".
 */
export function scoreItem(item: PaletteItem, query: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const toks = tokens(q);
  const title = normalize(item.title);
  const aux = normalize([item.subtitle ?? '', ...(item.keywords ?? [])].join(' '));

  let score = 0;
  if (title === q) score = 100;
  else if (title.startsWith(q)) score = 85;
  else if (title.includes(q)) score = 70;
  else if (toks.every((t) => title.includes(t))) score = 60;
  else if (aux.includes(q)) score = 50;
  else if (toks.every((t) => title.includes(t) || aux.includes(t))) score = 40;
  else if (q.length >= 3 && isSubsequence(q.replace(/ /g, ''), title)) score = 25;

  const body = item.body;
  if (body) {
    // A body hit that also names the page ("crawl" in "Web Crawling API")
    // outranks the same words in a neighbouring page's prose. Title only:
    // every endpoint doc shares a "When to use it" heading, so a keyword hit
    // on "use" would hand the same bonus to all of them.
    const meaningful = toks.filter((t) => t.length >= 3);
    const named = meaningful.some((t) => title.includes(t)) ? 5 : 0;
    if (body.includes(q)) {
      score = Math.max(score, 35 + named);
    } else {
      const hits = meaningful.filter((t) => body.includes(t)).length;
      if (hits > 0 && hits === meaningful.length) score = Math.max(score, 30 + named);
      else if (hits > 0 && hits >= Math.ceil(meaningful.length / 2)) score = Math.max(score, 18 + named);
    }
  }
  return score;
}

/**
 * Sections in display order. With a query, the section holding the best match
 * leads, so "crawl" opens on the Crawl route while "how do i use crawl" opens
 * on the Crawl docs. Ties keep the canonical order.
 */
export function search(items: readonly PaletteItem[], query: string, perGroup: number): PaletteSection[] {
  const scored = items
    .map((item, index) => ({ item, index, score: scoreItem(item, query) }))
    .filter((s) => s.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        GROUP_ORDER.indexOf(a.item.group) - GROUP_ORDER.indexOf(b.item.group) ||
        a.index - b.index,
    );

  const sections = new Map<PaletteGroup, { best: number; items: PaletteItem[] }>();
  for (const s of scored) {
    const section = sections.get(s.item.group) ?? { best: s.score, items: [] };
    if (section.items.length < perGroup) section.items.push(s.item);
    sections.set(s.item.group, section);
  }
  return [...sections.entries()]
    .sort(([ga, a], [gb, b]) => b.best - a.best || GROUP_ORDER.indexOf(ga) - GROUP_ORDER.indexOf(gb))
    .map(([group, section]) => ({ group, items: section.items }));
}
