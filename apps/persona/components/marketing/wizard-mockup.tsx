'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { Wand2 } from 'lucide-react';
import { BrowserWindow } from '@/components/marketing/browser-window';
import { AnimatedCursor } from '@/components/marketing/animated-cursor';

const CYCLE_MS = 9000;
const ANSWER = 'Acme Cloud';
const TYPE_MS = 70;

type Phase = 'idle' | 'clicking' | 'dialog' | 'typing' | 'filled' | 'reset';

const CURSOR_FRAMES = {
  x: [200, 200, 96, 96, 96, 200],
  y: [140, 140, 40, 40, 40, 140],
  times: [0, 0.05, 0.28, 0.32, 0.85, 1],
  clicksAt: [3],
  duration: CYCLE_MS / 1000,
};

/**
 * Looping "how it works" mockup: cursor clicks Fill in the blanks, a dialog
 * opens with one question, the answer types in, and the {{COMPANY_NAME}}
 * pill in the prompt excerpt below fills in to match.
 */
export function WizardMockup() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [typed, setTyped] = useState('');
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
      setPhase('filled');
      setTyped(ANSWER);
      return;
    }
    if (!visible) return;

    let timer: ReturnType<typeof setTimeout>;
    if (phase === 'idle') {
      timer = setTimeout(() => setPhase('clicking'), 450);
    } else if (phase === 'clicking') {
      timer = setTimeout(() => setPhase('dialog'), 300);
    } else if (phase === 'dialog') {
      timer = setTimeout(() => setPhase('typing'), 400);
    } else if (phase === 'typing') {
      if (typed.length < ANSWER.length) {
        timer = setTimeout(() => setTyped(ANSWER.slice(0, typed.length + 1)), TYPE_MS);
      } else {
        timer = setTimeout(() => setPhase('filled'), 500);
      }
    } else if (phase === 'filled') {
      timer = setTimeout(() => setPhase('reset'), 3200);
    } else if (phase === 'reset') {
      timer = setTimeout(() => {
        setTyped('');
        setPhase('idle');
      }, 500);
    }
    return () => clearTimeout(timer);
  }, [phase, typed, visible, reduced]);

  const dialogOpen = phase === 'dialog' || phase === 'typing' || phase === 'filled';
  const isFilled = phase === 'filled' || phase === 'reset';

  return (
    <div ref={containerRef}>
      <BrowserWindow url="persona-ai.vercel.app/roles/support-chat">
        <div className="relative h-[260px] bg-p-bg p-5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-p-ink">Support (Chat)</span>
            <motion.button
              type="button"
              tabIndex={-1}
              className="pointer-events-none inline-flex items-center gap-1.5 rounded-pill bg-p-ink px-3 py-1.5 text-[12px] font-medium text-p-bg"
              animate={{ scale: !reduced && phase === 'clicking' ? 0.96 : 1 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
            >
              <Wand2 className="h-3 w-3" />
              Fill in the blanks
            </motion.button>
          </div>

          <div className="mt-4 rounded-card border border-p-line bg-p-code p-3">
            <div className="font-mono text-[11px] leading-relaxed text-p-ink-2">
              You are the support agent for{' '}
              <span
                className={`rounded-pill px-1.5 py-0.5 transition-colors duration-200 ${
                  isFilled ? 'bg-p-surface text-p-ink' : 'bg-blue-soft text-blue'
                }`}
              >
                {isFilled ? ANSWER : '{{COMPANY_NAME}}'}
              </span>
              .
            </div>
          </div>

          <AnimatePresence>
            {dialogOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="absolute left-5 right-5 top-[104px] rounded-panel border border-p-line bg-p-surface p-4 shadow-panel"
              >
                <div className="text-[12px] font-medium text-p-ink-2">Company or product name</div>
                <div className="mt-2 flex h-8 items-center rounded-card border border-p-line bg-p-bg px-2.5">
                  <span className="font-mono text-[13px] text-p-ink">
                    {typed}
                    {phase === 'typing' && (
                      <span className="ml-px inline-block w-px animate-blink bg-p-ink align-middle" style={{ height: '1em' }} />
                    )}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!reduced && <AnimatedCursor frames={CURSOR_FRAMES} />}
        </div>
      </BrowserWindow>
    </div>
  );
}
