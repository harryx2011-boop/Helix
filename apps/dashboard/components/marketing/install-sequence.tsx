'use client';

import * as React from 'react';
import { RotateCcw } from '@/components/icons/lucide';
import { cn } from '@/lib/utils';
import { CodePanel } from '@/components/shared/code-panel';
import { useReducedMotion } from '@/components/shared/ambient';
import { FRAME_MS, LAST_FRAME, frameAt } from '@/lib/install-frames';

/**
 * Plays the install sequence once when scrolled into view and holds on the
 * terminal frame. Reduced motion renders the terminal frame directly: every
 * frame is legible as a still, so nothing is lost (DESIGN.md §6).
 */
export function InstallSequence({ installer, className }: { installer: string; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [started, setStarted] = React.useState(false);
  const [run, setRun] = React.useState(0);
  const [frame, setFrame] = React.useState(0);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || started) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [started]);

  React.useEffect(() => {
    if (!started) return;
    if (reduced) {
      setFrame(LAST_FRAME);
      return;
    }
    setFrame(0);
    const timer = window.setInterval(() => {
      setFrame((f) => {
        if (f >= LAST_FRAME) {
          window.clearInterval(timer);
          return f;
        }
        return f + 1;
      });
    }, FRAME_MS);
    return () => window.clearInterval(timer);
  }, [started, run, reduced]);

  const lines = frameAt(frame, installer);

  return (
    <div ref={ref} className={className}>
      <CodePanel chrome="terminal" label="Helix — first launch">
        <pre
          aria-label="Download, install, then the API, extract and fetch services start and Helix runs on this machine."
          role="img"
          className="min-h-[11.5em] whitespace-pre font-mono text-[11px] leading-relaxed sm:text-[13px]"
        >
          {lines.map((line, i) => (
            <div key={i} aria-hidden className={cn(line.tone === 'done' && 'text-success')}>
              {line.text}
            </div>
          ))}
        </pre>
      </CodePanel>
      {!reduced && (
        <button
          type="button"
          onClick={() => setRun((r) => r + 1)}
          className={cn(
            '-mx-1 mt-3 flex min-h-6 items-center gap-1.5 px-1 font-mono text-[12px] text-m-ink/72 transition-colors duration-150 ease-out hover:text-m-ink',
            frame < LAST_FRAME && 'invisible',
          )}
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          Replay
        </button>
      )}
    </div>
  );
}
