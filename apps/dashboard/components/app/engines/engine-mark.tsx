'use client';

import { Server } from 'lucide-react';

/**
 * `plain` and `tls` are Helix's own transports, not products, so they get a
 * lucide glyph. Every other tier is a real browser and shows that browser's
 * actual mark — a monogram would misname the engine a request is running on.
 *
 * The Chromium mark is the monochrome-blue one, deliberately not Chrome's
 * four-colour logo: they are different products and the tier runs Chromium.
 */
const MARKED = new Set(['chromium', 'firefox', 'webkit', 'camoufox', 'lightpanda']);

export function EngineMark({ engine, size = 20, className }: { engine: string; size?: number; className?: string }) {
  if (!MARKED.has(engine)) {
    return (
      <span
        className={`flex items-center justify-center rounded-card bg-muted text-muted-foreground ${className ?? ''}`}
        style={{ width: size, height: size }}
      >
        <Server style={{ width: size * 0.7, height: size * 0.7 }} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static favicon-sized PNG, no next/image benefit
    <img src={`/engines/${engine}.png`} alt="" width={size} height={size} className={`rounded-card ${className ?? ''}`} />
  );
}
