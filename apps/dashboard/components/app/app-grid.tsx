'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * Dark-token port of the marketing GridCells/PixelSquares techniques
 * (components/marketing/ambient.tsx) for the /app surface: hairline cell
 * grid, `+` crosshairs at intersections, drifting cell markers, and
 * assembling pixel clusters. Same contract — seeded PRNG, IntersectionObserver
 * gated, static under reduced motion, deterministic first paint.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function useInView(ref: React.RefObject<Element | null>): boolean {
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? false), { threshold: 0.05 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

type Marker = '·' | '▪' | '+' | '▫';
const MARKERS: Marker[] = ['·', '▪', '+', '▫'];

/** Markers stay in the outer thirds so they never sit under centred content. */
function outerCol(rng: () => number, cols: number): number {
  const side = Math.max(1, Math.floor(cols * 0.3));
  const c = Math.floor(rng() * side);
  return rng() < 0.5 ? c : cols - 1 - c;
}

interface ClusterCell {
  order: number;
  accent: boolean;
}

function buildCluster(n: number, seed: number): ClusterCell[] {
  const rng = mulberry32(seed);
  const order = Array.from({ length: n * n }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const accentIndex = Math.floor(mulberry32(seed + 2)() * n * n);
  const cells: ClusterCell[] = Array.from({ length: n * n }, () => ({ order: 0, accent: false }));
  order.forEach((cellIndex, position) => {
    cells[cellIndex] = { order: position, accent: cellIndex === accentIndex };
  });
  return cells;
}

/** n×n cluster of 6px squares that fills in one-by-one, holds, then clears and repeats. */
function AssembleCluster({ size = 4, seed = 1 }: { size?: 3 | 4; seed?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const n = size;
  const cells = React.useMemo(() => buildCluster(n, seed), [n, seed]);
  const total = n * n;
  const holdSteps = Math.round(2000 / 350);
  const cycle = total + holdSteps;
  const [step, setStep] = React.useState(0);
  const running = inView && !reduced;

  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setStep((s) => (s + 1) % cycle);
    }, 350);
    return () => clearInterval(id);
  }, [running, cycle]);

  const filled = reduced ? total : Math.min(step, total);
  const dim = 6;
  const gap = 3;

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="grid select-none"
      style={{ gridTemplateColumns: `repeat(${n}, ${dim}px)`, gap }}
    >
      {cells.map((cell, i) => (
        <span
          key={i}
          className={cn(
            'transition-opacity duration-reveal ease-out',
            cell.accent ? 'bg-primary' : 'bg-muted-foreground/40',
            cell.order < filled ? 'opacity-100' : 'opacity-0',
          )}
          style={{ width: dim, height: dim }}
        />
      ))}
    </div>
  );
}

export interface AppGridProps {
  cell?: number;
  density?: number;
  seed?: number;
  clusters?: { col: number; row: number; size?: 3 | 4 }[];
  crosshairs?: boolean;
  /** How many ✦ nodes to pin at intersections. Seeded into the outer thirds, and unlike markers they do not drift. */
  sparkles?: number;
  className?: string;
}

export function AppGrid({ cell = 100, density = 10, seed = 7, clusters = [], crosshairs = true, sparkles = 0, className }: AppGridProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const [markers, setMarkers] = React.useState<{ c: number; r: number; m: Marker }[]>([]);
  const [nodes, setNodes] = React.useState<{ c: number; r: number }[]>([]);
  const rngRef = React.useRef(mulberry32(seed));

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = Math.max(1, Math.floor(size.w / cell));
  const rows = Math.max(1, Math.floor(size.h / cell));
  const offsetX = (size.w - cols * cell) / 2;

  React.useEffect(() => {
    if (!size.w) return;
    const rng = mulberry32(seed);
    rngRef.current = rng;
    const initial: { c: number; r: number; m: Marker }[] = [];
    for (let i = 0; i < density; i++) {
      initial.push({ c: outerCol(rng, cols), r: Math.floor(rng() * rows), m: MARKERS[Math.floor(rng() * MARKERS.length)]! });
    }
    setMarkers(initial);
    // Nodes sit on intersections from row 3 down: the first rows are under the
    // header panel every screen opens with, and a pill half-hidden by a card
    // edge reads as a glitch rather than a decoration.
    const firstRow = 3;
    const pinned: { c: number; r: number }[] = [];
    for (let i = 0; i < sparkles && rows > firstRow; i++) {
      pinned.push({ c: outerCol(rng, cols + 1), r: firstRow + Math.floor(rng() * (rows - firstRow)) });
    }
    setNodes(pinned);
  }, [size.w, cols, rows, density, seed, sparkles]);

  const running = inView && !reduced && size.w > 0;

  React.useEffect(() => {
    if (!running) return;
    const rng = rngRef.current;
    const id = setInterval(() => {
      setMarkers((prev) => {
        if (!prev.length) return prev;
        const next = prev.slice();
        const i = Math.floor(rng() * next.length);
        next[i] = { c: outerCol(rng, cols), r: Math.floor(rng() * rows), m: MARKERS[Math.floor(rng() * MARKERS.length)]! };
        return next;
      });
    }, 900);
    return () => clearInterval(id);
  }, [running, cols, rows]);

  return (
    <div ref={ref} aria-hidden="true" className={cn('pointer-events-none absolute inset-0 select-none overflow-hidden', className)}>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, hsl(var(--border) / 0.5) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.5) 1px, transparent 1px)',
          backgroundSize: `${cell}px ${cell}px`,
          backgroundPosition: `${offsetX}px 0`,
        }}
      />
      {markers.map((m, i) => (
        <span
          key={i}
          className="absolute hidden font-mono text-[12px] leading-none text-muted-foreground/40 transition-opacity duration-slow ease-out lg:block"
          style={{ left: offsetX + m.c * cell + cell / 2 - 4, top: m.r * cell + cell / 2 - 6 }}
        >
          {m.m}
        </span>
      ))}
      {nodes.map((n, i) => (
        <span
          key={`n-${i}`}
          className="absolute hidden h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-pill border border-border bg-background text-[14px] leading-none text-primary lg:flex"
          style={{ left: offsetX + n.c * cell, top: n.r * cell }}
        >
          <span className={running ? 'animate-sparkle' : undefined}>✦</span>
        </span>
      ))}
      {crosshairs &&
        size.w > 0 &&
        Array.from({ length: (cols + 1) * (rows + 1) }, (_, i) => {
          const c = i % (cols + 1);
          const r = Math.floor(i / (cols + 1));
          return (
            <span
              key={`x-${c}-${r}`}
              className="absolute hidden -translate-x-1/2 -translate-y-1/2 select-none font-mono text-[10px] leading-none text-muted-foreground/40 lg:block"
              style={{ left: offsetX + c * cell, top: r * cell }}
            >
              +
            </span>
          );
        })}
      {clusters.map((cl, i) => (
        <div
          key={`cl-${i}`}
          className="absolute hidden -translate-x-1/2 -translate-y-1/2 lg:block"
          style={{ left: offsetX + cl.col * cell + cell / 2, top: cl.row * cell + cell / 2 }}
        >
          <AssembleCluster size={cl.size ?? 4} seed={seed * 31 + i * 7 + 1} />
        </div>
      ))}
    </div>
  );
}
