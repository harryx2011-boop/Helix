'use client';

import { motion, useReducedMotion } from 'framer-motion';

export interface CursorKeyframes {
  x: number[];
  y: number[];
  times: number[];
  /** Indices into `times` where the cursor should pulse (a click). */
  clicksAt?: number[];
  duration: number;
}

/**
 * A single reusable cursor puck animated through explicit x/y keyframes with
 * matching `times`, plus a click pulse ring at named keyframe indices. Used
 * by every looping browser-window mockup so the "hand on the mouse" feel is
 * identical across the search, wizard and editor demos.
 */
export function AnimatedCursor({ frames, loop = true }: { frames: CursorKeyframes; loop?: boolean }) {
  const reduced = useReducedMotion();
  if (reduced) return null;

  const clickTimes = (frames.clicksAt ?? []).map((i) => frames.times[i]!);

  return (
    <motion.div
      className="pointer-events-none absolute left-0 top-0 z-10"
      animate={{ x: frames.x, y: frames.y }}
      transition={{
        duration: frames.duration,
        times: frames.times,
        repeat: loop ? Infinity : 0,
        ease: 'easeInOut',
      }}
    >
      <CursorGlyph />
      {clickTimes.map((t, i) => (
        <motion.span
          key={i}
          className="absolute left-[3px] top-[2px] h-3 w-3 rounded-full border border-p-ink/50"
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: [0, 0.5, 0], scale: [0.4, 1.6, 1.6] }}
          transition={{
            duration: 0.5,
            repeat: loop ? Infinity : 0,
            repeatDelay: frames.duration - 0.5,
            delay: t * frames.duration,
            ease: 'easeOut',
          }}
        />
      ))}
    </motion.div>
  );
}

function CursorGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 1.5 13.5 8 8 9.2 6 14.5 2 1.5Z" fill="var(--p-ink)" stroke="var(--p-surface)" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}
