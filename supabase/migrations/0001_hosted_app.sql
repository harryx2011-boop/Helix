-- Hosted app data: users, API keys, instances, runs, daily usage.
-- Identity lives in Clerk; profiles.clerk_user_id is the join key.

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique not null,
  email text not null,
  name text,
  avatar_url text,
  role text,
  use_cases text[] not null default '{}',
  llm_provider text,
  deploy_intent text,
  selected_endpoints text[] not null default '{}',
  onboarding_completed_at timestamptz,
  monthly_budget_usd numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  prefix text not null,
  last3 text not null,
  key_hash text unique not null,
  key_ciphertext bytea not null,
  key_iv bytea not null,
  rate_limit_per_min integer,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists api_keys_profile_idx on api_keys(profile_id) where revoked_at is null;

create table if not exists instances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  base_url text not null,
  key_ciphertext bytea,
  key_iv bytea,
  last_health jsonb,
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists instances_profile_idx on instances(profile_id);

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  api_key_id uuid references api_keys(id) on delete set null,
  instance_id uuid references instances(id) on delete set null,
  endpoint text not null check (endpoint in ('scrape','parse','map','search','crawl','interact','monitor')),
  status text not null check (status in ('success','failure','running','cancelled')),
  started_at timestamptz not null default now(),
  duration_ms integer,
  tier_resolved text,
  formats text[] not null default '{}',
  est_provider_cost_usd numeric(12,6) not null default 0,
  tokens_in integer,
  tokens_out integer,
  provider text,
  model text,
  request jsonb,
  response_ref text,
  failure_reason text,
  job_id text
);
create index if not exists runs_profile_started_idx on runs(profile_id, started_at desc);
create index if not exists runs_profile_endpoint_idx on runs(profile_id, endpoint);

create table if not exists usage_daily (
  profile_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  endpoint text not null,
  requests integer not null default 0,
  failures integer not null default 0,
  est_provider_cost_usd numeric(12,6) not null default 0,
  primary key (profile_id, day, endpoint)
);

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists profiles_touch on profiles;
create trigger profiles_touch before update on profiles for each row execute function touch_updated_at();

-- Roll a finished run into usage_daily.
create or replace function bump_usage_daily() returns trigger language plpgsql as $$
begin
  if new.status in ('success','failure') then
    insert into usage_daily (profile_id, day, endpoint, requests, failures, est_provider_cost_usd)
    values (new.profile_id, (new.started_at at time zone 'utc')::date, new.endpoint, 1,
            case when new.status = 'failure' then 1 else 0 end, new.est_provider_cost_usd)
    on conflict (profile_id, day, endpoint) do update set
      requests = usage_daily.requests + 1,
      failures = usage_daily.failures + (case when new.status = 'failure' then 1 else 0 end),
      est_provider_cost_usd = usage_daily.est_provider_cost_usd + new.est_provider_cost_usd;
  end if;
  return new;
end $$;
drop trigger if exists runs_bump_usage on runs;
create trigger runs_bump_usage after insert on runs for each row execute function bump_usage_daily();

-- RLS: the app's server routes use the service role; these policies cover
-- any future direct client access keyed by the Clerk JWT's sub claim.
alter table profiles enable row level security;
alter table api_keys enable row level security;
alter table instances enable row level security;
alter table runs enable row level security;
alter table usage_daily enable row level security;

create or replace function current_clerk_user_id() returns text language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')
$$;

create policy profiles_self on profiles for all
  using (clerk_user_id = current_clerk_user_id());
create policy api_keys_self on api_keys for all
  using (profile_id in (select id from profiles where clerk_user_id = current_clerk_user_id()));
create policy instances_self on instances for all
  using (profile_id in (select id from profiles where clerk_user_id = current_clerk_user_id()));
create policy runs_self on runs for all
  using (profile_id in (select id from profiles where clerk_user_id = current_clerk_user_id()));
create policy usage_daily_self on usage_daily for select
  using (profile_id in (select id from profiles where clerk_user_id = current_clerk_user_id()));
