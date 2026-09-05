'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * Ambient primitives for the marketing surface, ported from Helix's motion
 * grammar (PERSONA-REVAMP.md Track 2) into Persona's own palette: two <pre>
 * layers (ink body, blue accent), a seeded first paint so server and client
 * agree, a low tick rate, paused off-screen, and a settled frame under
 * reduced motion. The tokens are Persona's, not Helix's: placeholders,
 * frontmatter keys and version tags rather than HTTP.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function useReducedMotion(): boolean {
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

export function useInView(ref: React.RefObject<Element | null>): boolean {
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

function useTicker(running: boolean, fps: number): number {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000 / fps);
    return () => clearInterval(id);
  }, [running, fps]);
  return tick;
}

/* ---------------------------------------------------------------------- */
/* TokenRain: a coarse grid of prompt-shaped tokens fading in and out.     */
/* ---------------------------------------------------------------------- */

const RAIN_TOKENS = ['{{', '}}', 'role:', 'tone:', 'v3', '->', '·', ':', '=', '[ ]', 'COMPANY', '_URL', 'chat', 'llm'];

interface RainCell {
  token: string;
  accent: boolean;
  phase: number;
}

function seedRain(cols: number, rows: number, density: number, seed: number): (RainCell | null)[] {
  const rng = mulberry32(seed);
  return Array.from({ length: cols * rows }, () => {
    if (rng() > density) return null;
    return { token: RAIN_TOKENS[Math.floor(rng() * RAIN_TOKENS.length)]!, accent: rng() < 0.14, phase: rng() };
  });
}

function rainLayer(cols: number, rows: number, cells: (RainCell | null)[], accent: boolean): string {
  const grid = Array.from({ length: rows }, () => Array<string>(cols).fill(' '.repeat(7)));
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (!cell || cell.accent !== accent) continue;
    const visible = cell.phase > 0.15 && cell.phase < 0.92;
    grid[Math.floor(i / cols)]![i % cols] = visible ? cell.token.padEnd(7, ' ').slice(0, 7) : ' '.repeat(7);
  }
  return grid.map((row) => row.join(' ')).join('\n');
}

export interface TokenRainProps {
  cols?: number;
  rows?: number;
  density?: number;
  seed?: number;
  quiet?: boolean;
  className?: string;
}

export function TokenRain({ cols = 14, rows = 2, density = 0.4, seed = 17, quiet, className }: TokenRainProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const [cells, setCells] = React.useState<(RainCell | null)[]>(() => seedRain(cols, rows, density, seed));
  const rngRef = React.useRef(mulberry32(seed + 1));
  const running = inView && !reduced && !quiet;

  React.useEffect(() => {
    if (!running) return;
    const rng = rngRef.current;
    const id = setInterval(() => {
      setCells((prev) => {
        const next = prev.slice();
        const i = Math.floor(rng() * next.length);
        const cur = next[i];
        if (cur && rng() < 0.5) {
          next[i] = { ...cur, phase: Math.min(1, cur.phase + 0.2 + rng() * 0.3) };
        } else {
          next[i] = rng() > density ? null : { token: RAIN_TOKENS[Math.floor(rng() * RAIN_TOKENS.length)]!, accent: rng() < 0.14, phase: 0.2 };
        }
        return next;
      });
    }, 1000 / 6);
    return () => clearInterval(id);
  }, [running, density]);

  return (
    <div ref={ref} aria-hidden="true" className={cn('pointer-events-none relative select-none overflow-hidden font-mono text-[10px] leading-[1.6]', className)}>
      <pre className="whitespace-pre text-p-illus">{rainLayer(cols, rows, cells, false)}</pre>
      <pre className="absolute inset-0 whitespace-pre text-blue-60">{rainLayer(cols, rows, cells, true)}</pre>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* PixelSquares: an n×n cluster that assembles in a seeded order, holds,   */
/* clears and repeats. One blue cell. Static and fully lit under reduced   */
/* motion.                                                                 */
/* ---------------------------------------------------------------------- */

function assembleOrder(n: number, seed: number): number[] {
  const rng = mulberry32(seed);
  const order = Array.from({ length: n * n }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  return order;
}

export function PixelSquares({ size = 4, seed = 1, className }: { size?: 3 | 4; seed?: number; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const n = size;
  const [cells, setCells] = React.useState<boolean[]>(() => Array(n * n).fill(false));
  const accentIndex = React.useMemo(() => Math.floor(mulberry32(seed + 2)() * n * n), [seed, n]);
  const running = inView && !reduced;

  React.useEffect(() => {
    if (!running) {
      if (reduced) setCells(Array(n * n).fill(true));
      return;
    }
    let cancelled = false;
    let fillTimer: ReturnType<typeof setInterval> | undefined;
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    const order = assembleOrder(n, seed);
    function runCycle() {
      let i = 0;
      setCells(Array(n * n).fill(false));
      fillTimer = setInterval(() => {
        if (cancelled) return;
        if (i >= order.length) {
          clearInterval(fillTimer);
          holdTimer = setTimeout(() => {
            if (!cancelled) runCycle();
          }, 1800);
          return;
        }
        const idx = order[i]!;
        i += 1;
        setCells((prev) => {
          const next = prev.slice();
          next[idx] = true;
          return next;
        });
      }, 350);
    }
    runCycle();
    return () => {
      cancelled = true;
      if (fillTimer) clearInterval(fillTimer);
      if (holdTimer) clearTimeout(holdTimer);
    };
  }, [running, n, seed, reduced]);

  return (
    <div ref={ref} aria-hidden="true" className={cn('grid select-none', className)} style={{ gridTemplateColumns: `repeat(${n}, 6px)`, gap: 3 }}>
      {cells.map((on, i) => (
        <span
          key={i}
          className={cn('transition-opacity duration-300 ease-out', i === accentIndex ? 'bg-blue' : 'bg-p-illus', on ? 'opacity-100' : 'opacity-0')}
          style={{ width: 6, height: 6 }}
        />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* AsciiFluid: glyph density following a drifting wave surface. Two <pre>  */
/* layers, ink body and blue crests.                                       */
/* ---------------------------------------------------------------------- */

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
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const surface = 0.35 + 0.25 * noise(x * 0.08, time * 0.3, 0, seed) + 0.12 * noise(x * 0.21 + 5, time * 0.5, 0, seed + 11);
      const depth = y / rows - surface;
      if (depth < -0.02) continue;
      const v = Math.min(1, depth * 2.2 + noise(x * 0.3, y * 0.3, time * 0.6, seed + 3) * 0.35);
      if (depth < 0.05 && noise(x * 0.5, time * 0.8, 0, seed + 7) > 0.62) {
        crest[y]![x] = CREST[Math.floor(noise(x, y, time, seed + 9) * CREST.length)] ?? 'X';
        continue;
      }
      body[y]![x] = BODY[Math.min(BODY.length - 1, Math.floor(v * BODY.length))]!;
    }
  }
  return [body.map((r) => r.join('')).join('\n'), crest.map((r) => r.join('')).join('\n')];
}

export interface AsciiFluidProps {
  cols?: number;
  rows?: number;
  seed?: number;
  fps?: number;
  className?: string;
}

export function AsciiFluid({ cols = 30, rows = 12, seed = 3, fps = 8, className }: AsciiFluidProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const tick = useTicker(inView && !reduced, fps);
  const layers = React.useMemo(() => fluidLayers(cols, rows, tick / fps, seed), [cols, rows, tick, fps, seed]);
  return (
    <div ref={ref} aria-hidden="true" className={cn('pointer-events-none relative select-none font-mono text-[11px] leading-[1.15]', className)}>
      <pre className="whitespace-pre text-p-illus">{layers[0]}</pre>
      <pre className="absolute inset-0 whitespace-pre text-blue-60">{layers[1]}</pre>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* ScrollStrip: one line of tokens whose offset is its own scroll progress */
/* through the viewport, so the page's motion is the only clock.           */
/* ---------------------------------------------------------------------- */

const STRIP_TOKENS = ['{{COMPANY_NAME}}', '·', 'role: support-chat', '->', 'tone: warm', 'v3', '[ chat ]', '{{HELP_CENTER_URL}}', '=', 'platform: llm', '{{HANDOFF_QUEUE_NAME}}', ':'];
const TRAVEL = 200;

export function ScrollStrip({ seed = 3, direction = 'left', className }: { seed?: number; direction?: 'left' | 'right'; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const stream = React.useMemo(() => {
    const rng = mulberry32(seed);
    return Array.from({ length: 120 }, () => STRIP_TOKENS[Math.floor(rng() * STRIP_TOKENS.length)]!).join('   ');
  }, [seed]);

  React.useEffect(() => {
    const el = ref.current;
    const track = trackRef.current;
    if (!el || !track) return;
    if (reduced) {
      track.style.transform = `translateX(${-TRAVEL / 2}px)`;
      return;
    }
    if (!inView) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh - rect.top) / (vh + rect.height)));
      const x = direction === 'left' ? -p * TRAVEL : -TRAVEL + p * TRAVEL;
      track.style.transform = `translateX(${x.toFixed(1)}px)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [reduced, inView, direction]);

  return (
    <div ref={ref} aria-hidden="true" className={cn('pointer-events-none h-7 select-none overflow-hidden', className)}>
      <div ref={trackRef} className="flex h-full w-max items-center whitespace-pre font-mono text-[11px] leading-none text-p-illus will-change-transform">
        {stream}
      </div>
    </div>
  );
}
