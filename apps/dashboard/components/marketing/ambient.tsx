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
  /** Cells that carry a small pixel-square cluster, centred in the cell. */
  clusters?: { col: number; row: number; size?: 3 | 4; accent?: boolean; assemble?: boolean }[];
  /** Draw a small `+` crosshair at every grid intersection (lg+ only). */
  crosshairs?: boolean;
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

export function GridCells({
  cell = 100,
  labels,
  sparkles = [],
  density = 12,
  seed = 7,
  fade = 'bottom',
  quiet,
  className,
  clusters = [],
  crosshairs,
}: GridCellsProps) {
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
          className="absolute hidden font-mono text-[12px] leading-none text-m-illus transition-opacity duration-slow ease-out lg:block"
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
      {crosshairs &&
        size.w > 0 &&
        Array.from({ length: (cols + 1) * (rows + 1) }, (_, i) => {
          const c = i % (cols + 1);
          const r = Math.floor(i / (cols + 1));
          return (
            <span
              key={`x-${c}-${r}`}
              className="absolute hidden -translate-x-1/2 -translate-y-1/2 select-none font-mono text-[10px] leading-none text-m-illus lg:block"
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
          <PixelSquares
            size={cl.size ?? 4}
            scale="md"
            seed={seed * 31 + i * 7 + 1}
            accent={cl.accent ?? false}
            quiet={quiet ?? false}
            mode={cl.assemble ? 'assemble' : 'flip'}
          />
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* PixelSquares: an n×n cluster of tiny squares, some on some off, one       */
/* flipping at a time. Deterministic seeded first paint, throttled ticker,  */
/* paused off-screen, static under reduced motion.                          */
/* ---------------------------------------------------------------------- */

export interface PixelSquaresProps {
  size?: 3 | 4;
  seed?: number;
  /** Let one square in the cluster render in violet instead of ink grey. */
  accent?: boolean;
  scale?: 'sm' | 'md';
  quiet?: boolean;
  className?: string;
  /** 'flip': one random cell toggles at a time (default). 'assemble': cells fill in a seeded order, hold, then clear and repeat. */
  mode?: 'flip' | 'assemble';
}

function initialCells(n: number, seed: number): boolean[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n * n }, () => rng() < 0.42);
}

/** Deterministic shuffled fill order for 'assemble' mode (Fisher-Yates over a seeded rng). */
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

export function PixelSquares({ size = 4, seed = 1, accent, scale = 'sm', quiet, className, mode = 'flip' }: PixelSquaresProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const n = size;
  const [cells, setCells] = React.useState<boolean[]>(() => (mode === 'assemble' ? Array(n * n).fill(false) : initialCells(n, seed)));
  const rngRef = React.useRef(mulberry32(seed + 1));
  const orderRef = React.useRef(assembleOrder(n, seed));
  const accentIndex = React.useMemo(() => Math.floor(mulberry32(seed + 2)() * n * n), [seed, n]);
  const running = inView && !reduced && !quiet;
  const dim = scale === 'sm' ? 3 : 6;
  const gap = 3;

  React.useEffect(() => {
    orderRef.current = assembleOrder(n, seed);
    setCells(mode === 'assemble' ? Array(n * n).fill(false) : initialCells(n, seed));
    rngRef.current = mulberry32(seed + 1);
  }, [n, seed, mode]);

  React.useEffect(() => {
    if (mode !== 'flip') return;
    if (!running) return;
    const rng = rngRef.current;
    const id = setInterval(() => {
      setCells((prev) => {
        const next = prev.slice();
        const i = Math.floor(rng() * next.length);
        next[i] = !next[i];
        return next;
      });
    }, 700);
    return () => clearInterval(id);
  }, [running, mode]);

  React.useEffect(() => {
    if (mode !== 'assemble') return;
    if (!running) {
      if (reduced) setCells(Array(n * n).fill(true));
      return;
    }
    let cancelled = false;
    let fillTimer: ReturnType<typeof setInterval> | undefined;
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    const order = orderRef.current;

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
  }, [running, mode, n, reduced]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn('grid select-none', className)}
      style={{ gridTemplateColumns: `repeat(${n}, ${dim}px)`, gap }}
    >
      {cells.map((on, i) => (
        <span
          key={i}
          className={cn(
            'transition-opacity duration-reveal ease-out',
            accent && i === accentIndex ? 'bg-violet' : 'bg-m-illus',
            on ? 'opacity-100' : 'opacity-0',
          )}
          style={{ width: dim, height: dim }}
        />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* AsciiHelix: a rotating double helix drawn with characters. Depth picks   */
/* the glyph and the layer (back strand in ink, front strand in violet),    */
/* rungs join the strands. Three <pre> layers per frame, no per-cell spans. */
/* ---------------------------------------------------------------------- */

const STRAND_BACK = '.:-';
const STRAND_MID = '+=*';
const STRAND_FRONT = '#%@';

export interface AsciiHelixProps {
  /** Cells across the axis (strand swing + margin). */
  cols?: number;
  /** Cells along the axis. */
  rows?: number;
  orientation?: 'vertical' | 'horizontal';
  /** Cells per full turn. */
  pitch?: number;
  seed?: number;
  fps?: number;
  quiet?: boolean;
  className?: string;
}

function helixLayers(
  span: number,
  length: number,
  pitch: number,
  phase: number,
  tick: number,
  seed: number,
  horizontal: boolean,
): [string, string, string] {
  const w = horizontal ? length : span;
  const h = horizontal ? span : length;
  const back = Array.from({ length: h }, () => Array<string>(w).fill(' '));
  const mid = Array.from({ length: h }, () => Array<string>(w).fill(' '));
  const front = Array.from({ length: h }, () => Array<string>(w).fill(' '));
  const radius = (span - 3) / 2;
  const centre = (span - 1) / 2;

  const put = (grid: string[][], along: number, across: number, ch: string) => {
    const x = horizontal ? along : across;
    const y = horizontal ? across : along;
    if (x >= 0 && x < w && y >= 0 && y < h) grid[y]![x] = ch;
  };
  const glyph = (set: string, i: number) => set[((Math.imul(i + 1, 2654435761) ^ seed ^ (tick >> 3)) >>> 0) % set.length] ?? set[0]!;

  const pos = (t: number, offset: number) => Math.round(centre + radius * Math.sin((t / pitch) * Math.PI * 2 + phase + offset));
  for (let t = 0; t < length; t++) {
    const theta = (t / pitch) * Math.PI * 2 + phase;
    const a = pos(t, 0);
    const b = pos(t, Math.PI);
    const za = Math.cos(theta);
    const strand = (across: number, next: number, z: number, i: number) => {
      const lo = Math.min(across, next);
      const hi = Math.max(across, next);
      const grid = z > 0.35 ? front : z > -0.35 ? mid : back;
      const set = z > 0.35 ? STRAND_FRONT : z > -0.35 ? STRAND_MID : STRAND_BACK;
      for (let x = lo; x <= hi; x++) put(grid, t, x, glyph(set, i + x));
      put(grid, t, hi + 1, glyph(z > 0.35 ? STRAND_MID : STRAND_BACK, i + 9));
    };
    strand(a, pos(t + 1, 0), za, t);
    strand(b, pos(t + 1, Math.PI), -za, t + 1000);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (t % 4 === 2 && hi - lo > 4) {
      for (let x = lo + 2; x < hi; x += 2) put(back, t, x, horizontal ? ':' : '·');
    }
  }
  const join = (g: string[][]) => g.map((r) => r.join('')).join('\n');
  return [join(back), join(mid), join(front)];
}

export function AsciiHelix({ cols = 20, rows = 28, orientation = 'vertical', pitch = 16, seed = 3, fps = 12, quiet, className }: AsciiHelixProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const horizontal = orientation === 'horizontal';
  const span = horizontal ? rows : cols;
  const length = horizontal ? cols : rows;
  const [layers, setLayers] = React.useState<[string, string, string]>(() => helixLayers(span, length, pitch, 0, 0, seed, horizontal));
  const tickRef = React.useRef(0);
  const running = inView && !reduced && !quiet;

  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      tickRef.current += 1;
      setLayers(helixLayers(span, length, pitch, tickRef.current * 0.16, tickRef.current, seed, horizontal));
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [running, span, length, pitch, seed, fps, horizontal]);

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

/* ---------------------------------------------------------------------- */
/* CodeRain: a coarse grid of short wire-format tokens fading in and out,   */
/* laid out as two <pre> layers (ink + violet-48) like AsciiHelix so the    */
/* DOM cost stays two nodes regardless of grid size. Deterministic first    */
/* paint, throttled ticker, paused off-screen, static under reduced motion. */
/* ---------------------------------------------------------------------- */

const RAIN_TOKENS = ['{', '}', '[ ]', '"url":', '200', '->', '0x1f', '·', ':', '='];

export interface CodeRainProps {
  cols?: number;
  rows?: number;
  /** Fraction of cells that carry a token at once (0-1). */
  density?: number;
  seed?: number;
  quiet?: boolean;
  className?: string;
}

interface RainCell {
  token: string;
  violet: boolean;
  phase: number;
}

function rainLayers(cols: number, rows: number, cells: (RainCell | null)[], violetTone: boolean): string {
  const grid = Array.from({ length: rows }, () => Array<string>(cols).fill(''));
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (!cell || cell.violet !== violetTone) continue;
    const c = i % cols;
    const r = Math.floor(i / cols);
    const visible = cell.phase > 0.15 && cell.phase < 0.92;
    grid[r]![c] = visible ? cell.token.padEnd(6, ' ').slice(0, 6) : ''.padEnd(6, ' ');
  }
  return grid.map((row) => row.map((cell) => (cell ? cell : ' '.repeat(6))).join(' ')).join('\n');
}

function seedRain(cols: number, rows: number, density: number, seed: number): (RainCell | null)[] {
  const rng = mulberry32(seed);
  return Array.from({ length: cols * rows }, () => {
    if (rng() > density) return null;
    return { token: RAIN_TOKENS[Math.floor(rng() * RAIN_TOKENS.length)]!, violet: rng() < 0.125, phase: rng() };
  });
}

export function CodeRain({ cols = 14, rows = 6, density = 0.35, seed = 17, quiet, className }: CodeRainProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const [cells, setCells] = React.useState<(RainCell | null)[]>(() => seedRain(cols, rows, density, seed));
  const rngRef = React.useRef(mulberry32(seed + 1));
  const running = inView && !reduced && !quiet;

  React.useEffect(() => {
    setCells(seedRain(cols, rows, density, seed));
    rngRef.current = mulberry32(seed + 1);
  }, [cols, rows, density, seed]);

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
          next[i] = rng() > density ? null : { token: RAIN_TOKENS[Math.floor(rng() * RAIN_TOKENS.length)]!, violet: rng() < 0.125, phase: 0.2 };
        }
        return next;
      });
    }, 1000 / 6);
    return () => clearInterval(id);
  }, [running, density]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn('pointer-events-none relative select-none overflow-hidden font-mono text-[10px] leading-[1.6]', className)}
    >
      <pre className="whitespace-pre text-m-illus">{rainLayers(cols, rows, cells, false)}</pre>
      <pre className="absolute inset-0 whitespace-pre text-violet-48">{rainLayers(cols, rows, cells, true)}</pre>
    </div>
  );
}
