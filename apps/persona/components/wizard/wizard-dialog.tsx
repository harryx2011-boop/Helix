'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, Pencil, X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { fillPlaceholders, type PlaceholderMeta } from '@/lib/placeholders';
import { useForks, useTemplateValues, newForkId, type Fork } from '@/lib/store';

/**
 * The templating wizard (PERSONA.md §6): one placeholder per step, answers
 * write through to `useTemplateValues` live, a striped progress bar plus step
 * dots track position, and the final step compiles the prompt for copy or a
 * new editor fork.
 */

export interface WizardTarget {
  roleSlug: string;
  personaSlug: string;
  sourceVersion: number;
  title: string;
  bodyMd: string;
  placeholders: PlaceholderMeta[];
  /** When filling an existing fork (editor "Fill" button), apply values to this fork instead of creating one. */
  forkId?: string;
}

interface WizardDialogProps {
  target: WizardTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Phase = 'steps' | 'summary';

export function WizardDialog({ target, open, onOpenChange }: WizardDialogProps) {
  const router = useRouter();
  const { values, setValue } = useTemplateValues();
  const { upsert } = useForks();
  const [stepIndex, setStepIndex] = React.useState(0);
  const [phase, setPhase] = React.useState<Phase>('steps');
  const [direction, setDirection] = React.useState<1 | -1>(1);
  const [draft, setDraft] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const placeholders = target?.placeholders ?? [];
  const step = placeholders[stepIndex];

  React.useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setPhase('steps');
    setDirection(1);
    setCopied(false);
  }, [open, target?.personaSlug, target?.forkId]);

  React.useEffect(() => {
    if (!open || phase !== 'steps' || !step) return;
    setDraft(values[step.key] ?? step.default ?? '');
  }, [open, phase, step, values]);

  React.useEffect(() => {
    if (phase === 'steps') {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [phase, stepIndex]);

  if (!target) return null;

  const total = placeholders.length;
  const answeredCount = placeholders.filter((p) => Boolean(values[p.key])).length;
  const progressPct = phase === 'summary' || total === 0 ? 100 : Math.round(((stepIndex + 1) / total) * 100);

  function commitDraft() {
    if (step) setValue(step.key, draft.trim());
  }

  function goNext() {
    commitDraft();
    setDirection(1);
    if (stepIndex + 1 < total) {
      setStepIndex((i) => i + 1);
    } else {
      setPhase('summary');
    }
  }

  function goBack() {
    if (stepIndex === 0) return;
    commitDraft();
    setDirection(-1);
    setStepIndex((i) => i - 1);
  }

  function skip() {
    setDirection(1);
    if (stepIndex + 1 < total) {
      setStepIndex((i) => i + 1);
    } else {
      setPhase('summary');
    }
  }

  function jumpTo(index: number) {
    commitDraft();
    setDirection(index > stepIndex ? 1 : -1);
    setStepIndex(index);
    setPhase('steps');
  }

  const compiled = target ? fillPlaceholders(target.bodyMd, values) : '';

  async function copyCompiled() {
    try {
      await navigator.clipboard.writeText(compiled);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  function openInEditor() {
    if (!target) return;
    if (target.forkId) {
      const now = new Date().toISOString();
      const existing = JSON.parse(window.localStorage.getItem('persona.forks') ?? '[]') as Fork[];
      const current = existing.find((f) => f.id === target.forkId);
      upsert({
        id: target.forkId,
        roleSlug: target.roleSlug,
        personaSlug: target.personaSlug,
        sourceVersion: target.sourceVersion,
        title: current?.title ?? target.title,
        bodyMd: compiled,
        values,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      });
      onOpenChange(false);
      return;
    }
    const id = newForkId();
    const now = new Date().toISOString();
    upsert({
      id,
      roleSlug: target.roleSlug,
      personaSlug: target.personaSlug,
      sourceVersion: target.sourceVersion,
      title: target.title,
      bodyMd: compiled,
      values,
      createdAt: now,
      updatedAt: now,
    });
    onOpenChange(false);
    router.push(`/editor/${id}`);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay asChild forceMount>
          <motion.div
            className="fixed inset-0 z-50 bg-p-ink/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0, 0, 0.2, 1] }}
          />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content asChild forceMount aria-describedby={undefined}>
          <motion.div
            className="grid-glow fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-panel border border-p-line bg-p-surface shadow-panel"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0, 0, 0.2, 1] }}
          >
            <DialogPrimitive.Title className="sr-only">Fill in {target.title}</DialogPrimitive.Title>
            <div className="relative flex flex-col p-6">
              <DialogPrimitive.Close
                className="absolute right-5 top-5 rounded-full p-1.5 text-p-ink-3 transition-colors duration-150 ease-out hover:bg-p-code hover:text-p-ink focus-visible:outline-none"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>

              <div className="mb-5 pr-8">
                <p className="text-sm font-medium text-p-ink-2">{target.title}</p>
              </div>

              <div className="mb-5 h-1.5 w-full overflow-hidden rounded-pill bg-p-code">
                <motion.div
                  className="stripe-bar h-full rounded-pill"
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.25, ease: [0, 0, 0.2, 1] }}
                />
              </div>

              {total > 0 && (
                <div className="mb-6 flex items-center gap-1.5">
                  {placeholders.map((p, i) => {
                    const isAnswered = Boolean(values[p.key]);
                    const isCurrent = phase === 'steps' && i === stepIndex;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => jumpTo(i)}
                        aria-label={`Go to ${p.label}`}
                        aria-current={isCurrent}
                        className={cn(
                          'h-2 w-2 rounded-full transition-all duration-150 ease-out',
                          isAnswered ? 'bg-blue' : 'bg-p-line',
                          isCurrent && 'ring-2 ring-blue-ring ring-offset-1 ring-offset-p-surface',
                        )}
                      />
                    );
                  })}
                  <span className="ml-auto font-mono text-xs text-p-ink-3">
                    {answeredCount}/{total}
                  </span>
                </div>
              )}

              <div className="relative min-h-[168px]">
                <AnimatePresence mode="wait" custom={direction}>
                  {phase === 'steps' && step ? (
                    <motion.div
                      key={step.key}
                      custom={direction}
                      initial={{ opacity: 0, x: direction * 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: direction * -8 }}
                      transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
                    >
                      <label className="mb-1.5 block text-base font-semibold leading-snug text-p-ink" htmlFor="wizard-step-input">
                        {step.label}
                      </label>
                      {step.hint && <p className="mb-4 text-sm leading-relaxed text-p-ink-2">{step.hint}</p>}
                      <Input
                        id="wizard-step-input"
                        ref={inputRef}
                        value={draft}
                        placeholder={step.default}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (e.shiftKey) goBack();
                            else goNext();
                          }
                        }}
                        className="h-11 rounded-card border-p-line bg-p-surface px-4 text-[15px] text-p-ink shadow-none focus-visible:ring-blue-ring"
                        autoComplete="off"
                      />
                      <div className="mt-5 flex items-center justify-between">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={goBack}
                          disabled={stepIndex === 0}
                          className="h-8 rounded-pill px-3 text-sm text-p-ink-2 hover:bg-p-code hover:text-p-ink disabled:opacity-0"
                        >
                          Back
                        </Button>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={skip}
                            className="h-8 rounded-pill px-3 text-sm text-p-ink-2 hover:bg-p-code hover:text-p-ink"
                          >
                            Skip
                          </Button>
                          <Button
                            type="button"
                            onClick={goNext}
                            className="h-8 rounded-pill bg-p-ink px-4 text-sm text-p-bg hover:bg-p-ink/90"
                          >
                            {stepIndex + 1 < total ? 'Next' : 'Review'}
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="summary"
                      initial={{ opacity: 0, x: direction * 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: direction * -8 }}
                      transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
                    >
                      <p className="mb-4 text-base font-semibold leading-snug text-p-ink">Review your answers</p>
                      <div className="mb-5 max-h-[224px] space-y-1 overflow-y-auto pr-1">
                        {placeholders.map((p, i) => (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => jumpTo(i)}
                            className="group flex w-full items-center justify-between gap-3 rounded-card px-3 py-2 text-left transition-colors duration-150 ease-out hover:bg-p-code"
                          >
                            <span className="min-w-0">
                              <span className="block font-mono text-xs text-p-ink-3">{p.key}</span>
                              <span className="block truncate text-sm text-p-ink">{values[p.key] || <span className="italic text-p-ink-3">not set</span>}</span>
                            </span>
                            <Pencil className="h-3.5 w-3.5 shrink-0 text-p-ink-3 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100" />
                          </button>
                        ))}
                        {total === 0 && <p className="px-3 py-2 text-sm text-p-ink-2">This persona has no placeholders to fill.</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={copyCompiled}
                          className="h-9 flex-1 rounded-pill border-p-line text-sm text-p-ink hover:bg-p-code"
                        >
                          {copied ? <Check className="h-4 w-4 text-blue" /> : <Copy className="h-4 w-4" />}
                          {copied ? 'Copied' : 'Copy compiled prompt'}
                        </Button>
                        <Button
                          type="button"
                          onClick={openInEditor}
                          className="h-9 flex-1 rounded-pill bg-p-ink text-sm text-p-bg hover:bg-p-ink/90"
                        >
                          Open in editor
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
