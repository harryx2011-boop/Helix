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

export async function listProviders(apiKey: string | null): Promise<ListProvidersResponse> {
  if (!apiKey) throw new HelixApiError('No API key configured.', 401);
  const client = new HelixClient({ apiKey });
  return client.listProviders();
}

export async function saveProvider(
  apiKey: string | null,
  provider: ProviderName,
  body: SaveProviderRequest,
): Promise<SaveProviderResponse> {
  if (!apiKey) throw new HelixApiError('No API key configured.', 401);
  const client = new HelixClient({ apiKey });
  return client.saveProvider(provider, body);
}

export async function removeProvider(apiKey: string | null, provider: ProviderName): Promise<RemoveProviderResponse> {
  if (!apiKey) throw new HelixApiError('No API key configured.', 401);
  const client = new HelixClient({ apiKey });
  return client.removeProvider(provider);
}

export async function listProviderModels(apiKey: string | null, provider: ProviderName): Promise<ListModelsResponse> {
  if (!apiKey) throw new HelixApiError('No API key configured.', 401);
  const client = new HelixClient({ apiKey });
  return client.listProviderModels(provider);
}
