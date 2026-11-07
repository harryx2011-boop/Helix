'use client';

import * as React from 'react';
import { Check, Copy, Terminal } from '@/components/icons/lucide';
import { Button } from '@/components/ui/button';
import { setupPrompt } from '@/lib/setup-prompt';
import { cn } from '@/lib/utils';

export function LocalSetupOffer({ className }: { className?: string }) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(setupPrompt());
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
    }
  };

  return (
    <div className={cn('flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-card p-4', className)}>
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius)] bg-secondary"
          aria-hidden
        >
          <Terminal className="size-4 text-muted-foreground" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium text-foreground">Want this set up for you?</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Copy one prompt into Claude Code, Codex or Cursor. It installs the Helix skill, wires your key from your
            own shell without printing it, and runs a smoke test.
          </p>
        </div>
      </div>

      <Button type="button" variant="outline" size="sm" className="w-fit gap-1.5" onClick={copy}>
        {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        {copied ? 'Copied' : 'Copy setup prompt'}
      </Button>

      <span aria-live="polite" className="sr-only">
        {copied ? 'Setup prompt copied to your clipboard.' : ''}
      </span>
    </div>
  );
}
