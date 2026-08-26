'use client';

import { HelixClient, HelixApiError } from '@/lib/api';
import type {
  ListProvidersResponse,
  ProviderName,
  RemoveProviderResponse,
  SaveProviderRequest,
  SaveProviderResponse,
} from '@/lib/api';

const HOSTED = process.env.NEXT_PUBLIC_HELIX_HOSTED === '1';

export type { ProviderStatus, ProviderName as ProviderId } from '@/lib/api';

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
  if (HOSTED) {
    const response = await fetch('/api/app/providers');
    const body = (await response.json().catch(() => null)) as FailureBody | null;
    if (!response.ok || !body || body.success !== true) {
      throw new HelixApiError(failureMessage(body, response.status), response.status);
    }
    return body as unknown as ListProvidersResponse;
  }

  if (!apiKey) throw new HelixApiError('No API key configured.', 401);
  const client = new HelixClient({ apiKey });
  return client.listProviders();
}

export async function saveProvider(
  apiKey: string | null,
  provider: ProviderName,
  body: SaveProviderRequest,
): Promise<SaveProviderResponse> {
  if (HOSTED) {
    const response = await fetch(`/api/app/providers/${provider}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const responseBody = (await response.json().catch(() => null)) as FailureBody | null;
    if (!response.ok || !responseBody || responseBody.success !== true) {
      throw new HelixApiError(failureMessage(responseBody, response.status), response.status);
    }
    return responseBody as unknown as SaveProviderResponse;
  }

  if (!apiKey) throw new HelixApiError('No API key configured.', 401);
  const client = new HelixClient({ apiKey });
  return client.saveProvider(provider, body);
}

export async function removeProvider(apiKey: string | null, provider: ProviderName): Promise<RemoveProviderResponse> {
  if (HOSTED) {
    const response = await fetch(`/api/app/providers/${provider}`, { method: 'DELETE' });
    const body = (await response.json().catch(() => null)) as FailureBody | null;
    if (!response.ok || !body || body.success !== true) {
      throw new HelixApiError(failureMessage(body, response.status), response.status);
    }
    return body as unknown as RemoveProviderResponse;
  }

  if (!apiKey) throw new HelixApiError('No API key configured.', 401);
  const client = new HelixClient({ apiKey });
  return client.removeProvider(provider);
}
