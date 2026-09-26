'use client';

import { desktopCredentials } from '@/lib/desktop';
import { resolveBaseUrl } from '@/lib/api';

/**
 * Instance settings, called straight from the browser.
 *
 * Self-host serves this dashboard as a static export from the API itself, so
 * there is no dashboard server to hold a secret and no route handler to proxy
 * through. The operator's admin token therefore lives in localStorage beside
 * the API key, the same way self-host already handles credentials.
 *
 * The token authenticates the operator, not a caller: it is the same
 * `HELIX_INTERNAL_ADMIN_TOKEN` the instance was started with.
 */

const STORAGE_KEY = 'helix.adminToken';

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return desktopCredentials()?.adminToken ?? window.localStorage.getItem(STORAGE_KEY);
}

export function setAdminToken(token: string): void {
  window.localStorage.setItem(STORAGE_KEY, token);
}

export function clearAdminToken(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export type SettingEffect = 'live' | 'restart' | 'guarded';

export interface InstanceSetting {
  key: string;
  env: string;
  effect: SettingEffect;
  description: string;
  warning?: string;
  value: unknown;
  envValue: unknown;
  overridden: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export interface SettingsResponse {
  success: true;
  settings: InstanceSetting[];
  encryptionKeyVersion: number;
}

export interface SaveResult {
  key: string;
  value: unknown;
  effect: SettingEffect;
  applied: boolean;
  restartRequired: boolean;
}

interface FailureBody {
  success?: boolean;
  error?: string;
  message?: string;
  confirm?: string;
}

export class SettingsError extends Error {
  readonly status: number;
  /** Set when the API refused pending a confirmation naming this key. */
  readonly confirm: string | undefined;

  constructor(message: string, status: number, confirm?: string) {
    super(message);
    this.name = 'SettingsError';
    this.status = status;
    this.confirm = confirm;
  }
}

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const token = getAdminToken();
  if (!token) throw new SettingsError('No admin token saved.', 401);

  const origin = resolveBaseUrl().replace(/\/v1$/, '');
  let response: Response;
  try {
    response = await fetch(`${origin}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  } catch {
    throw new SettingsError(`Could not reach the API at ${origin}.`, 0);
  }

  const body = (await response.json().catch(() => null)) as FailureBody | null;
  if (!response.ok || body?.success !== true) {
    const message =
      response.status === 401
        ? 'The admin token was rejected. Check HELIX_INTERNAL_ADMIN_TOKEN on the instance.'
        : (body?.message ?? `Request failed with status ${response.status}`);
    throw new SettingsError(message, response.status, body?.confirm);
  }
  return body;
}

export async function listInstanceSettings(): Promise<SettingsResponse> {
  return (await call('/settings')) as SettingsResponse;
}

export async function saveInstanceSetting(key: string, value: unknown, confirm?: string): Promise<SaveResult> {
  return (await call(`/settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify(confirm ? { value, confirm } : { value }),
  })) as SaveResult;
}

export async function clearInstanceSetting(key: string): Promise<void> {
  await call(`/settings/${encodeURIComponent(key)}`, { method: 'DELETE' });
}
