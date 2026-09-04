'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { FrameRow, FrameHeading, FrameCells } from '@/components/app/page-frame';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  DEPLOY_INTENT_CHOICES,
  ENDPOINT_CHOICES,
  LLM_PROVIDER_CHOICES,
  ROLE_CHOICES,
  USE_CASE_CHOICES,
  type Choice,
} from '@/lib/onboarding-steps';
import { AccountError, getAccount, updateAccount, type Account, type AccountAnswers } from '@/lib/account';
import type { DeployIntent, LlmProvider, OnboardingEndpoint, OnboardingRole, UseCase } from '@/lib/supabase/types';

/**
 * Identity, and the onboarding answers made editable.
 *
 * The answers were write-once until now, which meant a wrong click during the
 * wizard was permanent. Each control saves on its own rather than behind one
 * Save button: every field is independent, and a single form would make
 * changing one answer look like a commitment to all five.
 */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-5">
      <p className="text-[13px] leading-snug text-muted-foreground">{label}</p>
      <div className="mt-1.5 text-sm text-foreground">{children}</div>
    </div>
  );
}

/** A choice chip. Selection is the only state it carries, and colour is how it says so. */
function Chip({
  label,
  hint,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  hint?: string | undefined;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      title={hint}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[13px] transition-colors duration-150 ease-out disabled:opacity-40',
        selected
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
      )}
    >
      {selected && <Check className="h-3 w-3 text-primary" />}
      {label}
    </button>
  );
}

function ChoiceRow<T extends string>({
  title,
  description,
  choices,
  value,
  saving,
  onPick,
}: {
  title: string;
  description: string;
  choices: Choice<T>[];
  value: T | null;
  saving: boolean;
  onPick: (next: T | null) => void;
}) {
  return (
    <div className="px-6 py-5">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-[60ch] text-[13px] leading-snug text-muted-foreground">{description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {choices.map((choice) => (
          <Chip
            key={choice.value}
            label={choice.label}
            hint={choice.hint}
            selected={value === choice.value}
            disabled={saving}
            // Picking the current answer clears it: every wizard step was
            // optional, so "no answer" has to remain reachable.
            onClick={() => onPick(value === choice.value ? null : choice.value)}
          />
        ))}
      </div>
    </div>
  );
}

function MultiRow<T extends string>({
  title,
  description,
  choices,
  values,
  saving,
  onToggle,
}: {
  title: string;
  description: string;
  choices: Choice<T>[];
  values: readonly T[];
  saving: boolean;
  onToggle: (next: T[]) => void;
}) {
  return (
    <div className="px-6 py-5">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-[60ch] text-[13px] leading-snug text-muted-foreground">{description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {choices.map((choice) => {
          const selected = values.includes(choice.value);
          return (
            <Chip
              key={choice.value}
              label={choice.label}
              hint={choice.hint}
              selected={selected}
              disabled={saving}
              onClick={() =>
                onToggle(selected ? values.filter((v) => v !== choice.value) : [...values, choice.value])
              }
            />
          );
        })}
      </div>
    </div>
  );
}

export function AccountPanel() {
  const router = useRouter();
  const { user } = useUser();
  const [account, setAccount] = React.useState<Account | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    getAccount()
      .then((next) => {
        if (!cancelled) setAccount(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof AccountError ? err.message : 'Could not load your account.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = React.useCallback(
    async (patch: Partial<AccountAnswers>, message: string, reordersSidebar = false) => {
      setSaving(true);
      // Optimistic: the chips are the only feedback a click has, and waiting a
      // round-trip to fill one in reads as a dropped click.
      const previous = account;
      setAccount((current) =>
        current ? { ...current, answers: { ...current.answers, ...patch } } : current,
      );
      try {
        const next = await updateAccount(patch);
        setAccount(next);
        toast.success(message);
        // The sidebar order is rendered by a server component reading the
        // profile (app/(app)/app/layout.tsx), so only a server re-render moves
        // it. Local state cannot.
        if (reordersSidebar) router.refresh();
      } catch (err) {
        setAccount(previous);
        toast.error(err instanceof AccountError ? err.message : 'Could not save the change.');
      } finally {
        setSaving(false);
      }
    },
    [account, router],
  );

  if (loading) {
    return (
      <>
        <FrameRow>
          <FrameHeading id="account" title="Account" description="Your profile and the answers you gave when you signed up." />
        </FrameRow>
        <FrameRow flush className="flex flex-col gap-3 p-6">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </FrameRow>
      </>
    );
  }

  if (error || !account) {
    return (
      <>
        <FrameRow>
          <FrameHeading id="account" title="Account" description="Your profile and the answers you gave when you signed up." />
        </FrameRow>
        <FrameRow flush className="p-6">
          <p className="text-[13px] leading-snug text-muted-foreground">{error ?? 'Could not load your account.'}</p>
        </FrameRow>
      </>
    );
  }

  const { answers } = account;
  // Clerk is the source for name and avatar; the profile row is a webhook-fed
  // mirror that can lag a rename by a request.
  const name = user?.fullName ?? account.name;
  const avatarUrl = user?.imageUrl ?? account.avatarUrl;

  return (
    <>
      <FrameRow>
        <FrameHeading
          id="account"
          title="Account"
          description="Your profile and the answers you gave when you signed up."
        />
      </FrameRow>

      <FrameRow>
        <div className="flex items-center gap-4 px-6 py-5">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Clerk serves the avatar from its own CDN on a per-user URL; next/image would need that host in remotePatterns for no gain at 40px.
            <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full border border-border object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary text-sm font-medium text-muted-foreground">
              {(name ?? account.email).charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{name ?? 'Unnamed'}</p>
            <p className="truncate text-[13px] text-muted-foreground">{account.email}</p>
          </div>
        </div>
      </FrameRow>

      <FrameRow>
        <FrameCells cols={2}>
          <Cell label="Member since">{formatDate(account.memberSince)}</Cell>
          <Cell label="Onboarding">
            {account.onboardingCompletedAt ? formatDate(account.onboardingCompletedAt) : 'Not completed'}
          </Cell>
        </FrameCells>
      </FrameRow>

      <FrameRow>
        <FrameHeading
          id="account-answers"
          title="Your answers"
          description="Set during sign-up and editable here. Each change saves on its own."
        />
      </FrameRow>

      <FrameRow flush>
        <div className="divide-y divide-border">
          <ChoiceRow<OnboardingRole>
            title="Role"
            description="What you do, so the docs lead with the right examples."
            choices={ROLE_CHOICES}
            value={answers.role}
            saving={saving}
            onPick={(role) => save({ role }, 'Role saved.')}
          />
          <MultiRow<UseCase>
            title="Use cases"
            description="What you are building. Pick as many as apply."
            choices={USE_CASE_CHOICES}
            values={answers.useCases}
            saving={saving}
            onToggle={(useCases) => save({ useCases }, 'Use cases saved.')}
          />
          <ChoiceRow<LlmProvider>
            title="LLM provider"
            description="Which model provider you bring for extraction and agent calls."
            choices={LLM_PROVIDER_CHOICES}
            value={answers.llmProvider}
            saving={saving}
            onPick={(llmProvider) => save({ llmProvider }, 'Provider saved.')}
          />
          <ChoiceRow<DeployIntent>
            title="Deployment"
            description="Where you plan to run Helix."
            choices={DEPLOY_INTENT_CHOICES}
            value={answers.deployIntent}
            saving={saving}
            onPick={(deployIntent) => save({ deployIntent }, 'Deployment saved.')}
          />
          <MultiRow<OnboardingEndpoint>
            title="Endpoints"
            description="The ones you picked lead the sidebar, in this order."
            choices={ENDPOINT_CHOICES}
            values={answers.selectedEndpoints}
            saving={saving}
            onToggle={(selectedEndpoints) => save({ selectedEndpoints }, 'Sidebar order updated.', true)}
          />
        </div>
      </FrameRow>
    </>
  );
}
