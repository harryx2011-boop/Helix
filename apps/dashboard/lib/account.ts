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

export type UsageStatusClass = '2xx' | '4xx' | '429' | '5xx';
export type UsageStatusCounts = Record<UsageStatusClass, number>;

export interface UsageEndpointDay {
  /** UTC calendar day, YYYY-MM-DD. */
  day: string;
  counts: UsageStatusCounts;
  /** Hours in the day with at least one recorded request. */
  observedHours: number;
  /** Observed hours in which at least one request answered 5xx. */
  badHours: number;
}

/** Recorded outcomes for one route family (`/scrape`, `/crawl/:id`, ...), as the health page reads them. */
export interface UsageEndpoint {
  endpoint: string;
  requests: number;
  counts: UsageStatusCounts;
  /** 2xx and 5xx in the hourly buckets that start within the last 24 hours. */
  last24h: { ok: number; failed: number };
  days: UsageEndpointDay[];
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
  endpoints: UsageEndpoint[];
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
