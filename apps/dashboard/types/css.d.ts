/**
 * Ambient type for a dynamically `import()`-ed plain stylesheet — Next's
 * bundler code-splits it into its own chunk; `next/types/global.d.ts` only
 * covers `*.module.css` (CSS Modules), not this side-effect-only shape.
 * Used to lazy-load KaTeX's CSS only on a page that renders math.
 */
declare module '*.min.css' {
  const noop: undefined;
  export default noop;
}
