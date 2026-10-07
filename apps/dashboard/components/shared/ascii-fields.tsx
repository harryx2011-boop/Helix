'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useInView, useReducedMotion } from './ambient';
import { noise } from './ascii-fluid';
import { FIELD_TONE, type FieldTone } from './field-tone';

/*
 * Three more character fields, each a different motion so the page does not
 * repeat one motif. All share the contract of AsciiHelix and AsciiFluid: two
 * <pre> layers, deterministic first paint, paused off-screen, static under
 * reduced motion, and a tick rate low enough to read as ambient texture.
 */

function useTicker(running: boolean, fps: number): number {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000 / fps);
    return () => clearInterval(id);
  }, [running, fps]);
  return tick;
}

function join(g: string[][]): string {
  return g.map((r) => r.join('')).join('\n');
}

interface FieldProps {
  cols?: number;
  rows?: number;
  seed?: number;
  fps?: number;
  quiet?: boolean;
  className?: string;
  /** `app` swaps the marketing ink tokens for the dark surface's foreground and primary. */
  tone?: FieldTone;
}

function Field({
  layers,
  className,
  fieldRef,
  tone = 'marketing',
}: {
  layers: [string, string];
  className?: string | undefined;
  fieldRef: React.RefObject<HTMLDivElement | null>;
  tone?: FieldTone | undefined;
}) {
  const t = FIELD_TONE[tone];
  return (
    <div
      ref={fieldRef}
      aria-hidden="true"
      className={cn('pointer-events-none relative select-none font-mono text-[11px] leading-[1.15]', className)}
    >
      <pre className={cn('whitespace-pre', t.body)}>{layers[0]}</pre>
      <pre className={cn('absolute inset-0 whitespace-pre', t.accent)}>{layers[1]}</pre>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* AsciiNoise: a domain-warped value-noise cloud. Glyph weight follows the  */
/* field, so dense and sparse regions drift and fold into each other like  */
/* smoke. Meant for wide backgrounds; mask it at the edges where it mounts. */
/* ---------------------------------------------------------------------- */

const CLOUD = '   .·:-=+*#%';

function cloudLayers(cols: number, rows: number, time: number, seed: number): [string, string] {
  const body = Array.from({ length: rows }, () => Array<string>(cols).fill(' '));
  const hot = Array.from({ length: rows }, () => Array<string>(cols).fill(' '));
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const wx = noise(x * 0.07, y * 0.12, time * 0.25, seed + 3) * 4;
      const wy = noise(x * 0.07 + 9, y * 0.12, time * 0.25, seed + 5) * 3;
      const v = noise(x * 0.11 + wx, y * 0.19 + wy, time * 0.35, seed);
      const w = v * v * 1.35;
      if (w > 0.62 && noise(x * 0.9, y * 0.9, time, seed + 7) > 0.7) {
        hot[y]![x] = w > 0.8 ? '#' : '*';
        continue;
      }
      const idx = Math.min(CLOUD.length - 1, Math.floor(w * CLOUD.length));
      body[y]![x] = CLOUD[idx]!;
    }
  }
  return [join(body), join(hot)];
}

export function AsciiNoise({ cols = 90, rows = 18, seed = 3, fps = 8, quiet, className, tone }: FieldProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const tick = useTicker(inView && !reduced && !quiet, fps);
  const layers = React.useMemo(() => cloudLayers(cols, rows, tick / fps, seed), [cols, rows, tick, fps, seed]);
  return <Field layers={layers} className={className} fieldRef={ref} tone={tone} />;
}

/* ---------------------------------------------------------------------- */
/* AsciiFlow: particles carried by a slowly turning vector field, leaving   */
/* trails that decay into lighter glyphs. Reads as streamlines in a fluid.  */
/* ---------------------------------------------------------------------- */

const TRAIL = ' .:-=+*#';
const PARTICLES = 120;
const TRAIL_DECAY = 0.96;

interface Particle {
  x: number;
  y: number;
}

function seedParticles(cols: number, rows: number, seed: number): Particle[] {
  return Array.from({ length: PARTICLES }, (_, i) => ({
    x: noise(i * 3.7, 0.5, 0, seed + 21) * cols,
    y: noise(0.5, i * 3.7, 0, seed + 23) * rows,
  }));
}

export function AsciiFlow({ cols = 60, rows = 14, seed = 3, fps = 10, quiet, className, tone }: FieldProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const running = inView && !reduced && !quiet;
  const particles = React.useRef<Particle[]>(seedParticles(cols, rows, seed));
  const heat = React.useRef<Float32Array>(new Float32Array(cols * rows));
  const timeRef = React.useRef(0);

  const render = React.useCallback((): [string, string] => {
    const h = heat.current;
    const body = Array.from({ length: rows }, () => Array<string>(cols).fill(' '));
    const head = Array.from({ length: rows }, () => Array<string>(cols).fill(' '));
    for (let i = 0; i < h.length; i++) {
      const v = h[i]!;
      if (v <= 0.04) continue;
      const x = i % cols;
      const y = Math.floor(i / cols);
      body[y]![x] = TRAIL[Math.min(TRAIL.length - 1, Math.floor(v * (TRAIL.length - 1)))]!;
    }
    for (const p of particles.current) {
      const x = Math.floor(p.x);
      const y = Math.floor(p.y);
      if (x >= 0 && x < cols && y >= 0 && y < rows) head[y]![x] = '@';
    }
    return [join(body), join(head)];
  }, [cols, rows]);

  const step = React.useCallback(() => {
    const t = (timeRef.current += 1 / fps);
    const h = heat.current;
    for (let i = 0; i < h.length; i++) h[i] = h[i]! * TRAIL_DECAY;
    for (const p of particles.current) {
      const angle = noise(p.x * 0.045, p.y * 0.09, t * 0.15, seed) * Math.PI * 4;
      p.x += Math.cos(angle) * 0.8;
      p.y += Math.sin(angle) * 0.4;
      if (p.x < 0) p.x += cols;
      if (p.x >= cols) p.x -= cols;
      if (p.y < 0) p.y += rows;
      if (p.y >= rows) p.y -= rows;
      const i = Math.floor(p.y) * cols + Math.floor(p.x);
      if (i >= 0 && i < h.length) h[i] = 1;
    }
  }, [cols, rows, fps, seed]);

  const [layers, setLayers] = React.useState<[string, string]>(() => {
    for (let i = 0; i < 24; i++) step();
    return render();
  });

  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      step();
      setLayers(render());
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [running, fps, step, render]);

  return <Field layers={layers} className={className} fieldRef={ref} tone={tone} />;
}

/* ---------------------------------------------------------------------- */
/* AsciiOrbit: concentric rings of glyphs turning at different speeds, a    */
/* pulse of heavier characters travelling around each. The character cell  */
/* is taller than it is wide, so the x radius is stretched to read round.  */
/* ---------------------------------------------------------------------- */

const RING = ['·', '-', '=', '+'];
const ASPECT = 1.9;

function orbitLayers(cols: number, rows: number, time: number, seed: number): [string, string] {
  const body = Array.from({ length: rows }, () => Array<string>(cols).fill(' '));
  const pulse = Array.from({ length: rows }, () => Array<string>(cols).fill(' '));
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const radii = [2.2, 4.1, 6.2, 8.4].filter((r) => r < rows / 2 + 0.5);
  radii.forEach((r, ring) => {
    const steps = Math.floor(Math.PI * 2 * r * ASPECT);
    const spin = time * (ring % 2 === 0 ? 0.35 : -0.25) + seed;
    const pulseAt = ((time * 0.6 + ring * 0.7) % 1) * Math.PI * 2;
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * Math.PI * 2 + spin;
      const x = Math.round(cx + Math.cos(a) * r * ASPECT);
      const y = Math.round(cy + Math.sin(a) * r);
      if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
      let d = Math.abs(((a - pulseAt + Math.PI) % (Math.PI * 2)) - Math.PI);
      d = Math.min(d, Math.PI * 2 - d);
      if (d < 0.5) pulse[y]![x] = d < 0.2 ? '#' : '*';
      else body[y]![x] = RING[ring % RING.length]!;
    }
  });
  body[Math.round(cy)]![Math.round(cx)] = '+';
  return [join(body), join(pulse)];
}

export function AsciiOrbit({ cols = 34, rows = 17, seed = 3, fps = 8, quiet, className, tone }: FieldProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const tick = useTicker(inView && !reduced && !quiet, fps);
  const layers = React.useMemo(() => orbitLayers(cols, rows, tick / fps, seed), [cols, rows, tick, fps, seed]);
  return <Field layers={layers} className={className} fieldRef={ref} tone={tone} />;
}

/* ---------------------------------------------------------------------- */
/* AsciiSegments: eight arc segments with gaps between them, turning as one */
/* body while a highlight travels the ring. Eight arcs on 45° centres read  */
/* as a segmented band, distinct from `orbit`, which is continuous rings.   */
/* ---------------------------------------------------------------------- */

const SEG = ['·', '-', '=', '+'];
/** Fraction of each 45° cell that is ink; the rest is the gap. Matches the mark's 34°/45°. */
const SEG_DUTY = 34 / 45;

function segmentLayers(cols: number, rows: number, time: number, seed: number): [string, string] {
  const body = Array.from({ length: rows }, () => Array<string>(cols).fill(' '));
  const hot = Array.from({ length: rows }, () => Array<string>(cols).fill(' '));
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const bands = [3.0, 5.4, 7.8].filter((r) => r < rows / 2 + 0.5);
  const sweep = ((time * 0.18 + seed * 0.11) % 1) * Math.PI * 2;

  bands.forEach((r, band) => {
    const steps = Math.max(8, Math.floor(Math.PI * 2 * r * ASPECT));
    // Outer bands lag, so the ring reads as one body with depth rather than
    // three independent spinners.
    const spin = time * (0.22 - band * 0.05) + seed * 0.37;
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * Math.PI * 2 + spin;
      // Position within this segment's 45° cell; outside the duty cycle is gap.
      const cell = (((a % (Math.PI / 4)) + Math.PI / 4) % (Math.PI / 4)) / (Math.PI / 4);
      if (cell > SEG_DUTY) continue;
      const x = Math.round(cx + Math.cos(a) * r * ASPECT);
      const y = Math.round(cy + Math.sin(a) * r);
      if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
      let d = Math.abs(((a - sweep + Math.PI) % (Math.PI * 2)) - Math.PI);
      d = Math.min(d, Math.PI * 2 - d);
      if (d < 0.42) hot[y]![x] = d < 0.18 ? '#' : '*';
      else body[y]![x] = SEG[band % SEG.length]!;
    }
  });

  // The eight inner dots, on the same 45° centres as the segments.
  const dotR = 1.5;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + time * 0.22 + seed * 0.37;
    const x = Math.round(cx + Math.cos(a) * dotR * ASPECT);
    const y = Math.round(cy + Math.sin(a) * dotR);
    if (x >= 0 && x < cols && y >= 0 && y < rows) body[y]![x] = 'o';
  }
  return [join(body), join(hot)];
}

export function AsciiSegments({ cols = 44, rows = 17, seed = 3, fps = 8, quiet, className, tone }: FieldProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const tick = useTicker(inView && !reduced && !quiet, fps);
  const layers = React.useMemo(() => segmentLayers(cols, rows, tick / fps, seed), [cols, rows, tick, fps, seed]);
  return <Field layers={layers} className={className} fieldRef={ref} tone={tone} />;
}
