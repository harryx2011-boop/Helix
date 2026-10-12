'use client';

import * as React from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CodePanel } from '@/components/shared/code-panel';

/**
 * §4.5a: types the first-run transcript line by line on scroll-in, with
 * `◇/◆` health rows, then holds settled. Replay button re-runs it.
 */
interface TranscriptLine {
  text: string;
  health?: boolean;
}

const TRANSCRIPT: TranscriptLine[] = [
  { text: '$ docker compose up' },
  { text: '◇  postgres        starting', health: true },
  { text: '◆  postgres        healthy        1.2s', health: true },
  { text: '◆  helix-fetch     healthy        0.8s', health: true },
  { text: '◆  helix-extract   healthy        2.1s', health: true },
  { text: '◆  helix-api       healthy        0.6s', health: true },
  { text: '   dashboard  → http://localhost:3400' },
  { text: '   api        → http://localhost:7400/v1' },
  { text: '' },
  { text: '$ curl -X POST localhost:7400/v1/scrape \\' },
  { text: '    -H "Authorization: Bearer $HELIX_BOOTSTRAP_KEY" \\' },
  { text: "    -d '{\"url\":\"https://example.com\"}'" },
  { text: '{ "success": true, "data": { "markdown": "# Example Domain…" } }' },
];

const LINE_MS = 220;

export function TerminalReplay({ className }: { className?: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [playKey, setPlayKey] = React.useState(0);
  const [hasPlayed, setHasPlayed] = React.useState(false);
  const [lineCount, setLineCount] = React.useState(0);
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
  }, []);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || hasPlayed) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setHasPlayed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasPlayed]);

  React.useEffect(() => {
    if (!hasPlayed) return;
    if (reducedMotion) {
      setLineCount(TRANSCRIPT.length);
      return;
    }
    setLineCount(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= TRANSCRIPT.length; i++) {
      timers.push(setTimeout(() => setLineCount(i), i * LINE_MS));
    }
    return () => timers.forEach(clearTimeout);
  }, [hasPlayed, playKey, reducedMotion]);

  return (
    <div ref={containerRef} className={className}>
      <CodePanel chrome="terminal" label="localhost — helix">
        <pre className="whitespace-pre-wrap break-all font-mono text-[13px] leading-relaxed">
          {TRANSCRIPT.slice(0, lineCount).map((line, i) => (
            <div key={i} className={cn(line.health && 'text-success')}>
              {line.text || ' '}
            </div>
          ))}
        </pre>
      </CodePanel>
      <button
        type="button"
        onClick={() => setPlayKey((k) => k + 1)}
        className="mt-3 flex items-center gap-1.5 font-mono text-[12px] text-m-ink/48 transition-colors duration-150 ease-out hover:text-m-ink/72"
      >
        <RotateCcw className="h-3 w-3" aria-hidden />
        Replay
      </button>
    </div>
  );
}
