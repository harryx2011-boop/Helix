'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useInView, useReducedMotion } from './ambient';

/*
 * Water, in the same idiom as AsciiHelix: a glyph field recomputed by one
 * throttled ticker, paused off-screen, a settled deterministic frame under
 * reduced motion, and a seeded first paint so server and client agree. Two
 * layers — an ink field and violet crests — stacked as absolutely positioned
 * <pre> blocks so the crests read as sitting on top of the swell.
 */

const FPS = 12;

/** Glyphs by surface height, low to high. */
const SURFACE = [' ', '.', '·', '~', '≈', '∿'] as const;

function surfaceGlyph(v: number): string {
  if (v < 0.34) return SURFACE[0];
  if (v < 0.48) return SURFACE[1];
  if (v < 0.6) return SURFACE[2];
  if (v < 0.74) return SURFACE[3];
  if (v < 0.86) return SURFACE[4];
  return SURFACE[5];
}

/**
 * Three sines at unrelated frequencies, so the swell never visibly repeats
 * within a session. `depth` weights near rows heavier than far ones, which is
 * what makes a flat character grid read as a surface receding from the viewer.
 */
function height(x: number, y: number, t: number, seed: number): number {
  const h =
    0.55 * Math.sin(x * 0.16 + t * 1.1 + seed) +
    0.3 * Math.sin(x * 0.061 - t * 0.7 + y * 0.55) +
    0.15 * Math.sin((x + y) * 0.12 + t * 1.6);
  return (h + 1) / 2;
}

function oceanLayers(cols: number, rows: number, tick: number, seed: number): [string, string] {
  const t = tick * 0.12;
  const back: string[] = [];
  const front: string[] = [];
  for (let y = 0; y < rows; y++) {
    const depth = rows > 1 ? y / (rows - 1) : 1;
    let b = '';
    let f = '';
    for (let x = 0; x < cols; x++) {
      const v = height(x, y, t, seed) * (0.55 + 0.45 * depth);
      if (v > 0.82) {
        // A crest: drawn only on the front layer, so the two never overprint.
        f += v > 0.9 ? '∿' : '~';
        b += ' ';
      } else {
        f += ' ';
        b += surfaceGlyph(v);
      }
    }
    back.push(b);
    front.push(f);
  }
  return [back.join('\n'), front.join('\n')];
}

export interface AsciiOceanProps {
  cols?: number;
  rows?: number;
  seed?: number;
  quiet?: boolean;
  className?: string;
}

/** A band of swell with travelling crests. Sized by cols/rows; overflow is hidden, so oversize it and centre it. */
export function AsciiOcean({ cols = 200, rows = 9, seed = 2, quiet, className }: AsciiOceanProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const [layers, setLayers] = React.useState<[string, string]>(() => oceanLayers(cols, rows, 0, seed));
  const tickRef = React.useRef(0);
  const running = inView && !reduced && !quiet;

  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      tickRef.current += 1;
      setLayers(oceanLayers(cols, rows, tickRef.current, seed));
    }, 1000 / FPS);
    return () => clearInterval(id);
  }, [running, cols, rows, seed]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn('pointer-events-none flex select-none justify-center overflow-hidden font-mono text-[11px] leading-[1.15]', className)}
    >
      <div className="relative">
        <pre className="whitespace-pre text-m-ink/24">{layers[0]}</pre>
        <pre className="absolute inset-0 whitespace-pre text-violet-48">{layers[1]}</pre>
      </div>
    </div>
  );
}

function waveLayers(cols: number, rows: number, tick: number, seed: number): [string, string] {
  const t = tick * 0.14;
  const centre = (rows - 1) / 2;
  const amp = Math.max(1, (rows - 1) / 2 - 0.5);
  const back = Array.from({ length: rows }, () => Array<string>(cols).fill(' '));
  const front = Array.from({ length: rows }, () => Array<string>(cols).fill(' '));

  for (let x = 0; x < cols; x++) {
    const phase = x * 0.22 + t * 1.4 + seed;
    const y = Math.round(centre + amp * Math.sin(phase));
    const next = Math.round(centre + amp * Math.sin(phase + 0.22));
    // The glyph follows the slope, so the line reads as drawn rather than dotted.
    const glyph = next < y ? '/' : next > y ? '\\' : '~';
    if (y >= 0 && y < rows) front[y]![x] = glyph;
    // A sparse trail one row under the crest, so the wave has a body.
    if (x % 3 === 0 && y + 1 < rows) back[y + 1]![x] = '·';
  }
  const join = (g: string[][]) => g.map((r) => r.join('')).join('\n');
  return [join(back), join(front)];
}

export interface AsciiWaveProps {
  cols?: number;
  rows?: number;
  seed?: number;
  quiet?: boolean;
  className?: string;
}

/** A single travelling sine drawn in glyphs — the wave, as distinct from the ocean's field. */
export function AsciiWave({ cols = 64, rows = 7, seed = 1, quiet, className }: AsciiWaveProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const [layers, setLayers] = React.useState<[string, string]>(() => waveLayers(cols, rows, 0, seed));
  const tickRef = React.useRef(0);
  const running = inView && !reduced && !quiet;

  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      tickRef.current += 1;
      setLayers(waveLayers(cols, rows, tickRef.current, seed));
    }, 1000 / FPS);
    return () => clearInterval(id);
  }, [running, cols, rows, seed]);

  return (
    <div ref={ref} aria-hidden="true" className={cn('pointer-events-none relative select-none font-mono text-[11px] leading-[1.15]', className)}>
      <pre className="whitespace-pre text-m-ink/24">{layers[0]}</pre>
      <pre className="absolute inset-0 whitespace-pre text-violet-48">{layers[1]}</pre>
    </div>
  );
}
