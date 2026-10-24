'use client';

import { resolveBaseUrl } from '@/lib/api';
import { getAdminToken } from '@/lib/instance-settings';

/**
 * API keys, called straight from the browser against the instance.
 *
 * Self-host serves this dashboard as a static export from the API itself, so
 * there is no dashboard server and no route handler to proxy through. The
 * instance already owns the whole key lifecycle at `/v1/keys`; this is the
 * client for it.
 *
 * Authenticated with the instance's admin token, not an API key: one operator
 * owns an instance, and only that operator manages its keys. The desktop app
 * supplies the token; a self-hosted instance takes it from the settings page.
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
  const token = getAdminToken();
  if (!token) {
    throw new KeysError('No admin token saved. Save the instance’s admin token on the settings page to manage keys.', 401);
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

  const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
  if (!response.ok) {
    // Unregistered key routes answer the framework's "Route <method>:<url> not found"; any other 404 is not that.
    const routesMissing = response.status === 404 && /^Route .+ not found$/.test(body?.message ?? '');
    const message =
      response.status === 401
        ? 'The admin token was rejected. Check HELIX_INTERNAL_ADMIN_TOKEN on the instance.'
        : routesMissing
          ? 'Key management is off on this instance: it has no admin token. Set HELIX_INTERNAL_ADMIN_TOKEN and restart it.'
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
