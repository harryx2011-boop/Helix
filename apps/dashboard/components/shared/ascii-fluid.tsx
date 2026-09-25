'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useInView, useReducedMotion } from './ambient';
import { FIELD_TONE, type FieldTone } from './field-tone';

/*
 * AsciiFluid: a character field whose glyph density follows a slowly
 * drifting wave surface, so it reads as liquid rising and settling. Two
 * <pre> layers (ink for the body, violet for the crests) like AsciiHelix,
 * so the DOM cost is two nodes at any size. Deterministic first paint,
 * paused off-screen, static under reduced motion.
 */

const BODY = ' ..::--==++**##%%';
const CREST = 'X%#';

function hash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise on a 2-D lattice, lerped across an integer time step so it drifts rather than flickers. */
export function noise(x: number, y: number, t: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const t0 = Math.floor(t);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const ft = smooth(t - t0);
  const at = (ts: number) => {
    const s = seed + ts * 7919;
    const a = hash(x0, y0, s);
    const b = hash(x0 + 1, y0, s);
    const c = hash(x0, y0 + 1, s);
    const d = hash(x0 + 1, y0 + 1, s);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
  return at(t0) * (1 - ft) + at(t0 + 1) * ft;
}

function fluidLayers(cols: number, rows: number, time: number, seed: number): [string, string] {
  const body = Array.from({ length: rows }, () => Array<string>(cols).fill(' '));
  const crest = Array.from({ length: rows }, () => Array<string>(cols).fill(' '));
  for (let x = 0; x < cols; x++) {
    const u = x / cols;
    const edge = Math.min(1, Math.min(u, 1 - u) * 3.2);
    const surface =
      0.34 +
      0.16 * Math.sin(u * Math.PI * 2 * 1.3 + time * 0.55 + seed) +
      0.1 * Math.sin(u * Math.PI * 2 * 3.1 - time * 0.8 + seed * 2) +
      0.12 * (noise(x * 0.18, 0, time * 0.4, seed) - 0.5);
    const height = Math.max(0.06, surface * edge);
    const top = rows * (1 - height);
    for (let y = 0; y < rows; y++) {
      const depth = (y - top) / Math.max(1, rows - top);
      const n = noise(x * 0.45, y * 0.6, time * 0.9, seed + 11);
      if (depth < 0) {
        if (depth > -0.25 && n > 0.8) body[y]![x] = n > 0.9 ? ':' : '.';
        continue;
      }
      const v = Math.min(1, depth * 0.85 + (n - 0.5) * 0.5);
      if (depth < 0.22 && n > 0.62) {
        crest[y]![x] = CREST[Math.floor((n - 0.62) / 0.38 * CREST.length) % CREST.length]!;
        continue;
      }
      const idx = Math.max(1, Math.min(BODY.length - 1, Math.floor(v * (BODY.length - 1))));
      body[y]![x] = BODY[idx]!;
    }
  }
  const join = (g: string[][]) => g.map((r) => r.join('')).join('\n');
  return [join(body), join(crest)];
}

export interface AsciiFluidProps {
  cols?: number;
  rows?: number;
  seed?: number;
  fps?: number;
  quiet?: boolean;
  className?: string;
  tone?: FieldTone;
}

export function AsciiFluid({ cols = 40, rows = 12, seed = 3, fps = 10, quiet, className, tone = 'marketing' }: AsciiFluidProps) {
  const t = FIELD_TONE[tone];
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const [layers, setLayers] = React.useState<[string, string]>(() => fluidLayers(cols, rows, 0, seed));
  const tickRef = React.useRef(0);
  const running = inView && !reduced && !quiet;

  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      tickRef.current += 1;
      setLayers(fluidLayers(cols, rows, tickRef.current / fps, seed));
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [running, cols, rows, seed, fps]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn('pointer-events-none relative select-none font-mono text-[11px] leading-[1.15]', className)}
    >
      <pre className={cn('whitespace-pre', t.body)}>{layers[0]}</pre>
      <pre className={cn('absolute inset-0 whitespace-pre', t.accent)}>{layers[1]}</pre>
    </div>
  );
}
