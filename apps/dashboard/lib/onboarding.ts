import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  DEPLOY_INTENTS,
  HEARD_FROM,
  ONBOARDING_ENDPOINTS,
  LLM_PROVIDERS,
  ONBOARDING_ROLES,
  USE_CASES,
  type DeployIntent,
  type HeardFrom,
  type OnboardingEndpoint,
  type LlmProvider,
  type OnboardingRole,
  type ProfileRow,
  type UseCase,
} from '@/lib/supabase/types';

export interface OnboardingAnswers {
  role: OnboardingRole | null;
  useCases: UseCase[];
  llmProvider: LlmProvider | null;
  deployIntent: DeployIntent | null;
  selectedEndpoints: OnboardingEndpoint[];
  heardFrom: HeardFrom | null;
  /** Only meaningful when `heardFrom` is 'other'; dropped otherwise. */
  heardFromDetail: string | null;
}

export const EMPTY_ANSWERS: OnboardingAnswers = {
  role: null,
  useCases: [],
  llmProvider: null,
  deployIntent: null,
  selectedEndpoints: [],
  heardFrom: null,
  heardFromDetail: null,
};

/**
 * The wizard posts JSON from a browser, so nothing arriving here is trusted:
 * the check constraints in 0003 would reject a bad value anyway, but as a
 * constraint violation rather than a usable error. Parsing to the known
 * vocabularies first means an unknown value is dropped at the boundary and
 * the rest of the answers still save — every step is optional, so a junk
 * field is indistinguishable from a skipped one.
 */
function pickOne<T extends readonly string[]>(allowed: T, value: unknown): T[number] | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T[number]) : null;
}

function pickMany<T extends readonly string[]>(allowed: T, value: unknown): T[number][] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === 'string' && (allowed as readonly string[]).includes(item)) seen.add(item);
  }
  // Preserve the declared order rather than the payload's, so the sidebar and
  // the generated SKILL.md list endpoints the same way for every user.
  return (allowed as readonly string[]).filter((a) => seen.has(a)) as T[number][];
}

/**
 * The free-text note on 'other'. Trimmed, length-capped to the same 200 the
 * check constraint enforces, and dropped entirely unless the answer is
 * 'other' — a detail attached to a categorised answer would put the prose and
 * the count out of step, and 0005 rejects it at the database anyway.
 */
function pickDetail(heardFrom: HeardFrom | null, value: unknown): string | null {
  if (heardFrom !== 'other' || typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 200);
  return trimmed.length > 0 ? trimmed : null;
}

export function parseAnswers(input: unknown): OnboardingAnswers {
  const body = (input ?? {}) as Record<string, unknown>;
  const heardFrom = pickOne(HEARD_FROM, body.heardFrom);
  return {
    role: pickOne(ONBOARDING_ROLES, body.role),
    useCases: pickMany(USE_CASES, body.useCases),
    llmProvider: pickOne(LLM_PROVIDERS, body.llmProvider),
    deployIntent: pickOne(DEPLOY_INTENTS, body.deployIntent),
    selectedEndpoints: pickMany(ONBOARDING_ENDPOINTS, body.selectedEndpoints),
    heardFrom,
    heardFromDetail: pickDetail(heardFrom, body.heardFromDetail),
  };
}

export function answersFromProfile(profile: ProfileRow): OnboardingAnswers {
  return {
    role: profile.role,
    useCases: profile.use_cases ?? [],
    llmProvider: profile.llm_provider,
    deployIntent: profile.deploy_intent,
    selectedEndpoints: profile.selected_endpoints ?? [],
    heardFrom: profile.heard_from,
    heardFromDetail: profile.heard_from_detail,
  };
}

export interface SaveOptions {
  /** Settings → Preferences re-edits the answers without re-stamping completion. */
  complete: boolean;
}

export async function saveAnswers(
  profileId: string,
  answers: OnboardingAnswers,
  options: SaveOptions,
): Promise<ProfileRow> {
  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .update({
      role: answers.role,
      use_cases: answers.useCases,
      llm_provider: answers.llmProvider,
      deploy_intent: answers.deployIntent,
      selected_endpoints: answers.selectedEndpoints,
      heard_from: answers.heardFrom,
      heard_from_detail: answers.heardFromDetail,
      ...(options.complete ? { onboarding_completed_at: new Date().toISOString() } : {}),
    })
    .eq('id', profileId)
    .select('*')
    .single<ProfileRow>();
  if (error) throw error;
  return data;
}
