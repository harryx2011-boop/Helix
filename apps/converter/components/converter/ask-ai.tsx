'use client';

import { useId, useState } from 'react';
import { ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { PillButton } from '@/components/ui/pill-button';
import { describeIntent, resolveIntent, type IntentContext } from '@/lib/ai/client';
import { AI_PROVIDERS, AI_PROVIDER_LABEL, type AiProvider } from '@/lib/ai/models';
import { hasAnyProviderKey } from '@/lib/ai/keys';
import type { ResolvedIntent } from '@/lib/ai/resolve';
import type { ConvertSettings } from '@/lib/jobs/types';
import { intentToSettingsPatch } from '@/lib/ai/apply';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

type Props = {
  ctx: IntentContext;
  onResolved: (patch: Partial<ConvertSettings>, explanation: string) => void;
};

function firstConfiguredProvider(): AiProvider | null {
  return AI_PROVIDERS.find((p) => hasAnyProviderKey([p])) ?? null;
}

export function AskAi({ ctx, onResolved }: Props) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const submit = async () => {
    const provider = firstConfiguredProvider();
    if (!provider) {
      setError('Add a provider key in Settings to use Ask AI.');
      return;
    }
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    const result = await resolveIntent(provider, prompt.trim(), ctx);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const patch = intentToSettingsPatch(result.intent as ResolvedIntent);
    onResolved(patch, describeIntent(result.intent));
    setPrompt('');
  };

  return (
    <div className="rounded-card border border-p-line bg-p-bg">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-p-ink-2 transition-colors duration-150 hover:text-p-ink"
      >
        <Sparkles aria-hidden="true" className="h-4 w-4" />
        Ask AI
        <ChevronDown aria-hidden="true" className={cx('ml-auto h-4 w-4 transition-transform duration-150', open && 'rotate-180')} />
      </button>
      {open && (
        <div id={id} className="animate-fade-up border-t border-p-line px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={prompt}
              disabled={busy}
              placeholder="e.g. make this a small GIF for Discord"
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submit();
                }
              }}
              className="h-11 w-full rounded-pill border border-p-line bg-p-surface px-4 text-sm text-p-ink placeholder:text-p-ink-3 disabled:opacity-60"
            />
            <PillButton type="button" size="md" variant="secondary" disabled={busy || !prompt.trim()} onClick={() => void submit()}>
              {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
              {busy ? 'Resolving' : 'Resolve'}
            </PillButton>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-p-ink-2">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
