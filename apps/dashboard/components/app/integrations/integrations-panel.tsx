'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { FrameRow, FrameHeading } from '@/components/app/page-frame';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { GithubMark } from '@/components/marketing/github-mark';

/** Mirrors `GithubConnectionMeta` in lib/github.ts — no token, no ciphertext. */
interface Connection {
  id: string;
  login: string;
  avatarUrl: string | null;
  scopes: string[];
  agentMayUse: boolean;
  tokenLast4: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

const CONFIRM_TIMEOUT_MS = 4000;

/* The callback lands back here with a result in the URL. Rendering it as a
   toast rather than inline keeps the panel's resting state identical whether
   the user arrived from a connect or from the nav. */
const CALLBACK_MESSAGE: Record<string, string> = {
  state: 'That sign-in could not be verified. Try connecting again.',
  exchange: 'GitHub refused the sign-in.',
  not_configured: 'GitHub is not configured on this instance.',
  access_denied: 'The GitHub sign-in was cancelled.',
};

export function IntegrationsPanel() {
  const params = useSearchParams();
  const [connections, setConnections] = React.useState<Connection[] | null>(null);
  const [configured, setConfigured] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/app/github', { cache: 'no-store' });
      if (!res.ok) throw new Error('load failed');
      const json = (await res.json()) as { connections: Connection[]; configured: boolean };
      setConnections(json.connections);
      setConfigured(json.configured);
    } catch {
      setConnections([]);
      setError('Could not load your connections.');
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  /* Fires once per arrival. The result params are read but deliberately not
     stripped from the URL — a history entry carrying `github=connected` is
     harmless, and rewriting it would fight the browser's back button. */
  const announced = React.useRef(false);
  React.useEffect(() => {
    if (announced.current) return;
    const result = params.get('github');
    if (!result) return;
    announced.current = true;
    if (result === 'connected') toast.success('GitHub connected.');
    else toast.error(CALLBACK_MESSAGE[params.get('reason') ?? ''] ?? 'Could not connect GitHub.');
  }, [params]);

  return (
    <>
      <FrameRow>
        <FrameHeading
          title="Integrations"
          description="Connect an account so Helix can read what you already have access to. Connecting is one decision; letting a run act with it is another."
        />
      </FrameRow>

      {connections === null && (
        <FrameRow flush className="flex flex-col gap-3 p-6">
          <Skeleton className="h-20 w-full" />
        </FrameRow>
      )}

      {connections !== null && (
        <>
          <GithubRow
            connections={connections}
            configured={configured}
            onChanged={load}
          />
          {error && (
            <FrameRow flush>
              <p className="px-6 py-4 text-xs text-destructive">{error}</p>
            </FrameRow>
          )}
        </>
      )}
    </>
  );
}

function GithubRow({
  connections, configured, onChanged,
}: {
  connections: Connection[];
  configured: boolean;
  onChanged: () => Promise<void>;
}) {
  return (
    <>
      <FrameRow flush={connections.length === 0}>
        <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2.5">
            <GithubMark className="h-5 w-5 text-foreground" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-medium text-foreground">GitHub</span>
              <span className="text-xs text-muted-foreground">
                {!configured
                  ? 'Not configured on this instance'
                  : connections.length === 0
                    ? 'Read your repositories and profile'
                    : `${connections.length} connected`}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* A real navigation rather than fetch: the route answers with a
                redirect to GitHub, which an XHR cannot follow. `asChild` would
                render an anchor, and an anchor ignores `disabled` — so an
                unconfigured instance gets a genuinely inert button instead of
                a link that looks disabled and still navigates. */}
            <Button
              disabled={!configured}
              className="shrink-0 rounded-pill"
              onClick={() => { window.location.href = '/api/app/github/connect'; }}
            >
              {connections.length === 0 ? 'Connect' : 'Connect another'}
            </Button>
          </div>
        </div>
      </FrameRow>

      {connections.map((c, i) => (
        <ConnectionRow
          key={c.id}
          connection={c}
          flush={i === connections.length - 1}
          onChanged={onChanged}
        />
      ))}
    </>
  );
}

function ConnectionRow({
  connection, flush, onChanged,
}: {
  connection: Connection;
  flush: boolean;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);

  React.useEffect(() => {
    if (!confirmingRemove) return;
    const t = setTimeout(() => setConfirmingRemove(false), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [confirmingRemove]);

  const toggleAgent = async (next: boolean) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/app/github/${connection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentMayUse: next }),
      });
      if (!res.ok) throw new Error('patch failed');
      await onChanged();
    } catch {
      toast.error('Could not change that setting.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmingRemove) {
      setConfirmingRemove(true);
      return;
    }
    setRemoving(true);
    try {
      const res = await fetch(`/api/app/github/${connection.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      toast.success(`Disconnected ${connection.login}.`);
      await onChanged();
    } catch {
      toast.error('Could not disconnect that account.');
    } finally {
      setRemoving(false);
      setConfirmingRemove(false);
    }
  };

  return (
    <FrameRow flush={flush}>
      <div className="flex flex-col gap-4 px-6 py-4 pl-14 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium text-foreground">{connection.login}</span>
          <span className="text-xs text-muted-foreground">
            {connection.agentMayUse ? 'Runs may use this' : 'Helix only'}
            {connection.scopes.length > 0 && ` · ${connection.scopes.join(', ')}`}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={connection.agentMayUse}
              disabled={busy}
              onCheckedChange={(v) => void toggleAgent(v)}
              aria-label={`Let runs use ${connection.login}`}
            />
            Runs may use
          </label>
          <Button
            variant="ghost"
            onClick={() => void remove()}
            disabled={removing}
            className={confirmingRemove ? 'shrink-0 rounded-pill text-destructive' : 'shrink-0 rounded-pill'}
          >
            {removing ? 'Removing…' : confirmingRemove ? 'Confirm' : 'Disconnect'}
          </Button>
        </div>
      </div>
    </FrameRow>
  );
}
