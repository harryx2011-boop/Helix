'use client';

/**
 * Client for the hosted account-key routes (`app/api/app/keys/*.hosted.ts`).
 *
 * Mirrors `lib/instance-keys.ts`'s shape: same `KeysError`, same call surface.
 * A 503 means Supabase isn't configured for this deployment — callers should
 * fall back to the instance-key / ephemeral flow rather than surfacing an error.
 */

export interface HostedKey {
  id: string;
  name: string;
  keyPrefix: string;
  rateLimit: number;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface CreatedHostedKey {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  rateLimit: number;
  createdAt: string;
}

export class HostedKeysError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HostedKeysError';
    this.status = status;
  }
}

export function isHostedKeysNotConfigured(error: unknown): boolean {
  return error instanceof HostedKeysError && error.status === 503;
}

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`/api/app/keys${path}`, {
      ...init,
      headers: { ...init.headers, 'Content-Type': 'application/json' },
    });
  } catch {
    throw new HostedKeysError('Could not reach the dashboard server.', 0);
  }

  if (response.status === 204) return null;

  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new HostedKeysError(body?.error ?? `Request failed with status ${response.status}`, response.status);
  }
  return body;
}

export async function listHostedKeys(): Promise<HostedKey[]> {
  const body = (await call('')) as { keys: HostedKey[] };
  return body.keys;
}

export async function createHostedKey(name: string, rateLimit?: number): Promise<CreatedHostedKey> {
  return (await call('', {
    method: 'POST',
    body: JSON.stringify(rateLimit ? { name, rateLimit } : { name }),
  })) as CreatedHostedKey;
}

export async function revokeHostedKey(id: string): Promise<void> {
  await call(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
