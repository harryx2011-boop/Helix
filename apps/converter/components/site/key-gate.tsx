'use client';

import { useId, useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { PillButton } from '@/components/ui/pill-button';
import { isKeyShape, maskKey, setKey, useApiKey } from '@/lib/auth';

/**
 * Helix has no session layer, so signing in means storing an API key on this
 * device. The key never leaves the browser except as a header to the converter.
 */
export function KeyGate({ compact = false }: { compact?: boolean }) {
  const key = useApiKey();
  const inputId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (key) {
    if (compact) return null;
    return (
      <div className="flex items-center gap-3">
        <span className="font-mono text-[13px] text-p-ink-3">{maskKey(key)}</span>
        <PillButton
          variant="ghost"
          size="sm"
          onClick={() => setKey(null)}
          aria-label="Sign out and forget this key"
        >
          <LogOut aria-hidden className="h-[14px] w-[14px]" />
          Sign out
        </PillButton>
      </div>
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (!isKeyShape(value)) {
      setError('That does not look like a Helix key. They start with helix- and are 22 characters.');
      return;
    }
    setError(null);
    setKey(value);
    setDraft('');
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-[13px] font-medium text-p-ink">
        Helix API key
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <KeyRound
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-p-ink-3"
          />
          <input
            id={inputId}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            placeholder="helix-…"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="h-11 w-full rounded-pill border border-p-line bg-p-surface pl-9 pr-4 font-mono text-[13px] text-p-ink placeholder:text-p-ink-3 focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue-ring"
          />
        </div>
        <PillButton type="submit" variant="primary" size="md">
          Save key
        </PillButton>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-[13px] text-p-ink-2">
          {error}
        </p>
      ) : (
        <p className="text-[13px] text-p-ink-3">
          Stored on this device only. Create one in your Helix dashboard.
        </p>
      )}
    </form>
  );
}

/** Shown in place of the converter when there is no key to run a job with. */
export function SignedOutPanel() {
  return (
    <div className="rounded-panel border border-p-line bg-p-surface p-6 shadow-card-sm sm:p-8">
      <h2 className="text-[18px] font-semibold text-p-ink">Sign in to convert</h2>
      <p className="mt-2 max-w-[54ch] text-[15px] text-p-ink-2">
        Conversions run on your Helix instance, so they need a key. Paste one below and it stays in
        this browser.
      </p>
      <div className="mt-5 max-w-[440px]">
        <KeyGate />
      </div>
    </div>
  );
}
