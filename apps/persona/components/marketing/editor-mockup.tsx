'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { Bold, Italic, List, Download } from 'lucide-react';
import { BrowserWindow } from '@/components/marketing/browser-window';
import { AnimatedCursor } from '@/components/marketing/animated-cursor';

const CYCLE_MS = 9000;

type Phase = 'idle' | 'select' | 'bold' | 'toExport' | 'exportOpen' | 'pickPdf' | 'reset';

const CURSOR_FRAMES = {
  x: [220, 220, 90, 90, 44, 44, 44, 240, 240, 220],
  y: [150, 150, 44, 44, 20, 20, 20, 80, 108, 150],
  times: [0, 0.04, 0.18, 0.22, 0.36, 0.4, 0.55, 0.72, 0.78, 1],
  clicksAt: [5, 8],
  duration: CYCLE_MS / 1000,
};

/**
 * Looping editor mockup: cursor highlights the heading, clicks Bold in the
 * toolbar, then opens Export and picks .pdf.
 */
export function EditorMockup() {
  const [phase, setPhase] = useState<Phase>('idle');
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? true), { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (reduced) {
      setPhase('bold');
      return;
    }
    if (!visible) return;

    const sequence: [Phase, number][] = [
      ['select', 1600],
      ['bold', 800],
      ['toExport', 1500],
      ['exportOpen', 900],
      ['pickPdf', 900],
      ['reset', 2700],
    ];
    const idx = sequence.findIndex(([p]) => p === phase);
    const next = idx >= 0 ? sequence[(idx + 1) % sequence.length] : sequence[0];
    const delay = idx >= 0 ? sequence[idx]![1] : 400;
    const timer = setTimeout(() => setPhase(idx >= 0 ? next![0] : 'select'), delay);
    return () => clearTimeout(timer);
  }, [phase, visible, reduced]);

  const selected = phase === 'select' || phase === 'bold' || phase === 'toExport' || phase === 'exportOpen' || phase === 'pickPdf';
  const bold = phase === 'bold' || phase === 'toExport' || phase === 'exportOpen' || phase === 'pickPdf' || phase === 'reset';
  const exportOpen = phase === 'exportOpen' || phase === 'pickPdf';
  const pdfPicked = phase === 'pickPdf';

  return (
    <div ref={containerRef}>
      <BrowserWindow url="persona-ai.vercel.app/editor/support-chat">
        <div className="relative h-[260px] bg-p-bg p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 rounded-card border border-p-line bg-p-surface px-1.5 py-1">
              <span className={`flex h-6 w-6 items-center justify-center rounded-sm transition-colors duration-150 ${bold ? 'bg-p-code text-p-ink' : 'text-p-ink-3'}`}>
                <Bold className="h-3.5 w-3.5" />
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded-sm text-p-ink-3">
                <Italic className="h-3.5 w-3.5" />
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded-sm text-p-ink-3">
                <List className="h-3.5 w-3.5" />
              </span>
            </div>

            <span className="relative inline-flex items-center gap-1.5 rounded-pill border border-p-line-2 px-3 py-1.5 text-[12px] font-medium text-p-ink">
              <Download className="h-3 w-3" />
              Export
            </span>
          </div>

          <div className="mt-4 rounded-card border border-p-line bg-p-surface p-3.5">
            <div
              className={`inline text-[15px] transition-[background-color] duration-200 ${bold ? 'font-semibold' : 'font-normal'}`}
              style={{ backgroundColor: selected && !bold ? 'var(--p-blue-soft)' : 'transparent' }}
            >
              Support (Chat) — v2
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-p-ink-2">
              You are the support agent for Acme Cloud. Point customers to the help centre before troubleshooting.
            </p>
          </div>

          <AnimatePresence>
            {exportOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                className="absolute right-5 top-[52px] w-36 rounded-card border border-p-line bg-p-surface p-1.5 shadow-panel"
              >
                {['.md', '.txt', '.json', '.pdf'].map((ext) => (
                  <div
                    key={ext}
                    className={`rounded-sm px-2.5 py-1.5 font-mono text-[12px] transition-colors duration-150 ${
                      pdfPicked && ext === '.pdf' ? 'bg-blue-soft text-blue' : 'text-p-ink-2'
                    }`}
                  >
                    {ext}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {!reduced && <AnimatedCursor frames={CURSOR_FRAMES} />}
        </div>
      </BrowserWindow>
    </div>
  );
}
