'use client';

import { HelixClient, HelixApiError } from '@/lib/api';
import type {
  ListModelsResponse,
  ListProvidersResponse,
  ProviderName,
  RemoveProviderResponse,
  SaveProviderRequest,
  SaveProviderResponse,
} from '@/lib/api';
import { HOSTED } from '@/lib/mode';

export type { ProviderStatus, ProviderName as ProviderId, ProviderModel, ListModelsFailureReason } from '@/lib/api';

interface FailureBody {
  success?: boolean;
  failure?: { reason: string; message?: string };
  error?: string;
  message?: string;
  field?: string;
}

function failureMessage(body: FailureBody | null, status: number): string {
  if (body?.failure?.message) return body.failure.message;
  if (body?.message) return body.message;
  return `Request failed with status ${status}`;
}

/**
 * Self-host has no accounts, so the browser's own key is the only credential
 * there is — same instance call every function here always made. Hosted mounts
 * no ApiKeyProvider (the user has not minted a key yet), so these instead hit
 * the `/api/app/providers` proxy, which resolves the signed-in user's own key
 * server-side and forwards the request. `apiKey` is ignored in that branch;
 * kept as a parameter so callers do not need to know which mode they are in.
 */
async function proxyRequest<T>(init: { method: string; query: Record<string, string>; body?: unknown }): Promise<T> {
  const params = new URLSearchParams(init.query);
  const response = await fetch(`/api/app/providers?${params.toString()}`, {
    method: init.method,
    ...(init.body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) } : {}),
  });
  const json = (await response.json().catch(() => null)) as (T & FailureBody) | null;
  if (!response.ok) {
    const message = failureMessage(json, response.status);
    throw new HelixApiError(message, response.status, { error: json?.error ?? 'proxy_error', message });
  }
  return json as T;
}

export async function listProviders(apiKey: string | null): Promise<ListProvidersResponse> {
  if (HOSTED) return proxyRequest<ListProvidersResponse>({ method: 'GET', query: {} });
  if (!apiKey) throw new HelixApiError('No API key configured.', 401);
  const client = new HelixClient({ apiKey });
  return client.listProviders();
}

export async function saveProvider(
  apiKey: string | null,
  provider: ProviderName,
  body: SaveProviderRequest,
): Promise<SaveProviderResponse> {
  if (HOSTED) return proxyRequest<SaveProviderResponse>({ method: 'PUT', query: { provider }, body });
  if (!apiKey) throw new HelixApiError('No API key configured.', 401);
  const client = new HelixClient({ apiKey });
  return client.saveProvider(provider, body);
}

export async function removeProvider(apiKey: string | null, provider: ProviderName): Promise<RemoveProviderResponse> {
  if (HOSTED) return proxyRequest<RemoveProviderResponse>({ method: 'DELETE', query: { provider } });
  if (!apiKey) throw new HelixApiError('No API key configured.', 401);
  const client = new HelixClient({ apiKey });
  return client.removeProvider(provider);
}

export async function listProviderModels(apiKey: string | null, provider: ProviderName): Promise<ListModelsResponse> {
  if (HOSTED) return proxyRequest<ListModelsResponse>({ method: 'GET', query: { provider, models: '1' } });
  if (!apiKey) throw new HelixApiError('No API key configured.', 401);
  const client = new HelixClient({ apiKey });
  return client.listProviderModels(provider);
}
