'use client';

import { resolveBaseUrl } from '@/lib/api';
import { getApiKey } from '@/lib/auth';

/**
 * API keys, called straight from the browser against the instance.
 *
 * Self-host serves this dashboard as a static export from the API itself, so
 * there is no dashboard server and no route handler to proxy through. The
 * instance already owns the whole key lifecycle at `/v1/keys`; this is the
 * client for it.
 *
 * Authenticated with an existing key, not the admin token: minting a key needs
 * a key. The first one comes from HELIX_BOOTSTRAP_KEY on the instance.
 */

export interface InstanceKey {
  id: string;
  name: string;
  keyPrefix: string;
  rateLimit: number;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface CreatedKey {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  rateLimit: number;
  createdAt: string;
}

export class KeysError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'KeysError';
    this.status = status;
  }
}

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const token = getApiKey();
  if (!token) {
    throw new KeysError('No API key saved. Paste your instance’s bootstrap key to manage keys.', 401);
  }

  let response: Response;
  try {
    response = await fetch(`${resolveBaseUrl()}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  } catch {
    throw new KeysError(`Could not reach the API at ${resolveBaseUrl()}.`, 0);
  }

  if (response.status === 204) return null;

  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) {
    const message =
      response.status === 401
        ? 'That API key was rejected. Check the key saved for this instance.'
        : (body?.message ?? `Request failed with status ${response.status}`);
    throw new KeysError(message, response.status);
  }
  return body;
}

export async function listInstanceKeys(): Promise<InstanceKey[]> {
  const body = (await call('/keys')) as { keys: InstanceKey[] };
  return body.keys;
}

export async function createInstanceKey(name: string, rateLimit: number | null): Promise<CreatedKey> {
  return (await call('/keys', {
    method: 'POST',
    body: JSON.stringify(rateLimit === null ? { name } : { name, rateLimit }),
  })) as CreatedKey;
}

export async function revokeInstanceKey(id: string): Promise<void> {
  await call(`/keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
