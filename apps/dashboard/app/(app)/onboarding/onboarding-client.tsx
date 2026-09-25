'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { LocalSetupOffer } from '@/components/app/local-setup-offer';
import { AsciiFluid } from '@/components/shared/ascii-fluid';
import {
  DEPLOY_INTENT_CHOICES,
  ENDPOINT_CHOICES,
  HEARD_FROM_CHOICES,
  LLM_PROVIDER_CHOICES,
  ROLE_CHOICES,
  TOTAL_STEPS,
  USE_CASE_CHOICES,
  type Choice,
} from '@/lib/onboarding-steps';
import type {
  DeployIntent,
  HeardFrom,
  OnboardingEndpoint,
  LlmProvider,
  OnboardingRole,
  UseCase,
} from '@/lib/supabase/types';

interface Answers {
  role: OnboardingRole | null;
  useCases: UseCase[];
  llmProvider: LlmProvider | null;
  deployIntent: DeployIntent | null;
  selectedEndpoints: OnboardingEndpoint[];
  heardFrom: HeardFrom | null;
  heardFromDetail: string | null;
}

const STEP_TITLES = [
  'How did you hear about Helix?',
  'What best describes you?',
  'What are you building?',
  'Which LLM provider will you bring?',
  'How will you run Helix?',
  'Which endpoints will you use?',
];

const STEP_BLURBS = [
  'It tells us where to spend our time. It is not used for anything else.',
  'It shapes the examples we show you. Nothing else.',
  'Pick as many as apply.',
  'Helix is BYOK — your key, your provider, your bill.',
  'You can change your mind later; both modes are the same codebase.',
  'These sort to the top of the sidebar and go into your SKILL.md.',
];

/** A single-select card grid. */
function CardChoices<T extends string>({
  choices,
  value,
  onSelect,
  columns,
}: {
  choices: Choice<T>[];
  value: T | null;
  onSelect: (v: T) => void;
  columns: string;
}) {
  return (
    <div className={cn('grid gap-2', columns)}>
      {choices.map((choice) => {
        const selected = value === choice.value;
        return (
          <button
            key={choice.value}
            type="button"
            onClick={() => onSelect(choice.value)}
            aria-pressed={selected}
            className={cn(
              'group flex flex-col items-start gap-1 rounded-[var(--radius)] border p-4 text-left',
              'transition-[background-color,border-color,transform] duration-200 ease-out',
              'hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'motion-reduce:transform-none motion-reduce:transition-none',
              selected
                ? 'border-primary bg-accent'
                : 'border-border bg-card hover:border-muted-foreground/40 hover:bg-secondary',
            )}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{choice.label}</span>
              {selected ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : null}
            </span>
            {choice.hint ? (
              <span className="text-xs leading-relaxed text-muted-foreground">{choice.hint}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** A multi-select list; identical affordance, different state semantics. */
function ListChoices<T extends string>({
  choices,
  values,
  onToggle,
}: {
  choices: Choice<T>[];
  values: T[];
  onToggle: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {choices.map((choice) => {
        const selected = values.includes(choice.value);
        return (
          <button
            key={choice.value}
            type="button"
            onClick={() => onToggle(choice.value)}
            role="checkbox"
            aria-checked={selected}
            className={cn(
              'flex items-center gap-3 rounded-[var(--radius)] border p-3 text-left',
              'transition-[background-color,border-color] duration-200 ease-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'border-primary bg-accent'
                : 'border-border bg-card hover:border-muted-foreground/40 hover:bg-secondary',
            )}
          >
            <span
              className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded-[3px] border',
                'transition-colors duration-200 ease-out',
                selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50',
              )}
              aria-hidden
            >
              {selected ? <Check className="size-3" /> : null}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-foreground">{choice.label}</span>
              {choice.hint ? <span className="text-xs text-muted-foreground">{choice.hint}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function OnboardingClient({ initial }: { initial: Answers }) {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [answers, setAnswers] = React.useState<Answers>(initial);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  // Moving between steps swaps the whole panel, so focus would otherwise fall
  // back to <body> and a screen reader would announce nothing.
  React.useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/app/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Could not save (status ${response.status}).`);
      }
      // The gate that sent us here reads the profile server-side, so the app
      // route must re-render against the new row rather than a cached one.
      router.replace('/app?onboarded=1');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your answers.');
      setSaving(false);
    }
  };

  const isFinal = step === TOTAL_STEPS;

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col px-6 py-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5" role="presentation">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
            <span
              key={n}
              className={cn(
                'h-1.5 rounded-full transition-[width,background-color] duration-200 ease-out',
                n === step ? 'w-6 bg-primary' : n < step ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-border',
              )}
            />
          ))}
        </div>
        <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
          {isFinal ? <span className="text-primary">Final step</span> : `Step ${step} of ${TOTAL_STEPS}`}
        </span>
      </div>

      <div className="flex flex-1 flex-col">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-semibold leading-tight text-foreground outline-none"
        >
          {STEP_TITLES[step - 1]}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-sm leading-relaxed text-muted-foreground">{STEP_BLURBS[step - 1]}</p>
          {!isFinal ? (
            <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wide">
              Optional
            </Badge>
          ) : null}
        </div>

        <div className="mt-6">
          {step === 1 ? (
            <div className="flex flex-col gap-3">
              <CardChoices
                choices={HEARD_FROM_CHOICES}
                value={answers.heardFrom}
                onSelect={(heardFrom) =>
                  setAnswers((a) => ({
                    ...a,
                    heardFrom,
                    // The note belongs to 'other'. Switching away from it must
                    // clear the text, or a stale sentence rides along with a
                    // categorised answer and the database rejects the whole save.
                    heardFromDetail: heardFrom === 'other' ? a.heardFromDetail : null,
                  }))
                }
                columns="sm:grid-cols-2"
              />
              {answers.heardFrom === 'other' ? (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="heard-from-detail" className="text-sm font-medium text-foreground">
                    Where, roughly?
                  </label>
                  <input
                    id="heard-from-detail"
                    type="text"
                    maxLength={200}
                    autoComplete="off"
                    placeholder="A podcast, a conference talk, a Discord…"
                    value={answers.heardFromDetail ?? ''}
                    onChange={(event) =>
                      setAnswers((a) => ({ ...a, heardFromDetail: event.target.value }))
                    }
                    className="flex h-9 w-full rounded-[var(--radius)] border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  />
                  <p className="text-xs text-muted-foreground">Optional, and only kept for this answer.</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <CardChoices
              choices={ROLE_CHOICES}
              value={answers.role}
              onSelect={(role) => setAnswers((a) => ({ ...a, role }))}
              columns="sm:grid-cols-2"
            />
          ) : null}

          {step === 3 ? (
            <ListChoices
              choices={USE_CASE_CHOICES}
              values={answers.useCases}
              onToggle={(v) => setAnswers((a) => ({ ...a, useCases: toggle(a.useCases, v) }))}
            />
          ) : null}

          {step === 4 ? (
            <CardChoices
              choices={LLM_PROVIDER_CHOICES}
              value={answers.llmProvider}
              onSelect={(llmProvider) => setAnswers((a) => ({ ...a, llmProvider }))}
              columns="sm:grid-cols-3"
            />
          ) : null}

          {step === 5 ? (
            <CardChoices
              choices={DEPLOY_INTENT_CHOICES}
              value={answers.deployIntent}
              onSelect={(deployIntent) => setAnswers((a) => ({ ...a, deployIntent }))}
              columns="sm:grid-cols-3"
            />
          ) : null}

          {step === 6 ? (
            <div className="flex flex-col gap-5">
              <ListChoices
                choices={ENDPOINT_CHOICES}
                values={answers.selectedEndpoints}
                onToggle={(v) => setAnswers((a) => ({ ...a, selectedEndpoints: toggle(a.selectedEndpoints, v) }))}
              />
              {/* Last step: the answers are about to save and a key is about to
                  be minted, so this is the moment the setup offer is useful. */}
              <LocalSetupOffer />
            </div>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div aria-hidden className="pointer-events-none relative mt-6 hidden h-14 w-56 self-end overflow-hidden md:block">
          <AsciiFluid
            cols={34}
            rows={5}
            seed={16}
            tone="app"
            className="absolute bottom-0 right-0 [mask-image:linear-gradient(to_left,black_60%,transparent)]"
          />
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1 || saving}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Button>

        <div className="flex items-center gap-2">
          {!isFinal ? (
            <Button type="button" variant="ghost" onClick={() => setStep((s) => s + 1)} disabled={saving}>
              Skip
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={() => (isFinal ? submit() : setStep((s) => s + 1))}
            disabled={saving}
            aria-busy={saving}
          >
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {isFinal ? (saving ? 'Setting up…' : 'Get started') : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}
