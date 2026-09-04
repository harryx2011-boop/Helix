'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { toast } from 'sonner';
import { FrameRow, FrameHeading } from '@/components/app/page-frame';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AccountError, getConfirmations, runDangerAction, type DangerAction } from '@/lib/account';

/**
 * The irreversible actions.
 *
 * The typed phrase is not the guard — the server is. Every action posts the
 * phrase and the route refuses to act unless it matches, so closing this
 * dialog and calling the endpoint directly gains nothing. The dialog exists to
 * make the user read what they are about to do.
 */

interface ActionSpec {
  action: DangerAction;
  title: string;
  description: string;
  /** What the user is told will happen, in the dialog, before they can type. */
  consequence: string;
  button: string;
}

const ACTIONS: ActionSpec[] = [
  {
    action: 'revoke_keys',
    title: 'Revoke all API keys',
    description: 'Every key you have created stops working immediately.',
    consequence:
      'Anything running with one of these keys starts failing on its next request. This cannot be undone; you will need to create new keys and update wherever they are used.',
    button: 'Revoke all keys',
  },
  {
    action: 'clear_providers',
    title: 'Clear provider credentials',
    description: 'Removes the model provider keys you stored for extraction and agent calls.',
    consequence:
      'Requests that relied on your own provider credentials fall back to whatever the instance is configured with, or fail if it has none. The credentials themselves cannot be recovered.',
    button: 'Clear credentials',
  },
  {
    action: 'reset_onboarding',
    title: 'Reset onboarding',
    description: 'Clears your answers and sends you back through the sign-up questions.',
    consequence:
      'Your role, use cases, provider, deployment and endpoint selections are cleared, and the sidebar returns to its default order. Your keys are not affected.',
    button: 'Reset onboarding',
  },
  {
    action: 'delete_account',
    title: 'Delete account',
    description: 'Removes your profile, keys, jobs, monitors and stored credentials, then deletes your sign-in.',
    consequence:
      'Everything above is deleted together and none of it can be restored. Your sign-in identity is removed last, so you will be signed out and unable to sign back in.',
    button: 'Delete my account',
  },
];

function ConfirmDialog({
  spec,
  phrase,
  open,
  onOpenChange,
  onConfirmed,
}: {
  spec: ActionSpec;
  phrase: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed: (action: DangerAction) => Promise<void>;
}) {
  const [typed, setTyped] = React.useState('');
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  // Matched the same way the route matches it, so the button never enables on
  // a phrase the server will reject.
  const matches = phrase !== undefined && typed.trim().toLowerCase() === phrase;

  const run = async () => {
    if (!matches || phrase === undefined) return;
    setRunning(true);
    try {
      await onConfirmed(spec.action);
      onOpenChange(false);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{spec.title}</DialogTitle>
          <DialogDescription>{spec.consequence}</DialogDescription>
        </DialogHeader>

        {phrase === undefined ? (
          <p className="text-[13px] leading-snug text-muted-foreground">
            Could not load the confirmation phrase. Reload the page and try again.
          </p>
        ) : (
          <div>
            <label htmlFor={`confirm-${spec.action}`} className="text-[13px] leading-snug text-muted-foreground">
              Type <span className="font-mono text-foreground">{phrase}</span> to continue.
            </label>
            <Input
              id={`confirm-${spec.action}`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches) void run();
              }}
              autoComplete="off"
              spellCheck={false}
              className="mt-2 font-mono text-[13px]"
              aria-label={`Type ${phrase} to confirm`}
            />
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={run} disabled={!matches || running}>
            {running ? 'Working' : spec.button}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DangerZonePanel() {
  const router = useRouter();
  const { signOut } = useClerk();
  const [phrases, setPhrases] = React.useState<Record<DangerAction, string> | null>(null);
  const [open, setOpen] = React.useState<DangerAction | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getConfirmations()
      .then((next) => {
        if (!cancelled) setPhrases(next);
      })
      .catch(() => {
        // The dialog handles an absent phrase by refusing to enable its button,
        // which is the safe direction to fail in.
        if (!cancelled) setPhrases(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const perform = React.useCallback(
    async (action: DangerAction, confirm: string) => {
      try {
        const result = await runDangerAction(action, confirm);

        switch (action) {
          case 'revoke_keys':
            toast.success(`${result.revoked ?? 0} key(s) revoked.`);
            router.refresh();
            break;
          case 'clear_providers':
            toast.success(`${result.cleared ?? 0} provider credential(s) cleared.`);
            router.refresh();
            break;
          case 'reset_onboarding':
            toast.success('Onboarding reset.');
            // The gate is read by a server component, so only a re-render puts
            // the user back into the wizard.
            router.refresh();
            break;
          case 'delete_account':
            toast.success('Account deleted.');
            await signOut({ redirectUrl: '/' });
            break;
        }
      } catch (err) {
        if (err instanceof AccountError && err.code === 'partial_delete') {
          // The rows are gone and the identity is not. Signing out is the only
          // action left that improves the situation, and the message says why.
          toast.error(err.message);
          await signOut({ redirectUrl: '/' });
          return;
        }
        toast.error(err instanceof AccountError ? err.message : 'The action failed.');
        throw err;
      }
    },
    [router, signOut],
  );

  return (
    <>
      <FrameRow>
        <FrameHeading
          id="danger-zone"
          title="Danger zone"
          description="Each of these is immediate and cannot be undone. You will be asked to type a confirmation."
        />
      </FrameRow>

      <FrameRow flush>
        <div className="divide-y divide-border">
          {ACTIONS.map((spec) => (
            <div key={spec.action} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{spec.title}</p>
                <p className="mt-1 max-w-[60ch] text-[13px] leading-snug text-muted-foreground">{spec.description}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(spec.action)}
                className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                {spec.button}
              </Button>
            </div>
          ))}
        </div>
      </FrameRow>

      {ACTIONS.map((spec) => (
        <ConfirmDialog
          key={spec.action}
          spec={spec}
          phrase={phrases?.[spec.action]}
          open={open === spec.action}
          onOpenChange={(next) => setOpen(next ? spec.action : null)}
          onConfirmed={(action) => perform(action, phrases?.[action] ?? '')}
        />
      ))}
    </>
  );
}
