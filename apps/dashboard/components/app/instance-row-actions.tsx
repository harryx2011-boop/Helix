'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InstanceRowActionsProps {
  instanceId: string;
  baseUrl: string;
}

export function InstanceRowActions({ instanceId, baseUrl }: InstanceRowActionsProps) {
  const router = useRouter();
  const [checking, setChecking] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);

  const checkHealth = React.useCallback(async () => {
    setChecking(true);
    let result: Record<string, unknown>;
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/health`, { cache: 'no-store' });
      result = await response.json();
    } catch (err) {
      result = { status: 'down', error: err instanceof Error ? err.message : 'Could not reach instance.' };
    }

    try {
      await fetch(`/api/app/instances/${instanceId}/health`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(result),
      });
    } finally {
      setChecking(false);
      router.refresh();
    }
  }, [baseUrl, instanceId, router]);

  const handleRemove = React.useCallback(async () => {
    if (!confirmingRemove) {
      setConfirmingRemove(true);
      return;
    }
    setRemoving(true);
    try {
      await fetch(`/api/app/instances/${instanceId}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setRemoving(false);
      setConfirmingRemove(false);
    }
  }, [confirmingRemove, instanceId, router]);

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs" onClick={checkHealth} disabled={checking}>
        {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Check health
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
        onClick={handleRemove}
        disabled={removing}
        onBlur={() => setConfirmingRemove(false)}
      >
        {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        {confirmingRemove ? 'Confirm remove' : 'Remove'}
      </Button>
    </div>
  );
}
