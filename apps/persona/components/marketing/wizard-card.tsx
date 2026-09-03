'use client';

import { useEffect, useRef, useState } from 'react';

interface Step {
  question: string;
  answer: string;
  token: string;
}

const STEPS: Step[] = [
  { question: 'Company or product name', answer: 'Acme Cloud', token: '{{COMPANY_NAME}}' },
  { question: 'Help centre URL', answer: 'help.acmecloud.com', token: '{{HELP_CENTER_URL}}' },
  { question: 'Human handoff queue', answer: 'tier-2-support', token: '{{HANDOFF_QUEUE_NAME}}' },
  { question: 'Attempts before escalating', answer: '3', token: '{{MAX_TROUBLESHOOTING_STEPS}}' },
];

const STEP_MS = 2200;
const TYPE_MS = 55;

const PROMPT_LINES = [
  'You are the support agent for {{COMPANY_NAME}}.',
  'Point customers to {{HELP_CENTER_URL}} before troubleshooting.',
  'Escalate unresolved issues to {{HANDOFF_QUEUE_NAME}}.',
  'Attempt at most {{MAX_TROUBLESHOOTING_STEPS}} fixes before handing off.',
];

/**
 * Auto-advancing 4-step wizard demo: striped progress bar, step dots, a
 * typing mock answer, and a prompt excerpt where each {{TOKEN}} pill fills
 * in as its step lands (PERSONA.md §5).
 */
export function WizardCard() {
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState('');
  const [filled, setFilled] = useState<boolean[]>([false, false, false, false]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? true), { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setStep(STEPS.length - 1);
      setTyped(STEPS[STEPS.length - 1]!.answer);
      setFilled([true, true, true, true]);
      return;
    }
    if (!visible) return;

    const current = STEPS[step]!;
    let charTimer: ReturnType<typeof setTimeout>;
    let advanceTimer: ReturnType<typeof setTimeout>;

    if (typed.length < current.answer.length) {
      charTimer = setTimeout(() => setTyped(current.answer.slice(0, typed.length + 1)), TYPE_MS);
    } else {
      advanceTimer = setTimeout(() => {
        setFilled((f) => f.map((v, i) => (i === step ? true : v)));
        setTyped('');
        if (step === STEPS.length - 1) {
          setFilled([false, false, false, false]);
          setStep(0);
        } else {
          setStep((s) => s + 1);
        }
      }, STEP_MS - current.answer.length * TYPE_MS);
    }

    return () => {
      clearTimeout(charTimer);
      clearTimeout(advanceTimer);
    };
  }, [step, typed, visible, reducedMotion]);

  const progress = ((step + 1) / STEPS.length) * 100;
  const current = STEPS[step]!;

  return (
    <div ref={containerRef} className="grid gap-8 lg:grid-cols-2 lg:items-center">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-p-ink sm:text-[34px]">
          Fill in the blanks, not the whole prompt.
        </h2>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-p-ink-2">
          The engine scans every persona for its <span className="font-mono text-[0.92em] text-p-ink">{'{{PLACEHOLDER}}'}</span> tokens
          and asks for each value once, in plain language.
        </p>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-p-ink-2">
          Answers are saved, so filling in your company name and help centre URL once carries through to every persona that needs them.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-panel border border-p-line bg-p-surface p-6 shadow-panel grid-glow">
        <div className="relative">
          <div className="h-1.5 w-full overflow-hidden rounded-pill bg-p-line">
            <div
              className="stripe-bar h-full rounded-pill transition-[width] duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="mt-4 flex items-center gap-2">
            {STEPS.map((s, i) => (
              <span
                key={s.token}
                className="h-1.5 w-1.5 rounded-full transition-colors duration-200"
                style={{ backgroundColor: i <= step ? 'var(--p-blue)' : 'var(--p-line-2)' }}
              />
            ))}
            <span className="ml-1 font-mono text-[11px] text-p-ink-3">
              {step + 1} / {STEPS.length}
            </span>
          </div>

          <div className="mt-5">
            <div className="text-[13px] font-medium text-p-ink-2">{current.question}</div>
            <div className="mt-2 flex h-9 items-center rounded-card border border-p-line bg-p-bg px-3">
              <span className="font-mono text-sm text-p-ink">
                {typed}
                <span className="ml-px inline-block w-px animate-blink bg-p-ink align-middle" style={{ height: '1em' }} />
              </span>
            </div>
          </div>

          <div className="mt-5 rounded-card border border-p-line bg-p-code p-3.5">
            <div className="font-mono text-[12px] leading-relaxed text-p-ink-2">
              {PROMPT_LINES.map((line, i) => (
                <p key={i} className="mb-1 last:mb-0">
                  {renderPromptLine(line, filled)}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderPromptLine(line: string, filled: boolean[]) {
  const parts = line.split(/(\{\{[A-Z_]+\}\})/g);
  return parts.map((part, i) => {
    const match = part.match(/^\{\{([A-Z_]+)\}\}$/);
    if (!match) return <span key={i}>{part}</span>;
    const idx = STEPS.findIndex((s) => s.token === part);
    const isFilled = idx >= 0 && filled[idx];
    return (
      <span
        key={i}
        className={`rounded-pill px-1.5 py-0.5 transition-colors duration-200 ${
          isFilled ? 'bg-p-surface text-p-ink' : 'bg-blue-soft text-blue'
        }`}
      >
        {isFilled ? STEPS[idx]!.answer : part}
      </span>
    );
  });
}
