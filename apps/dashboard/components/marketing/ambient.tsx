'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * Ambient background primitives for the marketing surface (landing-revamp-plan
 * "Firecrawl-like ... code animations running in the background"). All three
 * share the same contract: text spans not canvas, a single throttled ticker,
 * paused off-screen, settled deterministic frame under reduced motion, and a
 * seeded first paint so server and client agree.
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

/* ---------------------------------------------------------------------- */
/* GridCells: hairline cell grid with slowly changing cell markers,        */
/* violet ✦ nodes at chosen intersections and mono bracket labels.         */
/* ---------------------------------------------------------------------- */

type Corner = 'tl' | 'tr' | 'bl' | 'br';
type Marker = '·' | '▪' | '+' | '▫';
const MARKERS: Marker[] = ['·', '▪', '+', '▫'];

export interface GridCellsProps {
  cell?: number;
  labels?: Partial<Record<Corner, string>>;
  /** Intersections (col, row) that carry a ✦ node. */
  sparkles?: [number, number][];
  /** How many cells carry a marker at once. */
  density?: number;
  seed?: number;
  /** Fade the grid toward the bottom (hero) or keep it flat (CTA). */
  fade?: 'bottom' | 'none';
  quiet?: boolean;
  className?: string;
}

const CORNER_CLASS: Record<Corner, string> = {
  tl: 'left-4 top-4',
  tr: 'right-4 top-4',
  bl: 'left-4 bottom-4',
  br: 'right-4 bottom-4',
};

/** Markers stay in the outer thirds so they never sit under centred copy. */
function outerCol(rng: () => number, cols: number): number {
  const side = Math.max(1, Math.floor(cols * 0.3));
  const c = Math.floor(rng() * side);
  return rng() < 0.5 ? c : cols - 1 - c;
}

export function GridCells({ cell = 100, labels, sparkles = [], density = 12, seed = 7, fade = 'bottom', quiet, className }: GridCellsProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const [markers, setMarkers] = React.useState<{ c: number; r: number; m: Marker }[]>([]);
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
  }, [size.w, cols, rows, density, seed]);

  const running = inView && !reduced && !quiet && size.w > 0;

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
    <div
      ref={ref}
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 select-none overflow-hidden', className)}
      style={
        fade === 'bottom'
          ? { maskImage: 'linear-gradient(to bottom, black 55%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black 55%, transparent)' }
          : undefined
      }
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'linear-gradient(to right, var(--m-illus-faint) 1px, transparent 1px), linear-gradient(to bottom, var(--m-illus-faint) 1px, transparent 1px)',
          backgroundSize: `${cell}px ${cell}px`,
          backgroundPosition: `${offsetX}px 0`,
        }}
      />
      {markers.map((m, i) => (
        <span
          key={i}
          className="absolute hidden font-mono text-[12px] leading-none text-m-illus-default transition-opacity duration-slow ease-out lg:block"
          style={{ left: offsetX + m.c * cell + cell / 2 - 4, top: m.r * cell + cell / 2 - 6 }}
        >
          {m.m}
        </span>
      ))}
      {sparkles.map(([c, r]) => (
        <span
          key={`${c}-${r}`}
          className="absolute hidden h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-pill border border-m-border-muted bg-m-bg text-[14px] leading-none text-violet lg:flex"
          style={{ left: offsetX + c * cell, top: r * cell }}
        >
          <span className={running ? 'animate-sparkle' : undefined}>✦</span>
        </span>
      ))}
      {labels &&
        (Object.keys(labels) as Corner[]).map((k) => (
          <span key={k} className={cn('absolute font-mono text-[12px] tracking-wide text-m-ink/48', CORNER_CLASS[k])}>
            {labels[k]}
          </span>
        ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* AsciiFlame: classic heat-propagation fire drawn with characters.        */
/* Three <pre> layers (ink / violet-soft / violet) so a frame is three     */
/* text updates, not hundreds of spans.                                    */
/* ---------------------------------------------------------------------- */

const FLAME_CHARS = ' .:-=+*#%X';

export interface AsciiFlameProps {
  cols?: number;
  rows?: number;
  /** 'plume' narrows toward the top; 'cluster' is a soft blob. */
  shape?: 'plume' | 'cluster';
  seed?: number;
  fps?: number;
  quiet?: boolean;
  className?: string;
}

function flameStep(heat: Float32Array, cols: number, rows: number, rng: () => number, shape: 'plume' | 'cluster') {
  for (let x = 0; x < cols; x++) {
    const dx = Math.abs(x - (cols - 1) / 2) / (cols / 2);
    const base = shape === 'plume' ? 1 - dx * dx * 0.9 : 1 - dx * 0.5;
    heat[(rows - 1) * cols + x] = Math.max(0, base * (0.6 + rng() * 0.4));
  }
  for (let y = 0; y < rows - 1; y++) {
    const ty = y / rows;
    for (let x = 0; x < cols; x++) {
      const below = (y + 1) * cols;
      const l = heat[below + Math.max(0, x - 1)] ?? 0;
      const c = heat[below + x] ?? 0;
      const r = heat[below + Math.min(cols - 1, x + 1)] ?? 0;
      const d = heat[Math.min(rows - 1, y + 2) * cols + x] ?? 0;
      const decay = shape === 'plume' ? 0.045 + (1 - ty) * 0.02 : 0.08;
      heat[y * cols + x] = Math.max(0, (l + c + r + d) / 4.03 - decay * rng());
    }
  }
}

function flameLayers(heat: Float32Array, cols: number, rows: number): [string, string, string] {
  let ink = '';
  let soft = '';
  let hot = '';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v = heat[y * cols + x] ?? 0;
      const idx = Math.min(FLAME_CHARS.length - 1, Math.floor(v * FLAME_CHARS.length));
      const ch = FLAME_CHARS[idx] ?? ' ';
      if (v < 0.08) {
        ink += ' ';
        soft += ' ';
        hot += ' ';
      } else if (v < 0.35) {
        ink += ch;
        soft += ' ';
        hot += ' ';
      } else if (v < 0.65) {
        ink += ' ';
        soft += ch;
        hot += ' ';
      } else {
        ink += ' ';
        soft += ' ';
        hot += ch;
      }
    }
    if (y < rows - 1) {
      ink += '\n';
      soft += '\n';
      hot += '\n';
    }
  }
  return [ink, soft, hot];
}

function settledFlame(cols: number, rows: number, seed: number, shape: 'plume' | 'cluster'): [string, string, string] {
  const rng = mulberry32(seed);
  const heat = new Float32Array(cols * rows);
  for (let i = 0; i < rows * 2; i++) flameStep(heat, cols, rows, rng, shape);
  return flameLayers(heat, cols, rows);
}

export function AsciiFlame({ cols = 20, rows = 28, shape = 'plume', seed = 3, fps = 9, quiet, className }: AsciiFlameProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const [layers, setLayers] = React.useState<[string, string, string]>(() => settledFlame(cols, rows, seed, shape));
  const heatRef = React.useRef<Float32Array | null>(null);
  const running = inView && !reduced && !quiet;

  React.useEffect(() => {
    if (!running) return;
    const rng = mulberry32(seed + 101);
    if (!heatRef.current) {
      heatRef.current = new Float32Array(cols * rows);
      for (let i = 0; i < rows * 2; i++) flameStep(heatRef.current, cols, rows, rng, shape);
    }
    const heat = heatRef.current;
    const id = setInterval(() => {
      flameStep(heat, cols, rows, rng, shape);
      setLayers(flameLayers(heat, cols, rows));
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [running, cols, rows, seed, shape, fps]);

  return (
    <div ref={ref} aria-hidden="true" className={cn('pointer-events-none relative select-none font-mono text-[11px] leading-[1.15]', className)}>
      <pre className="whitespace-pre text-m-ink/24">{layers[0]}</pre>
      <pre className="absolute inset-0 whitespace-pre text-violet-48">{layers[1]}</pre>
      <pre className="absolute inset-0 whitespace-pre text-violet">{layers[2]}</pre>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* AmbientCode: fragments of real Helix wire format drifting in and out    */
/* of a section's background, each scrambling from glyph noise to its      */
/* settled text. Violet strings, green status, ink keys.                   */
/* ---------------------------------------------------------------------- */

interface Fragment {
  id: number;
  x: number;
  y: number;
  text: string;
  tone: 'string' | 'key' | 'ok' | 'punct';
  born: number;
  life: number;
}

const FRAGMENTS: { text: string; tone: Fragment['tone'] }[] = [
  { text: '"tier": "plain"', tone: 'string' },
  { text: '200 OK', tone: 'ok' },
  { text: '"success": true', tone: 'key' },
  { text: '"estimate": true', tone: 'key' },
  { text: 'POST /v1/scrape', tone: 'punct' },
  { text: '"formats": ["markdown", "json"]', tone: 'string' },
  { text: 'helix-fetch  healthy  0.8s', tone: 'ok' },
  { text: '"ocrUsed": false', tone: 'key' },
  { text: '"fromCache": true', tone: 'string' },
  { text: 'Authorization: Bearer helix-…', tone: 'punct' },
  { text: '"statusCode": 200', tone: 'ok' },
  { text: '"schedule": "0 * * * *"', tone: 'string' },
  { text: 'docker compose up', tone: 'punct' },
  { text: '"markdown": "# Pricing\\n…"', tone: 'string' },
  { text: '"sessionId": "sess_9f2c1a7b"', tone: 'string' },
  { text: 'helix-api  healthy  0.6s', tone: 'ok' },
  { text: '"maxDepth": 3', tone: 'key' },
  { text: 'Apache-2.0', tone: 'punct' },
];

const NOISE = '░▒▓#%=+:-';
const TONE_CLASS: Record<Fragment['tone'], string> = {
  string: 'text-violet',
  key: 'text-m-ink/56',
  ok: 'text-success',
  punct: 'text-m-ink/40',
};

export interface AmbientCodeProps {
  count?: number;
  seed?: number;
  quiet?: boolean;
  className?: string;
}

function spawn(id: number, rng: () => number, now: number): Fragment {
  const f = FRAGMENTS[Math.floor(rng() * FRAGMENTS.length)]!;
  return { id, x: 4 + rng() * 80, y: 4 + rng() * 88, text: f.text, tone: f.tone, born: now, life: 5200 + rng() * 3600 };
}

export function AmbientCode({ count = 9, seed = 11, quiet, className }: AmbientCodeProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const rngRef = React.useRef(mulberry32(seed));
  const [frags, setFrags] = React.useState<Fragment[]>(() => {
    const rng = mulberry32(seed);
    return Array.from({ length: count }, (_, i) => ({ ...spawn(i, rng, 0), born: -i * 700 }));
  });
  const [now, setNow] = React.useState(0);
  const idRef = React.useRef(count);
  const running = inView && !reduced && !quiet;

  React.useEffect(() => {
    if (!running) return;
    const rng = rngRef.current;
    const start = performance.now() - now;
    const id = setInterval(() => {
      const t = performance.now() - start;
      setNow(t);
      setFrags((prev) => prev.map((f) => (t - f.born > f.life ? spawn(idRef.current++, rng, t) : f)));
    }, 90);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  return (
    <div ref={ref} aria-hidden="true" className={cn('pointer-events-none absolute inset-0 select-none overflow-hidden', className)}>
      {frags.map((f) => {
        const age = now - f.born;
        const p = Math.max(0, Math.min(1, age / f.life));
        const opacity = reduced ? 0.6 : p < 0.12 ? p / 0.12 : p > 0.82 ? (1 - p) / 0.18 : 1;
        const resolve = reduced ? 1 : Math.min(1, age / 900);
        const text = resolveText(f.text, resolve, f.id, Math.floor(now / 90));
        return (
          <span
            key={f.id}
            className={cn('absolute whitespace-nowrap font-mono text-[12px]', TONE_CLASS[f.tone])}
            style={{ left: `${f.x}%`, top: `${f.y}%`, opacity, transform: reduced ? undefined : `translateY(${(1 - p) * 6 - 3}px)` }}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}

function resolveText(target: string, progress: number, id: number, tick: number): string {
  if (progress >= 1) return target;
  const settled = Math.floor(target.length * progress);
  let out = target.slice(0, settled);
  for (let i = settled; i < target.length; i++) {
    const ch = target[i];
    const h = (Math.imul(id + 1, 374761393) + Math.imul(i + 1, 668265263) + Math.imul(tick + 1, 2246822519)) >>> 0;
    out += ch === ' ' ? ' ' : NOISE[h % NOISE.length];
  }
  return out;
}
