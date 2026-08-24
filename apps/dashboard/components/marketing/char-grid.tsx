'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Fixed-size monospace glyph grid cycling four idle templates behind the hero
 * panel (WEBSITE.md §4.2, DESIGN.md §3): DNA, wave, ladder (Sequence A ghosted),
 * frontier (Sequence B ghosted). Text spans, not canvas; one dimension changes
 * per frame; paused off-screen; settled frame under reduced motion; `quiet`
 * freezes it while the hero demo runs.
 */
const COLS = 28;
const ROWS = 10;
const FPS_MS = 1000 / 8;
const TEMPLATE_MS = 12000;
const CROSSFADE_MS = 400;

type Template = 'dna' | 'wave' | 'ladder' | 'frontier';
const TEMPLATES: Template[] = ['dna', 'wave', 'ladder', 'frontier'];

function dnaFrame(tick: number): string[] {
  const rows: string[] = [];
  for (let r = 0; r < ROWS; r++) {
    let row = '';
    for (let c = 0; c < COLS; c++) {
      const phase = c * 0.5 + tick * 0.35;
      const strandA = Math.round(Math.sin(phase) * 3) + 5;
      const strandB = Math.round(Math.sin(phase + Math.PI) * 3) + 5;
      if (r === strandA) row += '●';
      else if (r === strandB) row += '○';
      else if (r > Math.min(strandA, strandB) && r < Math.max(strandA, strandB) && c % 4 === 0) row += '─';
      else row += ' ';
    }
    rows.push(row);
  }
  return rows;
}

function waveFrame(tick: number): string[] {
  const glyphs = ['░', '▒', '▓', '█'];
  const rows: string[] = [];
  for (let r = 0; r < ROWS; r++) {
    let row = '';
    for (let c = 0; c < COLS; c++) {
      const v = Math.sin(c * 0.4 + r * 0.3 - tick * 0.4);
      const idx = Math.max(0, Math.min(3, Math.round(((v + 1) / 2) * 3)));
      row += v > 0.55 ? glyphs[idx] : ' ';
    }
    rows.push(row);
  }
  return rows;
}

const LADDER_GHOST = [
  '┌─ plain ─┬─ tls ────┬─ panda ──┬─ chrome ─┐',
  '│ ●  5ms  │  ▸ ...   │  ·       │  ·       │',
  '└─────────┴──────────┴──────────┴──────────┘',
];

function ladderFrame(tick: number): string[] {
  const step = Math.floor(tick / 6) % 4;
  const states = ['▸ ...   ', '● 403   ', '● 200   ', '○ skip  '];
  const line = `│ ${states[step]} │  ${states[(step + 1) % 4]}│  ${states[(step + 2) % 4]}│  ${states[(step + 3) % 4]}│`;
  const rows = [LADDER_GHOST[0] ?? '', line, LADDER_GHOST[2] ?? ''];
  while (rows.length < ROWS) rows.push(' '.repeat(COLS));
  return rows.map((r) => (r ?? '').padEnd(COLS).slice(0, COLS));
}

const FRONTIER_BASE = ['● example.com/', '├─▸ /pricing', '├─▸ /docs', '├─▸ /blog', '└─▸ /about'];
const FRONTIER_GROWN = ['● example.com/', '├─● /pricing', '├─▸ /docs', '│  └─▸ /docs/api', '├─● /blog', '└─○ /about'];

function frontierFrame(tick: number): string[] {
  const grown = Math.floor(tick / 8) % 2 === 1;
  const base = grown ? FRONTIER_GROWN : FRONTIER_BASE;
  const rows = base.map((r) => r.padEnd(COLS).slice(0, COLS));
  while (rows.length < ROWS) rows.push(' '.repeat(COLS));
  return rows;
}

function buildFrame(template: Template, tick: number): string[] {
  switch (template) {
    case 'dna':
      return dnaFrame(tick);
    case 'wave':
      return waveFrame(tick);
    case 'ladder':
      return ladderFrame(tick);
    case 'frontier':
      return frontierFrame(tick);
  }
}

const STATIC_FRAME = dnaFrame(0);

export function CharGrid({ quiet, className }: { quiet?: boolean; className?: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const [templateIdx, setTemplateIdx] = React.useState(0);
  const [rows, setRows] = React.useState<string[]>(STATIC_FRAME);
  const [fading, setFading] = React.useState(false);
  const tickRef = React.useRef(0);

  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => entry && setVisible(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const running = visible && !reducedMotion && !quiet;

  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      tickRef.current += 1;
      const t = TEMPLATES[templateIdx] ?? TEMPLATES[0]!;
      setRows(buildFrame(t, tickRef.current));
    }, FPS_MS);
    return () => clearInterval(id);
  }, [running, templateIdx]);

  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setTemplateIdx((i) => (i + 1) % TEMPLATES.length);
        setFading(false);
      }, CROSSFADE_MS);
    }, TEMPLATE_MS);
    return () => clearInterval(id);
  }, [running]);

  const display = reducedMotion || quiet ? STATIC_FRAME : rows;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={cn(
        'select-none whitespace-pre font-mono text-[11px] leading-[1.15] text-m-illus transition-opacity ease-out',
        fading ? 'opacity-0 duration-[400ms]' : 'opacity-100 duration-[400ms]',
        className,
      )}
    >
      {display.join('\n')}
    </div>
  );
}
