import type { Format } from '@/lib/api';

/**
 * The format picker's cards. Every id is one the API validates
 * (apps/api/src/routes/scrape.ts FORMATS); formats the spec names but nothing
 * serves yet (summary, images, pdf) are deliberately absent.
 */
export interface FormatVariant {
  id: Format;
  label: string;
}

export type FormatIllustration = 'page' | 'html' | 'text' | 'list' | 'viewport' | 'braces' | 'chunks';

export interface FormatCard {
  id: string;
  label: string;
  /** Selecting the card selects `variants[0]`; the variant row switches or adds. */
  variants: readonly FormatVariant[];
  illustration: FormatIllustration;
  /** One line under the name when the format needs something set elsewhere. */
  hint?: string;
}

export const FORMAT_CARDS: readonly FormatCard[] = [
  { id: 'markdown', label: 'Markdown', variants: [{ id: 'markdown', label: 'Markdown' }], illustration: 'page' },
  { id: 'html', label: 'HTML', variants: [{ id: 'html', label: 'Cleaned' }, { id: 'rawHtml', label: 'Raw' }], illustration: 'html' },
  { id: 'text', label: 'Text', variants: [{ id: 'text', label: 'Text' }], illustration: 'text' },
  { id: 'links', label: 'Links', variants: [{ id: 'links', label: 'Links' }], illustration: 'list' },
  { id: 'screenshot', label: 'Screenshot', variants: [{ id: 'screenshot', label: 'Screenshot' }], illustration: 'viewport' },
  { id: 'json', label: 'JSON', variants: [{ id: 'json', label: 'JSON' }], illustration: 'braces', hint: 'Schema in Options' },
  { id: 'chunks', label: 'Chunks', variants: [{ id: 'chunks', label: 'Chunks' }], illustration: 'chunks' },
];

export const DEFAULT_FORMATS: readonly Format[] = ['markdown'];

const LABELS: Record<Format, string> = {
  markdown: 'Markdown',
  html: 'Cleaned HTML',
  rawHtml: 'Raw HTML',
  text: 'Text',
  links: 'Links',
  screenshot: 'Screenshot',
  json: 'JSON',
  chunks: 'Chunks',
};

export function formatLabel(id: Format): string {
  return LABELS[id];
}

/** "Markdown", "Markdown +2", or "None" for the toolbar button. */
export function summarizeFormats(formats: readonly Format[]): string {
  const first = formats[0];
  if (!first) return 'None';
  return formats.length === 1 ? LABELS[first] : `${LABELS[first]} +${formats.length - 1}`;
}

/** Toggles one id, keeping catalog order so the summary is stable. */
export function toggleFormat(formats: readonly Format[], id: Format): Format[] {
  const next = formats.includes(id) ? formats.filter((f) => f !== id) : [...formats, id];
  const order = FORMAT_CARDS.flatMap((c) => c.variants.map((v) => v.id));
  return order.filter((f) => next.includes(f));
}
