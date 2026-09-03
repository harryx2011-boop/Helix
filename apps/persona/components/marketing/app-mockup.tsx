'use client';

import { useEffect, useRef, useState } from 'react';

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 800;

/**
 * Flat browser-window mockup containing a real, interactive iframe of the
 * app at /roles, scaled to fit from a fixed design surface via a
 * ResizeObserver (PERSONA.md §3, PRD §3).
 */
export function AppMockup() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? DESIGN_WIDTH;
      setScale(width / DESIGN_WIDTH);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <figure className="mx-auto w-full max-w-4xl">
      <div className="overflow-hidden rounded-panel border border-p-line bg-p-surface shadow-panel">
        <div className="flex items-center gap-1.5 border-b border-p-line px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-p-line-2" />
          <span className="h-2.5 w-2.5 rounded-full bg-p-line-2" />
          <span className="h-2.5 w-2.5 rounded-full bg-p-line-2" />
          <span className="ml-3 truncate rounded-md bg-p-code px-2.5 py-1 font-mono text-[11px] text-p-ink-3">
            persona-helix.vercel.app/roles
          </span>
        </div>
        <div ref={wrapperRef} className="relative w-full overflow-hidden bg-p-bg" style={{ aspectRatio: `${DESIGN_WIDTH} / ${DESIGN_HEIGHT}` }}>
          <iframe
            src="/roles"
            title="Persona library"
            loading="lazy"
            style={{
              width: DESIGN_WIDTH,
              height: DESIGN_HEIGHT,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              border: 'none',
            }}
          />
        </div>
      </div>
      <figcaption className="mt-4 text-center text-sm text-p-ink-3">The real app. Click around.</figcaption>
    </figure>
  );
}
