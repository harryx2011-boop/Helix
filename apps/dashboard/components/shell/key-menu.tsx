'use client';

import * as React from 'react';
import { KeyRound, LogOut, Moon, Sun } from 'lucide-react';
import { useApiKey } from './api-key-provider';
import { useTheme } from './theme-provider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Masked-key display plus the two escape hatches the plan calls for:
 * "offer a way to change or clear it" (FRONTEND.md F0).
 */
export function KeyMenu() {
  const { apiKey, setApiKey, clearApiKey } = useApiKey();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState('');

  const masked = apiKey ? `${apiKey.slice(0, 6)}${'•'.repeat(6)}${apiKey.slice(-4)}` : '';

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    setApiKey(trimmed);
    setDraft('');
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 font-mono text-xs">
            <KeyRound className="h-3.5 w-3.5" />
            {masked}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API key</DialogTitle>
            <DialogDescription>Change the key this browser uses, or disconnect entirely.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-api-key">New key</Label>
              <Input
                id="new-api-key"
                placeholder="helix-..."
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2 text-destructive hover:text-destructive"
                onClick={() => {
                  clearApiKey();
                  setOpen(false);
                }}
              >
                <LogOut className="h-3.5 w-3.5" />
                Disconnect
              </Button>
              <Button type="submit" disabled={draft.trim().length === 0}>
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
