import type { LucideIcon } from '@/components/icons/lucide';

/**
 * What `IconTile` and the nav rows accept as a glyph.
 *
 * Lucide ships no brand icons, so a row that must show a third-party mark
 * (`GithubMark`) cannot be typed `LucideIcon`. Widening to any
 * component taking `className` covers both; `strokeWidth` is optional because
 * `IconTile` passes it and a hand-drawn mark has no use for it.
 */
export type GlyphIcon = LucideIcon | ((props: { className?: string; strokeWidth?: number }) => React.JSX.Element);
