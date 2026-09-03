'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type PillRole = { word: string; color: string };

export const DEFAULT_PILL_ROLES: PillRole[] = [
  { word: 'Support', color: '#2F6FE4' },
  { word: 'Sales', color: '#D9762C' },
  { word: 'Security', color: '#C6402E' },
  { word: 'FinOps', color: '#1E8E5A' },
  { word: 'HR', color: '#8B5CF6' },
  { word: 'DevRel', color: '#0EA5A5' },
];

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface RolePillProps {
  roles?: PillRole[];
  /** ms between word changes */
  interval?: number;
  className?: string;
}

/**
 * Inline animated pill for the hero headline: cycles through role names,
 * each with a matched tint/dot/text color. The pill word stands in for
 * {{ROLE}}, foreshadowing the templating engine (PERSONA.md §3).
 */
export function RolePill({ roles = DEFAULT_PILL_ROLES, interval = 1800, className = '' }: RolePillProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % roles.length);
    }, interval);
    return () => clearInterval(id);
  }, [interval, roles.length]);

  const role = roles[index] ?? roles[0]!;

  return (
    <motion.span
      layout
      transition={{ layout: { duration: 0.3, ease: 'easeInOut' } }}
      className={`inline-flex items-center gap-3 rounded-pill px-6 py-2 align-middle ${className}`}
      animate={{ backgroundColor: hexToRgba(role.color, 0.12) }}
      style={{ transition: 'background-color 0.35s ease' }}
    >
      <motion.span
        key={`dot-${role.word}`}
        className="h-[0.32em] w-[0.32em] shrink-0 rounded-full"
        style={{ backgroundColor: role.color }}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
      <AnimatePresence mode="wait">
        <motion.span
          key={role.word}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="font-mono font-semibold text-[0.82em] leading-none"
          style={{ color: role.color }}
        >
          {role.word}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}
