/** Closed vocabularies, enforced by check constraints in 0003_onboarding.sql. */
export const ONBOARDING_ROLES = ['engineer', 'founder', 'researcher', 'data_ml', 'other'] as const;
export const USE_CASES = [
  'agent_tools',
  'research_pipeline',
  'rag_search',
  'monitoring',
  'enrichment',
  'internal_tooling',
] as const;
export const LLM_PROVIDERS = ['anthropic', 'openai', 'google', 'openrouter', 'local', 'unsure'] as const;
export const DEPLOY_INTENTS = ['hosted', 'self_host', 'both'] as const;
/**
 * The six the wizard offers (WEBSITE.md §6.2). Deliberately NOT `lib/endpoints.ts`'s
 * `Endpoint`, which also carries `map` — map is a primitive of crawl, not a
 * product anyone picks in onboarding. Values are a subset of that union, so
 * `orderBySelection` matches them by id without a translation step.
 */
export const ONBOARDING_ENDPOINTS = ['scrape', 'parse', 'search', 'crawl', 'interact', 'monitor'] as const;

export type OnboardingRole = (typeof ONBOARDING_ROLES)[number];
export type UseCase = (typeof USE_CASES)[number];
export type LlmProvider = (typeof LLM_PROVIDERS)[number];
export type DeployIntent = (typeof DEPLOY_INTENTS)[number];
export type OnboardingEndpoint = (typeof ONBOARDING_ENDPOINTS)[number];

export interface ProfileRow {
  id: string;
  clerk_user_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  role: OnboardingRole | null;
  use_cases: UseCase[];
  llm_provider: LlmProvider | null;
  deploy_intent: DeployIntent | null;
  selected_endpoints: OnboardingEndpoint[];
  onboarding_completed_at: string | null;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  rate_limit: number;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  profile_id: string | null;
}
