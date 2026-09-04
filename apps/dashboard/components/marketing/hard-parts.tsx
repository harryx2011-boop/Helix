'use client';

import * as React from 'react';
import { FileStack, Braces, Check, Navigation, MousePointerClick, TextCursorInput, Timer, MoveVertical, Keyboard, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FrameBand } from './section-frame';
import { CodePanel } from './code-panel';
import { IconTile } from './icon-tile';
import { CodeRain, mulberry32, useReducedMotion } from './ambient';
import { AnimatedCode, type Token } from './animated-code';

function useInView(ref: React.RefObject<Element | null>): boolean {
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? false), { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

/* ---------------------------------------------------------------------- */
/* DocParse: browser strip + document card + ASCII particle stream +      */
/* a "Parsing… / Parsed" status chip, cycling through four file types.    */
/* ---------------------------------------------------------------------- */

type DocFile = { name: string; badge: string };
const DOC_FILES: DocFile[] = [
  { name: 'invoice.pdf', badge: 'PDF' },
  { name: 'contract.docx', badge: 'DOCX' },
  { name: 'deck.pptx', badge: 'PPTX' },
  { name: 'sheet.xlsx', badge: 'XLSX' },
  { name: 'guide.html', badge: 'HTML' },
];

const BADGE_CLASS: Record<string, string> = {
  PDF: 'bg-violet text-white',
  DOCX: 'bg-violet text-white',
  PPTX: 'bg-violet text-white',
  XLSX: 'bg-violet text-white',
  HTML: 'bg-m-ink/72 text-white',
};

const PARTICLE_CHARS = '.:-=+*#%X';
const STEP_MS = 2800;
const PARSED_HOLD_MS = 700;

function particleFrame(rows: number, cols: number, tick: number, seed: number): string {
  const grid = Array.from({ length: rows }, () => Array<string>(cols).fill(' '));
  const rng = mulberry32(seed + tick);
  const count = Math.floor(rows * cols * 0.22);
  for (let i = 0; i < count; i++) {
    const r = Math.floor(rng() * rows);
    const c = Math.floor(rng() * cols);
    const idx = Math.floor(rng() * PARTICLE_CHARS.length);
    grid[r]![c] = PARTICLE_CHARS[idx]!;
  }
  return grid.map((row) => row.join('')).join('\n');
}

function DocParse({ quiet }: { quiet: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const running = inView && !reduced && !quiet;
  const [fileIndex, setFileIndex] = React.useState(0);
  const [phase, setPhase] = React.useState<'parsing' | 'parsed'>('parsing');
  const [ellipsis, setEllipsis] = React.useState(1);
  const [frame, setFrame] = React.useState(() => particleFrame(6, 12, 0, 5));
  const tickRef = React.useRef(0);

  React.useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let stepTimer: ReturnType<typeof setTimeout> | undefined;

    function cycle() {
      setPhase('parsing');
      stepTimer = setTimeout(() => {
        if (cancelled) return;
        setPhase('parsed');
        stepTimer = setTimeout(() => {
          if (cancelled) return;
          setFileIndex((i) => (i + 1) % DOC_FILES.length);
          cycle();
        }, PARSED_HOLD_MS);
      }, STEP_MS - PARSED_HOLD_MS);
    }
    cycle();
    return () => {
      cancelled = true;
      if (stepTimer) clearTimeout(stepTimer);
    };
  }, [running]);

  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setEllipsis((e) => (e % 3) + 1), 400);
    return () => clearInterval(id);
  }, [running]);

  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      tickRef.current += 1;
      setFrame(particleFrame(6, 12, tickRef.current, 5));
    }, 160);
    return () => clearInterval(id);
  }, [running]);

  const file = DOC_FILES[reduced ? 0 : fileIndex]!;
  const showParsed = reduced || phase === 'parsed';

  return (
    <div ref={ref} aria-hidden="true" className="relative mt-6 select-none overflow-hidden rounded-panel border border-m-border-muted bg-m-bg">
      <div className="flex items-center gap-1.5 border-b border-m-border-faint px-3 py-2">
        <span className="flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-m-ink/12" />
          <span className="h-1.5 w-1.5 rounded-full bg-m-ink/12" />
          <span className="h-1.5 w-1.5 rounded-full bg-m-ink/12" />
        </span>
        <span className="flex-1 truncate rounded-card bg-m-surface px-2 py-0.5 text-center font-mono text-[11px] text-m-ink/48">
          https://example.com/docs/<span className="text-m-ink/72">{file.name}</span>
        </span>
      </div>

      <div className="relative flex items-center justify-center px-6 py-6">
        <div className="relative h-[92px] w-[76px] rounded-card border border-m-border-muted bg-m-surface p-2.5 shadow-card-sm">
          <span className={cn('absolute -right-2 -top-2 rounded-card px-1.5 py-0.5 font-mono text-[10px] transition-colors duration-reveal ease-out', BADGE_CLASS[file.badge])}>
            {file.badge}
          </span>
          <div className="flex flex-col gap-1.5">
            <span className="h-1.5 w-full rounded-full bg-violet" />
            <span className="h-1.5 w-[85%] rounded-full bg-m-illus" />
            <span className="h-1.5 w-full rounded-full bg-m-illus" />
            <span className="h-1.5 w-[70%] rounded-full bg-m-illus" />
            <span className="h-1.5 w-[90%] rounded-full bg-m-illus" />
          </div>

          {!reduced && (
            <pre
              aria-hidden
              className={cn(
                'pointer-events-none absolute -bottom-3 -right-3 whitespace-pre font-mono text-[7px] leading-[1.3] text-violet-48 transition-opacity duration-reveal ease-out',
                phase === 'parsing' ? 'opacity-100' : 'opacity-0',
              )}
            >
              {frame}
            </pre>
          )}
        </div>
      </div>

      <div className="flex justify-center pb-4">
        <span className="inline-flex items-center gap-1.5 rounded-pill border border-m-border-muted bg-m-surface px-2.5 py-1 font-mono text-[11px] text-m-ink/64">
          {showParsed ? (
            <>
              <Check className="h-3 w-3 text-success" aria-hidden />
              Parsed
            </>
          ) : (
            <>Parsing{'.'.repeat(ellipsis)}</>
          )}
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* JsonExtract: mini page with skeleton + price, and a JSON block whose    */
/* values scramble then resolve via AnimatedCode, synced to a status chip. */
/* ---------------------------------------------------------------------- */

const K = (text: string): Token => ({ kind: 'key', text });
const S = (text: string): Token => ({ kind: 'string', text });
const P = (text: string): Token => ({ kind: 'punct', text });
const PL = (text: string): Token => ({ kind: 'plain', text });

const JSON_TOKENS: Token[][] = [
  [P('{')],
  [PL('  '), K('"plans"'), P(':'), PL(' '), P('[')],
  [PL('    '), P('{'), K('"name"'), P(':'), PL(' '), S('"Pro"'), P(',')],
  [PL('      '), K('"monthlyPrice"'), P(':'), PL(' '), S('"79"'), PL(' '), P('}')],
  [PL('  '), P(']')],
  [P('}')],
];

const RESOLVE_MS = 1800;

function JsonExtract({ quiet }: { quiet: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const running = inView && !reduced && !quiet;
  const [phase, setPhase] = React.useState<'extracting' | 'done'>('extracting');

  React.useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let t1: ReturnType<typeof setTimeout> | undefined;
    let t2: ReturnType<typeof setTimeout> | undefined;

    function cycle() {
      setPhase('extracting');
      t1 = setTimeout(() => {
        if (cancelled) return;
        setPhase('done');
        t2 = setTimeout(() => {
          if (!cancelled) cycle();
        }, 1400);
      }, RESOLVE_MS);
    }
    cycle();
    return () => {
      cancelled = true;
      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, [running]);

  const showDone = reduced || phase === 'done';

  return (
    <div ref={ref} aria-hidden="true" className="relative mt-6 select-none overflow-hidden rounded-panel border border-m-border-muted bg-m-bg">
      <div className="flex items-center gap-1.5 border-b border-m-border-faint px-3 py-2">
        <span className="flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-m-ink/12" />
          <span className="h-1.5 w-1.5 rounded-full bg-m-ink/12" />
          <span className="h-1.5 w-1.5 rounded-full bg-m-ink/12" />
        </span>
        <span className="flex-1 truncate rounded-card bg-m-surface px-2 py-0.5 text-center font-mono text-[11px] text-m-ink/48">
          https://example.com/pricing
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 py-4">
        <div className="min-w-0 rounded-card border border-m-border-muted bg-m-surface p-2.5">
          <div className="flex flex-col gap-1.5">
            <span className="h-1.5 w-full rounded-full bg-m-illus" />
            <span className="h-1.5 w-[80%] rounded-full bg-m-illus" />
            <span className="h-1.5 w-[60%] rounded-full bg-m-illus" />
          </div>
          <p className="mt-2.5 font-mono text-[13px] font-medium text-m-ink">
            $79 <span className="text-m-ink/48">/ month</span>
          </p>
        </div>

        <div className="min-w-0 [&_pre]:text-[10px]">
          <CodePanel chrome="terminal" className="rounded-card">
            <AnimatedCode code={JSON_TOKENS} mode="scramble" resolveMs={RESOLVE_MS} loop playOnView />
          </CodePanel>
        </div>
      </div>

      <div className="flex justify-center pb-4">
        <span className="inline-flex items-center gap-1.5 rounded-pill border border-m-border-muted bg-m-surface px-2.5 py-1 font-mono text-[11px] text-m-ink/64">
          {showDone ? (
            <>
              <Check className="h-3 w-3 text-success" aria-hidden />
              Done
            </>
          ) : (
            'Extracting…'
          )}
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* ActionGrid: the Interact action set as a 4x2 hairline grid. A run walks */
/* the tiles in order, then holds on "done" before starting over.          */
/* ---------------------------------------------------------------------- */

/** The `InteractActionSchema` union minus `executeJavascript`, in the order a session usually runs them. */
const ACTIONS = [
  { type: 'navigate', label: 'Navigate', icon: Navigation },
  { type: 'click', label: 'Click', icon: MousePointerClick },
  { type: 'type', label: 'Type', icon: TextCursorInput },
  { type: 'wait', label: 'Wait', icon: Timer },
  { type: 'scroll', label: 'Scroll', icon: MoveVertical },
  { type: 'press', label: 'Press', icon: Keyboard },
  { type: 'screenshot', label: 'Screenshot', icon: Camera },
  { type: 'extract', label: 'Extract', icon: Braces },
] as const;

const ACTION_STEP_MS = 650;
const ACTION_HOLD_MS = 1100;

function ActionGrid({ quiet }: { quiet: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const running = inView && !reduced && !quiet;
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function tick(next: number) {
      setStep(next);
      const done = next >= ACTIONS.length;
      timer = setTimeout(() => {
        if (!cancelled) tick(done ? 0 : next + 1);
      }, done ? ACTION_HOLD_MS : ACTION_STEP_MS);
    }
    tick(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [running]);

  const done = !reduced && step >= ACTIONS.length;
  const current = reduced ? -1 : step;

  return (
    <div ref={ref} aria-hidden="true" className="relative mt-6 select-none overflow-hidden rounded-panel border border-m-border-muted bg-m-bg">
      <div className="flex items-center gap-1.5 border-b border-m-border-faint px-3 py-2">
        <span className="flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-m-ink/12" />
          <span className="h-1.5 w-1.5 rounded-full bg-m-ink/12" />
          <span className="h-1.5 w-1.5 rounded-full bg-m-ink/12" />
        </span>
        <span className="flex-1 truncate rounded-card bg-m-surface px-2 py-0.5 text-center font-mono text-[11px] text-m-ink/48">
          https://example.com/shop
        </span>
      </div>

      <div className="grid grid-cols-4">
        {ACTIONS.map((action, i) => {
          const Icon = action.icon;
          const active = i === current;
          const ran = done || reduced || i < current;
          return (
            <div
              key={action.type}
              className="flex flex-col items-center gap-2 border-m-border-faint px-1 py-3.5 [&:nth-child(-n+4)]:border-b [&:not(:nth-child(4n))]:border-r"
            >
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-card border transition-colors duration-150 ease-out',
                  active
                    ? 'border-violet bg-violet-4 text-violet'
                    : ran
                      ? 'border-m-border-muted bg-m-surface text-m-ink/72'
                      : 'border-m-border-muted bg-m-surface text-m-ink/40',
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <span className={cn('font-mono text-[11px] transition-colors duration-150 ease-out', active ? 'text-violet' : 'text-m-ink/56')}>
                {action.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center border-t border-m-border-faint py-4">
        <span className="inline-flex items-center gap-1.5 rounded-pill border border-m-border-muted bg-m-surface px-2.5 py-1 font-mono text-[11px] text-m-ink/64">
          {reduced || done ? (
            <>
              <Check className="h-3 w-3 text-success" aria-hidden />
              {ACTIONS.length} actions run
            </>
          ) : (
            <>{ACTIONS[current]?.label}…</>
          )}
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* HardParts section                                                       */
/* ---------------------------------------------------------------------- */

export function HardParts() {
  return (
    <section className="px-6 py-16 sm:px-10">
      <FrameBand step="02" total="07" label="HARD PARTS" sub="Handled for you" icon={FileStack} />

      <div className="py-16">
        <div data-reveal className="relative mx-auto max-w-[640px] px-6 py-6 text-center">
          <CodeRain
            cols={22}
            rows={6}
            density={0.45}
            seed={73}
            className="hidden -inset-y-10 -inset-x-24 sm:block [mask-image:radial-gradient(ellipse_at_center,transparent_46%,black_66%,transparent_100%)]"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-[560px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
              The messy parts of the web,
              <br />
              <span className="text-violet">already handled.</span>
            </h2>
            <p className="mx-auto mt-3 max-w-[480px] text-[16px] leading-relaxed text-m-ink/72">
              Documents, unstructured pages and pages that need a browser come back the way your agent actually needs them.
            </p>
          </div>
        </div>

        <div data-reveal-group className="mt-10 grid grid-cols-1 overflow-hidden rounded-panel border border-m-border-muted bg-m-surface sm:grid-cols-2 lg:grid-cols-3">
          <div data-reveal-item className="min-w-0 border-b border-m-border-muted p-6 sm:border-r sm:p-8 lg:border-b-0">
            <p className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-wide text-m-ink/48">
              <IconTile icon={FileStack} size="sm" />
              Docs to data
            </p>
            <p className="mt-3 text-[15px] leading-relaxed">
              <span className="font-medium text-m-ink">Document parsing.</span>{' '}
              <span className="text-m-ink/64">PDF, DOCX, PPTX and XLSX come back as markdown, tables intact.</span>
            </p>
            <DocParse quiet={false} />
          </div>

          <div data-reveal-item className="min-w-0 border-b border-m-border-muted p-6 sm:p-8 lg:border-b-0 lg:border-r">
            <p className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-wide text-m-ink/48">
              <IconTile icon={Braces} size="sm" />
              Structured out
            </p>
            <p className="mt-3 text-[15px] leading-relaxed">
              <span className="font-medium text-m-ink">JSON extraction.</span>{' '}
              <span className="text-m-ink/64">Send a schema or a prompt; your own model fills it from the page.</span>
            </p>
            <JsonExtract quiet={false} />
          </div>

          <div data-reveal-item className="min-w-0 p-6 sm:col-span-2 sm:p-8 lg:col-span-1">
            <p className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-wide text-m-ink/48">
              <IconTile icon={MousePointerClick} size="sm" />
              Needs a browser
            </p>
            <p className="mt-3 text-[15px] leading-relaxed">
              <span className="font-medium text-m-ink">Browser actions.</span>{' '}
              <span className="text-m-ink/64">Click, type, scroll, wait, press and extract on any page, in one request.</span>
            </p>
            <ActionGrid quiet={false} />
          </div>
        </div>
      </div>
    </section>
  );
}
