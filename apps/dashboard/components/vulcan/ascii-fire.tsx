'use client';

import * as React from 'react';
import { mulberry32, useInView, useReducedMotion } from '@/components/marketing/ambient';
import { cn } from '@/lib/utils';

/**
 * A flame drawn in monospace characters, the way the rest of the app draws
 * its ambient fields. A heat grid burns upward from a bell-shaped source on
 * the bottom row (the classic propagate-and-decay fire), and each cell picks
 * a glyph by heat and a colour from the ember ramp on the surface it sits in.
 * Runs at 18 fps while in view; reduced motion paints one still frame.
 */

const GLYPHS = ' .:-=+^"*#@';
const FPS = 18;
const MAX_HEAT = 36;

interface AsciiFireProps {
  cols?: number;
  rows?: number;
  /** Glyph size in CSS px; cell width follows the font's advance. */
  fontSize?: number;
  seed?: number;
  className?: string;
}

interface Ramp {
  low: string;
  mid: string;
  high: string;
  peak: string;
}

function readRamp(el: HTMLElement): Ramp {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    low: v('--v-4', '4 82% 50%'),
    mid: v('--v-2', '24 100% 58%'),
    high: v('--v-1', '38 100% 64%'),
    peak: v('--foreground', '24 30% 96%'),
  };
}

function colourFor(heat: number, ramp: Ramp): string {
  const t = heat / MAX_HEAT;
  if (t > 0.86) return `hsl(${ramp.peak} / 0.95)`;
  if (t > 0.6) return `hsl(${ramp.high} / ${(0.55 + t * 0.45).toFixed(2)})`;
  if (t > 0.3) return `hsl(${ramp.mid} / ${(0.35 + t * 0.6).toFixed(2)})`;
  return `hsl(${ramp.low} / ${(0.15 + t * 0.9).toFixed(2)})`;
}

export function AsciiFire({ cols = 30, rows = 7, fontSize = 11, seed = 7, className }: AsciiFireProps) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rng = mulberry32(seed);
    const font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.font = font;
    const cw = Math.ceil(ctx.measureText('M').width);
    const ch = Math.round(fontSize * 1.15);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = cols * cw * dpr;
    canvas.height = rows * ch * dpr;
    canvas.style.width = `${cols * cw}px`;
    canvas.style.height = `${rows * ch}px`;
    ctx.scale(dpr, dpr);
    ctx.font = font;
    ctx.textBaseline = 'top';

    const ramp = readRamp(canvas);
    const heat = new Float32Array(cols * rows);
    const centre = (cols - 1) / 2;
    const width = cols * 0.19;

    const step = () => {
      for (let x = 0; x < cols; x++) {
        const d = (x - centre) / width;
        const bell = Math.exp(-d * d);
        heat[(rows - 1) * cols + x] = MAX_HEAT * bell * (0.7 + rng() * 0.3);
      }
      for (let y = rows - 2; y >= 0; y--) {
        for (let x = 0; x < cols; x++) {
          const drift = rng() < 0.5 ? 0 : rng() < 0.5 ? -1 : 1;
          const sx = Math.min(cols - 1, Math.max(0, x + drift));
          const below = heat[(y + 1) * cols + sx] ?? 0;
          const edge = Math.abs(x - centre) / (cols / 2);
          const decay = 1.6 + rng() * 3.2 + edge * 3;
          heat[y * cols + x] = Math.max(0, below - decay);
        }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, cols * cw, rows * ch);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const h = heat[y * cols + x] ?? 0;
          if (h < 1.5) continue;
          const g = GLYPHS[Math.min(GLYPHS.length - 1, Math.floor((h / MAX_HEAT) * GLYPHS.length))] ?? ' ';
          if (g === ' ') continue;
          ctx.fillStyle = colourFor(h, ramp);
          ctx.fillText(g, x * cw, y * ch);
        }
      }
    };

    // Let the flame reach its full height before the first paint.
    for (let i = 0; i < rows * 2; i++) step();
    draw();

    if (reduced || !inView) return;

    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 1000 / FPS) return;
      last = t;
      step();
      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [cols, rows, fontSize, seed, reduced, inView]);

  return <canvas ref={ref} aria-hidden="true" className={cn('block', className)} />;
}
