'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 800;

/**
 * Flat browser-window mockup containing a real, interactive iframe of the
 * app at /roles, scaled to fit from a fixed design surface via a
 * ResizeObserver (PERSONA.md §3, PRD §3). Scroll parallax + scale-in as it
 * enters the viewport; transform/opacity only, off the main thread.
 */
export function AppMockup() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const reduced = useReducedMotion();

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

  const { scrollYProgress } = useScroll({ target: figureRef, offset: ['start end', 'start center'] });
  const enterScale = useTransform(scrollYProgress, [0, 1], [0.96, 1]);
  const enterOpacity = useTransform(scrollYProgress, [0, 1], [0.6, 1]);
  const parallaxY = useTransform(scrollYProgress, [0, 1], [24, 0]);

  return (
    <motion.figure
      ref={figureRef}
      className="mx-auto w-full max-w-4xl"
      style={reduced ? {} : { scale: enterScale, opacity: enterOpacity, y: parallaxY }}
    >
      <div className="overflow-hidden rounded-panel border border-p-line bg-p-surface shadow-panel ring-1 ring-p-highlight">
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
    </motion.figure>
  );
}
