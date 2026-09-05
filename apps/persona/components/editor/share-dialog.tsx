'use client';

import * as React from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Fork } from '@/lib/store';

type State = { status: 'idle' } | { status: 'creating' } | { status: 'ready'; url: string } | { status: 'error'; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: 'Sharing is not available on this deployment.',
  invalid_share: 'This fork could not be shared. Give it a title and some content, then try again.',
  too_large: 'This fork is too large to share.',
};

/**
 * Freezes the fork through `POST /api/share` the moment the dialog opens and
 * shows the resulting link. Each open makes a new snapshot: a share never
 * follows later edits, which is what makes it safe to hand to a teammate.
 */
export function ShareDialog({ fork, open, onOpenChange }: { fork: Fork; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [state, setState] = React.useState<State>({ status: 'idle' });
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setState({ status: 'idle' });
      setCopied(false);
      return;
    }
    const controller = new AbortController();
    setState({ status: 'creating' });
    fetch('/api/share', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        title: fork.title || 'Untitled fork',
        bodyMd: fork.bodyMd,
        values: fork.values,
        roleSlug: fork.roleSlug,
        personaSlug: fork.personaSlug,
        sourceVersion: fork.sourceVersion,
      }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
        if (!res.ok || !data.path) {
          setState({ status: 'error', message: ERROR_MESSAGES[data.error ?? ''] ?? 'Could not create a share link.' });
          return;
        }
        setState({ status: 'ready', url: new URL(data.path, window.location.origin).toString() });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ status: 'error', message: 'Could not reach the server.' });
      });
    return () => controller.abort();
    // A new snapshot per open, not per keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function copy() {
    if (state.status !== 'ready') return;
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable; the field is selectable */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(480px,calc(100vw-32px))] rounded-panel border-p-line bg-p-surface p-6 shadow-panel">
        <DialogTitle className="text-base font-semibold text-p-ink">Share this fork</DialogTitle>
        <DialogDescription className="text-sm leading-relaxed text-p-ink-2">
          Anyone with the link can read this snapshot and fork it. Later edits stay here until you share again.
        </DialogDescription>

        <div className="mt-4">
          {state.status === 'creating' || state.status === 'idle' ? (
            <div className="flex h-10 items-center gap-2 rounded-card border border-p-line bg-p-bg px-3 text-sm text-p-ink-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Creating link…
            </div>
          ) : state.status === 'error' ? (
            <p role="alert" className="rounded-card border border-p-line bg-p-bg px-3 py-2 text-sm leading-relaxed text-p-ink-2">
              {state.message}
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={state.url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Share link"
                className="h-10 min-w-0 flex-1 rounded-card border border-p-line bg-p-bg px-3 font-mono text-[12.5px] text-p-ink outline-none focus-visible:ring-2 focus-visible:ring-blue-ring"
              />
              <Button type="button" onClick={copy} className="h-10 shrink-0 rounded-pill bg-p-ink px-4 text-sm text-p-bg hover:bg-p-ink/90">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
