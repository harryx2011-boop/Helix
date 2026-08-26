'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { FrameRow } from '@/components/app/page-frame';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HelixApiError } from '@/lib/api';
import { saveProvider, removeProvider } from '@/lib/providers';
import type { ProviderId, ProviderStatus } from '@/lib/providers';
import { cn } from '@/lib/utils';

const CONFIRM_TIMEOUT_MS = 4000;

interface ProviderMeta {
  id: ProviderId;
  name: string;
  placeholder: string;
  defaultModel: string;
}

export const PROVIDER_META: ProviderMeta[] = [
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-…', defaultModel: 'claude-sonnet-4-5' },
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-…', defaultModel: 'gpt-4o-mini' },
  { id: 'gemini', name: 'Gemini', placeholder: 'AIza…', defaultModel: 'gemini-2.0-flash' },
  { id: 'openrouter', name: 'OpenRouter', placeholder: 'sk-or-…', defaultModel: 'openrouter/auto' },
];

function statusLine(status: ProviderStatus): { text: string; className: string } {
  if (status.source === 'key') {
    return { text: `Connected · key ending in ${status.last4}`, className: 'font-mono text-success' };
  }
  if (status.source === 'instance') {
    return { text: "Using the instance's key", className: 'text-muted-foreground' };
  }
  return { text: 'Not connected', className: 'text-muted-foreground' };
}

export function ProviderRow({
  meta,
  status,
  apiKey,
  onChanged,
  flush = false,
}: {
  meta: ProviderMeta;
  status: ProviderStatus;
  apiKey: string | null;
  onChanged: (next: ProviderStatus) => void;
  flush?: boolean;
}) {
  const [apiKeyInput, setApiKeyInput] = React.useState('');
  const [model, setModel] = React.useState(status.model ?? '');
  const [saving, setSaving] = React.useState(false);
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const confirmTimeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(confirmTimeout.current), []);

  const line = statusLine(status);

  const handleSave = async () => {
    if (!apiKeyInput.trim()) {
      toast.error('Enter an API key to save.');
      return;
    }
    setSaving(true);
    try {
      const result = await saveProvider(apiKey, meta.id, {
        apiKey: apiKeyInput.trim(),
        ...(model.trim() ? { model: model.trim() } : {}),
      });
      onChanged({
        provider: meta.id,
        configured: true,
        source: 'key',
        last4: result.last4,
        model: result.model ?? model.trim() ?? null,
        updatedAt: new Date().toISOString(),
      });
      setApiKeyInput('');
      toast.success(`${meta.name} key saved.`);
    } catch (error) {
      toast.error(error instanceof HelixApiError ? error.message : 'Could not save the key.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!confirmingRemove) {
      setConfirmingRemove(true);
      confirmTimeout.current = setTimeout(() => setConfirmingRemove(false), CONFIRM_TIMEOUT_MS);
      return;
    }
    clearTimeout(confirmTimeout.current);
    setRemoving(true);
    try {
      await removeProvider(apiKey, meta.id);
      onChanged({ provider: meta.id, configured: false, source: 'none' });
      toast.success(`${meta.name} key removed.`);
    } catch (error) {
      toast.error(error instanceof HelixApiError ? error.message : 'Could not remove the key.');
    } finally {
      setRemoving(false);
      setConfirmingRemove(false);
    }
  };

  return (
    <FrameRow flush={flush}>
      <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- static favicon-sized PNG, no next/image benefit */}
          <img src={`/providers/${meta.id}.png`} alt="" width={20} height={20} className="rounded-card" />
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-foreground">{meta.name}</span>
            <span className={cn('text-xs', line.className)}>{line.text}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:flex-1 lg:flex-row lg:items-center lg:justify-end">
          <Input
            type="password"
            placeholder={meta.placeholder}
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            autoComplete="off"
            aria-label={`${meta.name} API key`}
            className="lg:max-w-xs"
          />
          <Input
            type="text"
            placeholder={meta.defaultModel}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            aria-label={`${meta.name} model`}
            className="lg:max-w-[200px]"
          />
          <div className="flex shrink-0 items-center gap-2">
            <Button onClick={handleSave} disabled={saving} className="shrink-0 rounded-pill">
              {saving ? 'Saving…' : 'Save'}
            </Button>
            {status.source === 'key' && (
              <Button
                variant="ghost"
                onClick={handleRemove}
                disabled={removing}
                className={cn('shrink-0 rounded-pill', confirmingRemove && 'text-destructive')}
              >
                {removing ? 'Removing…' : confirmingRemove ? 'Confirm' : 'Remove key?'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </FrameRow>
  );
}
