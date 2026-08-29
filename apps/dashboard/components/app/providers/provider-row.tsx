'use client';

import * as React from 'react';
import { ChevronsUpDown, Loader2, Server } from 'lucide-react';
import { toast } from 'sonner';
import { FrameRow } from '@/components/app/page-frame';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HelixApiError } from '@/lib/api';
import { saveProvider, removeProvider, listProviderModels } from '@/lib/providers';
import type { ProviderId, ProviderModel, ProviderStatus } from '@/lib/providers';
import { cn } from '@/lib/utils';

const CONFIRM_TIMEOUT_MS = 4000;

interface ProviderMeta {
  id: ProviderId;
  name: string;
  /** Local runtimes take a base URL instead of an API key. */
  local?: boolean;
  placeholder?: string;
  baseUrlPlaceholder?: string;
  defaultModel?: string;
}

export const PROVIDER_META: ProviderMeta[] = [
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-…', defaultModel: 'claude-sonnet-4-5' },
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-…', defaultModel: 'gpt-4o-mini' },
  { id: 'gemini', name: 'Gemini', placeholder: 'AIza…', defaultModel: 'gemini-2.0-flash' },
  { id: 'openrouter', name: 'OpenRouter', placeholder: 'sk-or-…', defaultModel: 'openrouter/auto' },
  { id: 'ollama', name: 'Ollama', local: true, baseUrlPlaceholder: 'http://localhost:11434/v1', defaultModel: 'llama3.2' },
  {
    id: 'vllm',
    name: 'vLLM',
    local: true,
    baseUrlPlaceholder: 'http://localhost:8000/v1',
    defaultModel: 'meta-llama/Llama-3.1-8B-Instruct',
  },
  { id: 'openai-compatible', name: 'OpenAI-compatible', local: true, baseUrlPlaceholder: 'https://your-host/v1' },
];

/** `docs.vllm.ai` / `ollama.com` ship real PNG marks; `openai-compatible` isn't a company and gets a lucide icon instead. */
function ProviderIcon({ meta }: { meta: ProviderMeta }) {
  if (meta.id === 'openai-compatible') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-card bg-muted text-muted-foreground">
        <Server className="h-3.5 w-3.5" />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- static favicon-sized PNG, no next/image benefit
  return <img src={`/providers/${meta.id}.png`} alt="" width={20} height={20} className="rounded-card" />;
}

function hostFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return url;
  }
}

function modelMeta(model: ProviderModel): string | undefined {
  const parts: string[] = [];
  if (model.parameterSize) parts.push(model.parameterSize);
  if (model.capabilities?.length) parts.push(model.capabilities.join(', '));
  return parts.length ? parts.join(' · ') : undefined;
}

/**
 * Browses a local runtime's installed models, next to the free-text model
 * input it never replaces — a runtime may hold a model this list can't see
 * (still pulling, or on a host the caller trusts but this fetch can't reach).
 *
 * The API fetches against the base URL already saved for this provider, not
 * whatever sits unsaved in the text field — `savedBaseUrl` gates browsing so
 * a pending edit never gets silently checked against the old host.
 */
function ModelPicker({
  providerId,
  providerName,
  apiKey,
  savedBaseUrl,
  onPick,
}: {
  providerId: ProviderId;
  providerName: string;
  apiKey: string | null;
  savedBaseUrl: string | null | undefined;
  onPick: (name: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [models, setModels] = React.useState<ProviderModel[] | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!savedBaseUrl) {
      setNotice('Save a base URL first, then browse its models.');
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      const result = await listProviderModels(apiKey, providerId);
      if (!result.success) {
        setModels(null);
        setNotice(result.failure.message);
        return;
      }
      setModels(result.models);
      if (result.models.length === 0) setNotice(`No models found on this ${providerName} host yet.`);
    } catch (error) {
      setModels(null);
      setNotice(error instanceof HelixApiError ? error.message : `Could not reach ${providerName}.`);
    } finally {
      setLoading(false);
    }
  }, [apiKey, savedBaseUrl, providerId, providerName]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && models === null && !loading) void load();
  };

  React.useEffect(() => {
    setModels(null);
    setNotice(null);
  }, [savedBaseUrl]);

  return (
    <div className="flex flex-col gap-1">
      <Select open={open} onOpenChange={handleOpenChange} onValueChange={onPick} value="">
        <SelectTrigger
          aria-label={`Browse installed ${providerName} models`}
          className="h-9 w-9 shrink-0 justify-center gap-0 border-dashed px-0 [&>span]:hidden"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />}
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {models && models.length > 0 ? (
            models.map((m) => (
              <SelectItem key={m.name} value={m.name}>
                <div className="flex flex-col gap-0.5 py-0.5">
                  <span className="font-mono text-xs">{m.name}</span>
                  {modelMeta(m) && <span className="text-[11px] text-muted-foreground">{modelMeta(m)}</span>}
                </div>
              </SelectItem>
            ))
          ) : (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              {loading ? 'Checking…' : (notice ?? 'No models to show.')}
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

function statusLine(status: ProviderStatus, local: boolean | undefined): { text: string; className: string } {
  if (status.source === 'key') {
    if (local) {
      return {
        text: status.baseUrl ? `Connected · ${hostFromUrl(status.baseUrl)}` : 'Connected',
        className: 'font-mono text-success',
      };
    }
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
  const [baseUrlInput, setBaseUrlInput] = React.useState(status.baseUrl ?? '');
  const [model, setModel] = React.useState(status.model ?? '');
  const [saving, setSaving] = React.useState(false);
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const confirmTimeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(confirmTimeout.current), []);

  const line = statusLine(status, meta.local);

  const handleSave = async () => {
    if (meta.local) {
      if (!baseUrlInput.trim()) {
        toast.error('Enter a base URL to save.');
        return;
      }
    } else if (!apiKeyInput.trim()) {
      toast.error('Enter an API key to save.');
      return;
    }
    setSaving(true);
    try {
      const result = await saveProvider(apiKey, meta.id, {
        ...(meta.local ? { baseUrl: baseUrlInput.trim() } : { apiKey: apiKeyInput.trim() }),
        ...(model.trim() ? { model: model.trim() } : {}),
      });
      onChanged({
        provider: meta.id,
        configured: true,
        source: 'key',
        ...(result.last4 ? { last4: result.last4 } : {}),
        model: result.model ?? model.trim() ?? null,
        baseUrl: result.baseUrl ?? (meta.local ? baseUrlInput.trim() : null),
        updatedAt: new Date().toISOString(),
      });
      if (!meta.local) setApiKeyInput('');
      toast.success(`${meta.name} ${meta.local ? 'connection' : 'key'} saved.`);
    } catch (error) {
      toast.error(error instanceof HelixApiError ? error.message : `Could not save the ${meta.local ? 'connection' : 'key'}.`);
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
      toast.success(`${meta.name} ${meta.local ? 'connection' : 'key'} removed.`);
    } catch (error) {
      toast.error(error instanceof HelixApiError ? error.message : `Could not remove the ${meta.local ? 'connection' : 'key'}.`);
    } finally {
      setRemoving(false);
      setConfirmingRemove(false);
    }
  };

  return (
    <FrameRow flush={flush}>
      <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2.5">
          <ProviderIcon meta={meta} />
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-foreground">{meta.name}</span>
            <span className={cn('text-xs', line.className)}>{line.text}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:flex-1 lg:flex-row lg:items-center lg:justify-end">
          {meta.local ? (
            <Input
              type="url"
              placeholder={meta.baseUrlPlaceholder}
              value={baseUrlInput}
              onChange={(e) => setBaseUrlInput(e.target.value)}
              autoComplete="off"
              aria-label={`${meta.name} base URL`}
              className="lg:max-w-xs"
            />
          ) : (
            <Input
              type="password"
              placeholder={meta.placeholder}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              autoComplete="off"
              aria-label={`${meta.name} API key`}
              className="lg:max-w-xs"
            />
          )}
          <div className="flex items-center gap-1.5 lg:max-w-[200px]">
            <Input
              type="text"
              placeholder={meta.defaultModel}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              aria-label={`${meta.name} model`}
            />
            {meta.local && (
              <ModelPicker
                providerId={meta.id}
                providerName={meta.name}
                apiKey={apiKey}
                savedBaseUrl={status.baseUrl}
                onPick={setModel}
              />
            )}
          </div>
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
                {removing ? 'Removing…' : confirmingRemove ? 'Confirm' : meta.local ? 'Remove?' : 'Remove key?'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </FrameRow>
  );
}
