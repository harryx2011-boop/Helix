'use client';

import * as React from 'react';
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatRelativeTime } from '@/lib/format';
import { PUBLIC_API_URL } from '@/lib/mode';
import { createInstanceKey, listInstanceKeys, revokeInstanceKey } from '@/lib/instance-keys';
import { generateEphemeralKey } from '@/lib/ephemeral-keys';
import { toast } from 'sonner';

interface KeyRow {
  id: string;
  name: string;
  masked: string;
  rateLimitPerMin: number | null;
  lastUsedAt: string | null;
  createdAt: string;
  revoked: boolean;
}

function useKeys() {
  const [keys, setKeys] = React.useState<KeyRow[] | null>(null);
  // The instance owns the key store. When it cannot be reached there is
  // nothing to list, and the only thing left worth offering is a locally
  // generated key the operator can install on an instance themselves.
  const [instanceReachable, setInstanceReachable] = React.useState(true);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listInstanceKeys();
      setKeys(
        rows.map((k) => ({
          id: k.id,
          name: k.name,
          masked: `${k.keyPrefix}${'•'.repeat(8)}`,
          rateLimitPerMin: k.rateLimit,
          lastUsedAt: k.lastUsedAt,
          createdAt: k.createdAt,
          revoked: Boolean(k.revokedAt),
        })),
      );
      setInstanceReachable(true);
    } catch {
      setKeys([]);
      setInstanceReachable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return { keys, loading, instanceReachable, refresh };
}

function CreateKeyDialog({ onCreated, ephemeral = false }: { onCreated: () => void; ephemeral?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [rateLimit, setRateLimit] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [createdKey, setCreatedKey] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const reset = () => {
    setName('');
    setRateLimit('');
    setCreatedKey(null);
    setCopied(false);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      if (ephemeral) {
        setCreatedKey(generateEphemeralKey());
      } else {
        const created = await createInstanceKey(name.trim() || 'New key', rateLimit ? Number(rateLimit) : null);
        setCreatedKey(created.key);
      }
      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the key. Try again.');
    } finally {
      setCreating(false);
    }
  };

  const copyKey = () => {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button size="sm" className="gap-1.5 rounded-pill" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        {ephemeral ? 'Generate key' : 'Create key'}
      </Button>
      <DialogContent>
        {createdKey ? (
          <>
            <DialogHeader>
              <DialogTitle>{ephemeral ? 'Key generated' : 'Key created'}</DialogTitle>
              <DialogDescription>
                {ephemeral
                  ? 'Generated in your browser and never sent anywhere. Nothing is stored, so this is the only time you will see it — add it to your instance to make it work.'
                  : 'Copy it now. For your security this is the only time the full key is shown.'}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-between gap-3 rounded-card border border-border bg-secondary/40 px-3 py-2.5">
              <span className="truncate font-mono text-sm text-primary">{createdKey}</span>
              <Button variant="ghost" size="icon" onClick={copyKey} aria-label="Copy key">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{ephemeral ? 'Generate API key' : 'Create API key'}</DialogTitle>
              <DialogDescription>
                {ephemeral
                  ? 'This deployment has no key store, so the key is generated locally and not saved.'
                  : 'Name it for what will use it. Rate limit is optional.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div className={ephemeral ? 'hidden' : 'flex flex-col gap-1.5'}>
                <Label htmlFor="key-name">Name</Label>
                <Input id="key-name" placeholder="Production agent" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              <div className={ephemeral ? 'hidden' : 'flex flex-col gap-1.5'}>
                <Label htmlFor="key-rate">Rate limit (requests / minute, optional)</Label>
                <Input
                  id="key-rate"
                  type="number"
                  min={1}
                  placeholder="No limit"
                  value={rateLimit}
                  onChange={(e) => setRateLimit(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={creating} className="gap-2">
                {creating && <span className="h-3.5 w-3.5 animate-spin rounded-pill border-2 border-primary-foreground/40 border-t-primary-foreground" />}
                {ephemeral ? 'Generate key' : 'Create key'}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RevokeButton({ id, disabled, onRevoked }: { id: string; disabled: boolean; onRevoked: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [revoking, setRevoking] = React.useState(false);

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      await revokeInstanceKey(id);
      onRevoked();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke the key.');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" disabled={disabled} onClick={() => setOpen(true)}>
        <Trash2 className="h-3.5 w-3.5" />
        Revoke
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke this key?</DialogTitle>
          <DialogDescription>Anything using it will stop authenticating immediately. This cannot be undone.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleRevoke} disabled={revoking} className="gap-2">
            {revoking && <span className="h-3.5 w-3.5 animate-spin rounded-pill border-2 border-destructive-foreground/40 border-t-destructive-foreground" />}
            Revoke key
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function KeysClient() {
  const { keys, loading, instanceReachable, refresh } = useKeys();
  const activeCount = keys?.filter((k) => !k.revoked).length ?? 0;

  return (
    <div className="relative flex flex-col gap-4 bg-background p-4 lg:p-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">
              <KeyRound className="h-3.5 w-3.5" />
              API keys
            </CardTitle>
            <CardDescription>Named keys with an optional per-minute limit. Revoked keys stop authenticating immediately.</CardDescription>
          </div>
          <CreateKeyDialog onCreated={refresh} ephemeral={!instanceReachable} />
        </CardHeader>
        <CardContent className="p-0">
          {loading || !keys ? (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : !instanceReachable ? (
            <p className="p-4 text-sm text-muted-foreground">
              Could not reach the instance at <code className="font-mono text-xs">{PUBLIC_API_URL}</code>, so there are
              no keys to list. You can still generate one here — it is created in your browser and never sent anywhere.
              Install it on an instance with <code className="font-mono text-xs">HELIX_BOOTSTRAP_KEY</code> or{' '}
              <code className="font-mono text-xs">POST /internal/keys</code> to make it authenticate.
            </p>
          ) : keys.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No keys yet. Save your instance&rsquo;s <code className="font-mono text-xs">HELIX_BOOTSTRAP_KEY</code> on
              the settings page, then create keys here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Rate limit</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id} className={k.revoked ? 'opacity-50' : undefined}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell className="font-mono text-xs text-primary">{k.masked}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{k.rateLimitPerMin ? `${k.rateLimitPerMin}/min` : 'No limit'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatRelativeTime(k.createdAt)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{k.lastUsedAt ? formatRelativeTime(k.lastUsedAt) : 'Never'}</TableCell>
                    <TableCell className="text-right">
                      {!k.revoked && <RevokeButton id={k.id} disabled={activeCount <= 1} onRevoked={refresh} />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
