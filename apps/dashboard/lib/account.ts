import type { DeployIntent, LlmProvider, OnboardingEndpoint, OnboardingRole, UseCase } from '@/lib/supabase/types';

/**
 * Client-side calls for the account, usage and danger-zone panels.
 *
 * Every one of these hits a route that re-derives the profile from the Clerk
 * session, so nothing here identifies an account and there is no id to pass.
 */

export interface AccountAnswers {
  role: OnboardingRole | null;
  useCases: UseCase[];
  llmProvider: LlmProvider | null;
  deployIntent: DeployIntent | null;
  selectedEndpoints: OnboardingEndpoint[];
  heardFrom: string | null;
  heardFromDetail: string | null;
}

export interface Account {
  name: string | null;
  avatarUrl: string | null;
  email: string;
  memberSince: string;
  onboardingCompletedAt: string | null;
  answers: AccountAnswers;
}

export interface UsageKey {
  id: string;
  name: string;
  keyPrefix: string;
  rateLimit: number;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface Usage {
  since: string;
  until: string;
  hours: number;
  total: number;
  rateLimited: number;
  errors: number;
  series: { bucketStart: string; requests: number }[];
  byEndpoint: { endpoint: string; requests: number }[];
  keys: UsageKey[];
}

export class AccountError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'AccountError';
    this.status = status;
    this.code = code;
  }
}

async function unwrap<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
  throw new AccountError(body?.message ?? 'The request failed.', res.status, body?.error ?? 'unknown');
}

export async function getAccount(): Promise<Account> {
  return unwrap<Account>(await fetch('/api/app/account', { cache: 'no-store' }));
}

/** Partial by design: an unnamed field keeps its stored value rather than being cleared. */
export async function updateAccount(patch: Partial<AccountAnswers>): Promise<Account> {
  return unwrap<Account>(
    await fetch('/api/app/account', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  );
}

export async function getUsage(hours: number): Promise<Usage> {
  return unwrap<Usage>(await fetch(`/api/app/usage?hours=${hours}`, { cache: 'no-store' }));
}

export type DangerAction = 'revoke_keys' | 'clear_providers' | 'reset_onboarding' | 'delete_account';

export async function getConfirmations(): Promise<Record<DangerAction, string>> {
  const body = await unwrap<{ confirmations: Record<DangerAction, string> }>(
    await fetch('/api/app/account/danger', { cache: 'no-store' }),
  );
  return body.confirmations;
}

/**
 * The typed phrase travels to the server, which compares it before doing
 * anything. The dialog cannot authorise the action on its own.
 */
export async function runDangerAction(action: DangerAction, confirm: string): Promise<Record<string, unknown>> {
  return unwrap<Record<string, unknown>>(
    await fetch('/api/app/account/danger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, confirm }),
    }),
  );
}
