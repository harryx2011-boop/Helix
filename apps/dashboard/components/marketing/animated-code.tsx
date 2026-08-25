'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { CodeToken } from './code-panel';

export type CodeTokenKind = 'key' | 'string' | 'punct' | 'plain';
export interface Token {
  kind: CodeTokenKind;
  text: string;
}

export type AnimatedCodeMode = 'scramble' | 'type' | 'reveal' | 'static';

export interface AnimatedCodeProps {
  code: string | Token[][];
  mode: AnimatedCodeMode;
  /** 'type' mode: per-character delay (default 15ms, spec range 12-18). */
  charMs?: number;
  /** 'reveal' mode: per-line stagger (default 50ms, spec range 40-60). */
  lineMs?: number;
  loop?: boolean;
  /** Gate the animation start on IntersectionObserver (>=40% visible). Default true. */
  playOnView?: boolean;
  /** 'scramble' mode: total window over which values resolve (default 2200ms). */
  resolveMs?: number;
  /** Fires once when a non-looping run completes (or immediately, for 'static'/reduced-motion). */
  onDone?: () => void;
  className?: string;
}

const SCRAMBLE_GLYPHS = '░▒▓█ABCabc019';

/** Lexes a raw code string into key / string / punct / plain tokens per line. */
function tokenizeLines(code: string): Token[][] {
  return code.split('\n').map((line) => tokenizeLine(line));
}

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  // Capture each quoted string plus any whitespace+colon that follows it, so a
  // JSON key ("markdown":) can be told apart from a value ("markdown") — only
  // values scramble; keys stay static like every other structural token.
  const parts = line.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')(\s*:)?/g);
  for (let i = 0; i < parts.length; i += 3) {
    const plain = parts[i];
    const quoted = parts[i + 1];
    const colon = parts[i + 2];
    if (plain) tokenizePlain(plain, tokens);
    if (quoted) {
      const isKey = Boolean(colon);
      tokens.push({ kind: isKey ? 'key' : 'string', text: quoted });
      if (colon) tokens.push({ kind: 'punct', text: colon });
    }
  }
  return tokens;
}

function tokenizePlain(part: string, tokens: Token[]): void {
  // split remaining plain text on punctuation runs so { } [ ] : , stay their own tokens
  const bits = part.split(/([{}[\]:,()])/g);
  for (const bit of bits) {
    if (!bit) continue;
    if (/^[{}[\]:,()]$/.test(bit)) {
      tokens.push({ kind: 'punct', text: bit });
    } else if (/^\s*[A-Za-z0-9_.$-]+\s*$/.test(bit) && /^[A-Za-z_$]/.test(bit.trim())) {
      tokens.push({ kind: 'key', text: bit });
    } else {
      tokens.push({ kind: 'plain', text: bit });
    }
  }
}

export function usePrefersReducedMotion(): boolean {
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

function useInView(ref: React.RefObject<Element | null>, enabled: boolean) {
  const [inView, setInView] = React.useState(!enabled);
  React.useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? false), { threshold: 0.4 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, enabled]);
  return inView;
}

export function randomGlyphString(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += SCRAMBLE_GLYPHS[Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)];
  }
  return out;
}

export function AnimatedCode({ code, mode, charMs = 15, lineMs = 50, loop = false, playOnView = true, resolveMs = 2200, onDone, className }: AnimatedCodeProps) {
  const lines = React.useMemo<Token[][]>(() => (typeof code === 'string' ? tokenizeLines(code) : code), [code]);
  const reducedMotion = usePrefersReducedMotion();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, playOnView && !reducedMotion);
  const shouldAnimate = !reducedMotion && (playOnView ? inView : true) && mode !== 'static';
  const isSettled = mode === 'static' || reducedMotion;

  React.useEffect(() => {
    if (isSettled) onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSettled]);

  if (isSettled) {
    return (
      <div ref={containerRef} className={cn('min-w-0 max-w-full', className)}>
        <StaticLines lines={lines} />
      </div>
    );
  }

  if (mode === 'scramble') {
    return (
      <div ref={containerRef} className={cn('min-w-0 max-w-full', className)}>
        <ScrambleCode lines={lines} active={shouldAnimate} loop={loop} resolveMs={resolveMs} />
      </div>
    );
  }

  if (mode === 'type') {
    return (
      <div ref={containerRef} className={cn('min-w-0 max-w-full', className)}>
        <TypeCode lines={lines} active={shouldAnimate} loop={loop} charMs={charMs} onDone={onDone} />
      </div>
    );
  }

  // reveal
  return (
    <div ref={containerRef} className={cn('min-w-0 max-w-full', className)}>
      <RevealCode lines={lines} active={shouldAnimate} loop={loop} lineMs={lineMs} />
    </div>
  );
}

function StaticLines({ lines }: { lines: Token[][] }) {
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed sm:whitespace-pre sm:break-normal">
      {lines.map((line, i) => (
        <div key={i}>
          {line.map((t, j) => (
            <CodeToken key={j} kind={t.kind}>
              {t.text}
            </CodeToken>
          ))}
          {line.length === 0 && ' '}
        </div>
      ))}
    </pre>
  );
}

/* ---------------------------------------------------------------------- */
/* scramble: values (string/number tokens) cycle glyphs then resolve      */
/* independently at staggered times within resolveMs; loop re-scrambles   */
/* after a hold.                                                          */
/* ---------------------------------------------------------------------- */

interface ScrambleValueState {
  lineIndex: number;
  tokenIndex: number;
  target: string;
  resolveAt: number;
}

function ScrambleCode({ lines, active, loop, resolveMs }: { lines: Token[][]; active: boolean; loop: boolean; resolveMs: number }) {
  const [display, setDisplay] = React.useState<Token[][]>(() => lines);
  const [runId, setRunId] = React.useState(0);

  React.useEffect(() => {
    if (!active) return;
    let raf = 0;
    let cancelled = false;
    const start = performance.now();

    const values: ScrambleValueState[] = [];
    lines.forEach((line, li) => {
      line.forEach((tok, ti) => {
        if (tok.kind === 'string') {
          values.push({
            lineIndex: li,
            tokenIndex: ti,
            target: tok.text,
            resolveAt: (values.length / Math.max(1, countValues(lines))) * resolveMs * 0.7 + resolveMs * 0.3 * Math.random(),
          });
        }
      });
    });

    function countValues(ls: Token[][]): number {
      let n = 0;
      for (const line of ls) for (const t of line) if (t.kind === 'string') n++;
      return n;
    }

    let lastTick = 0;
    const TICK_MS = 65;

    function tick(now: number) {
      if (cancelled) return;
      const elapsed = now - start;
      if (now - lastTick >= TICK_MS) {
        lastTick = now;
        const next: Token[][] = lines.map((line) => line.map((t) => ({ ...t })));
        for (const v of values) {
          const resolved = elapsed >= v.resolveAt;
          const cell = next[v.lineIndex]?.[v.tokenIndex];
          if (!cell) continue;
          if (resolved) {
            cell.text = v.target;
          } else {
            const inner = v.target.slice(1, -1);
            const quote = v.target[0] === "'" ? "'" : '"';
            cell.text = `${quote}${randomGlyphString(Math.max(1, inner.length))}${quote}`;
          }
        }
        setDisplay(next);
      }
      const allResolved = values.every((v) => elapsed >= v.resolveAt);
      if (allResolved) {
        if (loop) {
          // hold on resolved frame, then start a new run
          setTimeout(() => {
            if (!cancelled) setRunId((k) => k + 1);
          }, 1400);
          return;
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [active, lines, resolveMs, loop, runId]);

  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed sm:whitespace-pre sm:break-normal">
      {display.map((line, i) => (
        <div key={i}>
          {line.map((t, j) => (
            <CodeToken key={j} kind={t.kind}>
              {t.text}
            </CodeToken>
          ))}
          {line.length === 0 && ' '}
        </div>
      ))}
    </pre>
  );
}

/* ---------------------------------------------------------------------- */
/* type: character-by-character typewriter with a blinking block cursor.  */
/* ---------------------------------------------------------------------- */

function TypeCode({ lines, active, loop, charMs, onDone }: { lines: Token[][]; active: boolean; loop: boolean; charMs: number; onDone?: (() => void) | undefined }) {
  const fullText = React.useMemo(() => lines.map((l) => l.map((t) => t.text).join('')).join('\n'), [lines]);
  const [visibleChars, setVisibleChars] = React.useState(0);
  const [done, setDone] = React.useState(false);
  const [runId, setRunId] = React.useState(0);

  React.useEffect(() => {
    if (!active) return;
    setVisibleChars(0);
    setDone(false);
    let cancelled = false;
    let i = 0;
    function step() {
      if (cancelled) return;
      i++;
      setVisibleChars(i);
      if (i >= fullText.length) {
        setDone(true);
        onDone?.();
        if (loop) {
          setTimeout(() => {
            if (!cancelled) setRunId((k) => k + 1);
          }, 1600);
        }
        return;
      }
      const ch = fullText[i - 1];
      const delay = ch === '\n' ? charMs * 6 : charMs;
      window.setTimeout(step, delay);
    }
    const t = window.setTimeout(step, charMs);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, fullText, charMs, loop, runId]);

  const visible = fullText.slice(0, visibleChars);
  const visibleLines = visible.split('\n');

  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed sm:whitespace-pre sm:break-normal">
      {reTokenizeVisible(lines, visibleLines).map((line, i) => (
        <div key={i}>
          {line.map((t, j) => (
            <CodeToken key={j} kind={t.kind}>
              {t.text}
            </CodeToken>
          ))}
          {i === visibleLines.length - 1 && !done && (
            <span aria-hidden className="inline-block w-[7px] translate-y-[1px] animate-cursor-blink bg-current align-middle">
              &#0;
            </span>
          )}
          {line.length === 0 && i !== visibleLines.length - 1 && ' '}
        </div>
      ))}
    </pre>
  );
}

/** Re-slices the original token/kind structure down to however many chars of each line are visible. */
function reTokenizeVisible(lines: Token[][], visibleLines: string[]): Token[][] {
  return lines.slice(0, visibleLines.length).map((line, li) => {
    const budget = visibleLines[li]?.length ?? 0;
    let remaining = budget;
    const out: Token[] = [];
    for (const tok of line) {
      if (remaining <= 0) break;
      if (tok.text.length <= remaining) {
        out.push(tok);
        remaining -= tok.text.length;
      } else {
        out.push({ kind: tok.kind, text: tok.text.slice(0, remaining) });
        remaining = 0;
      }
    }
    return out;
  });
}

/* ---------------------------------------------------------------------- */
/* reveal: per-line fade-in-up, staggered.                                */
/* ---------------------------------------------------------------------- */

function RevealCode({ lines, active, loop, lineMs }: { lines: Token[][]; active: boolean; loop: boolean; lineMs: number }) {
  const [runId, setRunId] = React.useState(0);
  const [visible, setVisible] = React.useState(!active);

  React.useEffect(() => {
    if (!active) return;
    setVisible(true);
    if (loop) {
      const total = lines.length * lineMs + 1800;
      const t = setTimeout(() => {
        setVisible(false);
        setTimeout(() => setRunId((k) => k + 1), 60);
      }, total);
      return () => clearTimeout(t);
    }
  }, [active, loop, lines.length, lineMs, runId]);

  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed sm:whitespace-pre sm:break-normal">
      {lines.map((line, i) => (
        <div
          key={`${runId}-${i}`}
          className={visible ? 'animate-fade-in-up' : 'opacity-0'}
          style={visible ? { animationDelay: `${i * lineMs}ms`, animationFillMode: 'both' } : undefined}
        >
          {line.map((t, j) => (
            <CodeToken key={j} kind={t.kind}>
              {t.text}
            </CodeToken>
          ))}
          {line.length === 0 && ' '}
        </div>
      ))}
    </pre>
  );
}
