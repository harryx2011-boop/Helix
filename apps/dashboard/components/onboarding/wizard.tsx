'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StepRole } from './steps/step-role';
import { StepUseCases } from './steps/step-use-cases';
import { StepProvider } from './steps/step-provider';
import { StepDeploy } from './steps/step-deploy';
import { StepEndpoints } from './steps/step-endpoints';

interface WizardAnswers {
  role: string | null;
  useCases: string[];
  llmProvider: string | null;
  deployIntent: string | null;
  selectedEndpoints: string[];
}

const TOTAL_STEPS = 5;

const STEP_META: { title: string; subtitle: string }[] = [
  { title: 'What best describes you?', subtitle: 'Helps us tune examples and defaults. Skip if none quite fit.' },
  { title: 'What are you building?', subtitle: 'Pick as many as apply.' },
  { title: 'Which LLM provider will you bring?', subtitle: 'Used for extraction and summarization steps that need a model.' },
  { title: 'How will you run Helix?', subtitle: 'You can change this later.' },
  { title: 'Which endpoints will you use?', subtitle: 'This orders your sidebar and builds your SKILL.md.' },
];

export function OnboardingWizard({ initial }: { initial: WizardAnswers }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFinalStep = step === TOTAL_STEPS - 1;
  const meta = STEP_META[step] ?? STEP_META[0]!;

  const submit = useCallback(
    async (complete: boolean) => {
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch('/api/app/onboarding', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            role: answers.role,
            use_cases: answers.useCases,
            llm_provider: answers.llmProvider,
            deploy_intent: answers.deployIntent,
            selected_endpoints: answers.selectedEndpoints,
            complete,
          }),
        });
        if (!res.ok) throw new Error('Could not save your answers. Try again.');
        const data = (await res.json()) as { ok: boolean; redirect: string };
        router.push(data.redirect);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
        setSubmitting(false);
      }
    },
    [answers, router],
  );

  const handleNext = () => {
    if (isFinalStep) {
      void submit(true);
      return;
    }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 0));
  const handleSkip = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col animate-fade-up">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-1.5" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={TOTAL_STEPS}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span
              key={i}
              className={cn('h-1.5 w-6 rounded-pill transition-colors duration-150 ease-out', i <= step ? 'bg-violet' : 'bg-m-border-loud')}
            />
          ))}
        </div>
        <span className="font-mono text-[12px] uppercase tracking-wide text-m-ink/56">
          Step {step + 1} of {TOTAL_STEPS}
        </span>
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-normal leading-tight tracking-tight text-m-ink">{meta.title}</h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-m-ink/64">{meta.subtitle}</p>
        </div>
        {isFinalStep ? (
          <span className="mt-1 shrink-0 rounded-full bg-violet px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-white">
            Final step
          </span>
        ) : (
          <span className="mt-1 shrink-0 rounded-full border border-m-border-loud px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-m-ink/56">
            Optional
          </span>
        )}
      </div>

      <div key={step} className="animate-fade-up">
        {step === 0 ? <StepRole value={answers.role} onChange={(role) => setAnswers((a) => ({ ...a, role }))} /> : null}
        {step === 1 ? (
          <StepUseCases value={answers.useCases} onChange={(useCases) => setAnswers((a) => ({ ...a, useCases }))} />
        ) : null}
        {step === 2 ? (
          <StepProvider value={answers.llmProvider} onChange={(llmProvider) => setAnswers((a) => ({ ...a, llmProvider }))} />
        ) : null}
        {step === 3 ? (
          <StepDeploy value={answers.deployIntent} onChange={(deployIntent) => setAnswers((a) => ({ ...a, deployIntent }))} />
        ) : null}
        {step === 4 ? (
          <StepEndpoints
            value={answers.selectedEndpoints}
            onChange={(selectedEndpoints) => setAnswers((a) => ({ ...a, selectedEndpoints }))}
          />
        ) : null}
      </div>

      {error ? <p className="mt-4 text-[13px] text-red-600">{error}</p> : null}

      <div className="mt-10 flex items-center justify-between">
        <button
          type="button"
          onClick={handleBack}
          disabled={step === 0 || submitting}
          className="inline-flex h-11 items-center rounded-pill px-4 text-[14px] font-medium text-m-ink/70 transition-colors duration-150 ease-out hover:text-m-ink disabled:pointer-events-none disabled:opacity-40"
        >
          Back
        </button>

        <div className="flex items-center gap-4">
          {!isFinalStep ? (
            <button
              type="button"
              onClick={handleSkip}
              disabled={submitting}
              className="text-[14px] font-medium text-m-ink/56 underline decoration-m-border-loud underline-offset-4 transition-colors duration-150 ease-out hover:text-m-ink disabled:pointer-events-none disabled:opacity-40"
            >
              Skip
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleNext}
            disabled={submitting}
            className="inline-flex h-11 min-w-[132px] items-center justify-center gap-2 rounded-pill bg-violet px-6 text-[14px] font-medium text-white shadow-btn transition-shadow duration-150 ease-out hover:shadow-btn-hover disabled:pointer-events-none disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {isFinalStep ? 'Get Started' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
