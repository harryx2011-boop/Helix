/**
 * The Helix mark: three isometric plates descending from violet to the ground
 * colour, with the wordmark alongside.
 *
 * Inlined rather than loaded as an `<img>` so the bottom plate and the wordmark
 * can take `currentColor`. In the source SVG both are the near-black `#0B1220`,
 * which would disappear against the dark theme's background — the plate has to
 * follow the foreground rather than stay fixed.
 *
 * The two violets are brand constants and do not vary by theme.
 */
export function Logo({ className, markOnly = false }: { className?: string; markOnly?: boolean }) {
  if (markOnly) {
    return (
      <svg viewBox="30 20 80 100" className={className} role="img" aria-label="Helix" fill="none">
        <path d="M70,26 L104,44 L70,62 L36,44 Z" fill="#8B5CF6" />
        <path d="M70,52 L100,70 L70,88 L40,70 Z" fill="#5B21B6" />
        <path d="M70,78 L104,96 L70,114 L36,96 Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 330 140" className={className} role="img" aria-label="Helix" fill="none">
      <path d="M70,26 L104,44 L70,62 L36,44 Z" fill="#8B5CF6" />
      <path d="M70,52 L100,70 L70,88 L40,70 Z" fill="#5B21B6" />
      <path d="M70,78 L104,96 L70,114 L36,96 Z" fill="currentColor" />
      <text
        x="128"
        y="92"
        fontFamily="var(--font-geist-sans, Geist, ui-sans-serif, sans-serif)"
        fontSize="62"
        fontWeight="500"
        letterSpacing="-2.5"
        fill="currentColor"
      >
        Helix
      </text>
    </svg>
  );
}
