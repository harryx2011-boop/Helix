'use client';

import * as React from 'react';
import { useApiKey } from './api-key-provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

/**
 * Blocks the app behind a key prompt until one is stored. Not a login —
 * there is no account behind it, just a bearer token this instance already
 * issued (FRONTEND.md §3, "Auth, and its honest limit").
 */
export function ApiKeyGate({ children }: { children: React.ReactNode }) {
  const { apiKey, setApiKey } = useApiKey();
  const [draft, setDraft] = React.useState('');

  if (apiKey) return <>{children}</>;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    setApiKey(trimmed);
  };

  return (
    <Dialog open>
      <DialogContent
        className="[&>button]:hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Connect to your Helix instance</DialogTitle>
          <DialogDescription>
            Paste an API key created on this instance. It is stored only in this
            browser&apos;s local storage and sent as a bearer token with every
            request — never to any third party.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="api-key">API key</Label>
            <Input
              id="api-key"
              placeholder="hx_..."
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              autoFocus
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            No key yet? Any key minted with <code>HELIX_BOOTSTRAP_KEY</code> or
            through the Keys screen on this instance will work here.
          </p>
          <Button type="submit" disabled={draft.trim().length === 0}>
            Connect
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
