/** Row types for supabase/migrations/0001_hosted_app.sql. Hand-written; regenerate with `supabase gen types` once the project exists. */

export type Endpoint = 'scrape' | 'parse' | 'map' | 'search' | 'crawl' | 'interact' | 'monitor';
export type RunStatus = 'success' | 'failure' | 'running' | 'cancelled';

export interface ProfileRow {
  id: string;
  clerk_user_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: string | null;
  use_cases: string[];
  llm_provider: string | null;
  deploy_intent: string | null;
  selected_endpoints: Endpoint[];
  onboarding_completed_at: string | null;
  monthly_budget_usd: number | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyRow {
  id: string;
  profile_id: string;
  name: string;
  prefix: string;
  last3: string;
  key_hash: string;
  key_ciphertext: string;
  key_iv: string;
  rate_limit_per_min: number | null;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface InstanceRow {
  id: string;
  profile_id: string;
  name: string;
  base_url: string;
  key_ciphertext: string | null;
  key_iv: string | null;
  last_health: Record<string, unknown> | null;
  last_checked_at: string | null;
  created_at: string;
}

export interface RunRow {
  id: string;
  profile_id: string;
  api_key_id: string | null;
  instance_id: string | null;
  endpoint: Endpoint;
  status: RunStatus;
  started_at: string;
  duration_ms: number | null;
  tier_resolved: string | null;
  formats: string[];
  est_provider_cost_usd: number;
  tokens_in: number | null;
  tokens_out: number | null;
  provider: string | null;
  model: string | null;
  request: Record<string, unknown> | null;
  response_ref: string | null;
  failure_reason: string | null;
  job_id: string | null;
}

export interface UsageDailyRow {
  profile_id: string;
  day: string;
  endpoint: Endpoint;
  requests: number;
  failures: number;
  est_provider_cost_usd: number;
}

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      api_keys: Table<ApiKeyRow>;
      instances: Table<InstanceRow>;
      runs: Table<RunRow>;
      usage_daily: Table<UsageDailyRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
