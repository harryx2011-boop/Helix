/**
 * Instructure Canvas mark — the ring of eight arcs around eight dots.
 *
 * Traced from the mark served by `canvas.instructure.com/favicon.ico`, NOT
 * `instructure.com`, which serves the Instructure "I" wordmark instead; the two
 * differ (sha256 46bf05e4… vs a015a7ac…) and a favicon service asked for the
 * subdomain will happily walk up to the parent and return the wrong one with a
 * 200. Geometry is measured from that 64px source and expressed as fractions of
 * the outer radius: dot centres at 0.5352R, dot radius 0.0938R, arc band from
 * 0.7031R to R, eight-fold symmetry on 45° centres, each arc subtending 34°.
 *
 * Unlike `GithubMark` this does NOT default to `currentColor`: Canvas red is
 * part of the mark's identity, and a third-party logo recoloured to match our
 * palette is no longer that brand's logo. `mono` is the opt-out for places that
 * genuinely need a single-colour glyph (a dense list, a print sheet).
 *
 * Below ~20px the dots and gaps stop resolving, so `IconTile`-sized renders
 * (16px) get `CanvasMarkCompact` instead — the same silhouette with the counters
 * dropped rather than a blurred version of this one.
 *
 * Instructure and Canvas are trademarks of Instructure, Inc. Used to identify
 * the product these tools talk to; Helix is not affiliated with or endorsed by
 * Instructure.
 */

/** Canvas brand red, sampled from the source mark. */
export const CANVAS_RED = '#E63D2F';

export interface CanvasMarkProps {
  className?: string;
  /** Render in `currentColor` instead of Canvas red. Use sparingly — see above. */
  mono?: boolean;
  /** Ignored; accepted so the component is drop-in where a Lucide glyph was. */
  strokeWidth?: number;
}

export function CanvasMark({ className, mono = false }: CanvasMarkProps) {
  return (
    <svg viewBox="0 0 128 128" className={className} fill={mono ? 'currentColor' : CANVAS_RED} aria-hidden="true">
      <path d="M107.03 50.84A45.00 45.00 0 0 1 107.03 77.16L125.20 82.71A64.00 64.00 0 0 0 125.20 45.29Z" />
      <path d="M103.73 85.13A45.00 45.00 0 0 1 85.13 103.73L94.05 120.51A64.00 64.00 0 0 0 120.51 94.05Z" />
      <path d="M77.16 107.03A45.00 45.00 0 0 1 50.84 107.03L45.29 125.20A64.00 64.00 0 0 0 82.71 125.20Z" />
      <path d="M42.87 103.73A45.00 45.00 0 0 1 24.27 85.13L7.49 94.05A64.00 64.00 0 0 0 33.95 120.51Z" />
      <path d="M20.97 77.16A45.00 45.00 0 0 1 20.97 50.84L2.80 45.29A64.00 64.00 0 0 0 2.80 82.71Z" />
      <path d="M24.27 42.87A45.00 45.00 0 0 1 42.87 24.27L33.95 7.49A64.00 64.00 0 0 0 7.49 33.95Z" />
      <path d="M50.84 20.97A45.00 45.00 0 0 1 77.16 20.97L82.71 2.80A64.00 64.00 0 0 0 45.29 2.80Z" />
      <path d="M85.13 24.27A45.00 45.00 0 0 1 103.73 42.87L120.51 33.95A64.00 64.00 0 0 0 94.05 7.49Z" />
      <circle cx="98.25" cy="64.00" r="6.00" />
      <circle cx="88.22" cy="88.22" r="6.00" />
      <circle cx="64.00" cy="98.25" r="6.00" />
      <circle cx="39.78" cy="88.22" r="6.00" />
      <circle cx="29.75" cy="64.00" r="6.00" />
      <circle cx="39.78" cy="39.78" r="6.00" />
      <circle cx="64.00" cy="29.75" r="6.00" />
      <circle cx="88.22" cy="39.78" r="6.00" />
    </svg>
  );
}

/**
 * The mark at nav-glyph sizes (≤20px), where the eight dots and the gaps between
 * arcs fall below one device pixel and turn to mush. Keeps the ring silhouette
 * and the eight arcs, drops the inner dots.
 */
export function CanvasMarkCompact({ className, mono = false }: CanvasMarkProps) {
  return (
    <svg viewBox="0 0 128 128" className={className} fill={mono ? 'currentColor' : CANVAS_RED} aria-hidden="true">
      <path d="M107.03 50.84A45.00 45.00 0 0 1 107.03 77.16L125.20 82.71A64.00 64.00 0 0 0 125.20 45.29Z" />
      <path d="M103.73 85.13A45.00 45.00 0 0 1 85.13 103.73L94.05 120.51A64.00 64.00 0 0 0 120.51 94.05Z" />
      <path d="M77.16 107.03A45.00 45.00 0 0 1 50.84 107.03L45.29 125.20A64.00 64.00 0 0 0 82.71 125.20Z" />
      <path d="M42.87 103.73A45.00 45.00 0 0 1 24.27 85.13L7.49 94.05A64.00 64.00 0 0 0 33.95 120.51Z" />
      <path d="M20.97 77.16A45.00 45.00 0 0 1 20.97 50.84L2.80 45.29A64.00 64.00 0 0 0 2.80 82.71Z" />
      <path d="M24.27 42.87A45.00 45.00 0 0 1 42.87 24.27L33.95 7.49A64.00 64.00 0 0 0 7.49 33.95Z" />
      <path d="M50.84 20.97A45.00 45.00 0 0 1 77.16 20.97L82.71 2.80A64.00 64.00 0 0 0 45.29 2.80Z" />
      <path d="M85.13 24.27A45.00 45.00 0 0 1 103.73 42.87L120.51 33.95A64.00 64.00 0 0 0 94.05 7.49Z" />
    </svg>
  );
}
