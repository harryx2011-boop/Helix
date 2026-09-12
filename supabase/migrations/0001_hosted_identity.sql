-- Hosted identity on top of the API's own schema.
--
-- ONE DATABASE. The hosted Helix API runs apps/api/migrations/*.sql against
-- this Supabase project at boot, so `api_keys` here IS the table the API
-- authenticates against. The dashboard mints a key by inserting the same
-- sha256 row the API would, and the key is valid on the next request — no
-- mirror, no `/internal/keys` sync, no second copy of anything.
--
-- The 2026-08-29 removal of Supabase was about duplication: the hosted half
-- kept its own profiles, api_keys, runs and usage beside the instance's. This
-- file adds exactly one thing the API does not know about — who owns a key —
-- and nothing the instance already records.
--
-- Requires the API migrations to have run first (api_keys, jobs, monitors).

do $$ begin
  if to_regclass('public.api_keys') is null then
    raise exception 'api_keys is missing: run apps/api/migrations first (or apply supabase/schema.sql to a fresh project)';
  end if;
end $$;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
--
-- Identity lives in Clerk. This row exists so that keys can reference a stable
-- uuid rather than a Clerk id string, and so a user deleted in Clerk cascades
-- everything they owned.

create table if not exists profiles (
  id             uuid primary key default gen_random_uuid(),
  clerk_user_id  text unique not null,
  email          text not null,
  name           text,
  avatar_url     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists profiles_touch on profiles;
create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------- key ownership

alter table api_keys add column if not exists profile_id uuid references profiles(id) on delete cascade;
create index if not exists api_keys_profile_idx on api_keys (profile_id) where revoked_at is null;

-- ---------------------------------------------------------------- Clerk claim
--
-- Clerk is configured as a third-party auth provider on the Supabase project,
-- so a Clerk session token presented to PostgREST lands here as
-- request.jwt.claims with the Clerk user id in `sub`. `nullif` guards the
-- empty-string setting PostgREST uses on some unauthenticated requests, which
-- would otherwise raise on the jsonb cast instead of matching nothing.

create or replace function current_clerk_user_id() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    ''
  )
$$;

create or replace function current_profile_id() returns uuid
language sql stable as $$
  select id from profiles where clerk_user_id = current_clerk_user_id()
$$;

-- ---------------------------------------------------------------- RLS
--
-- Every table in `public` is reachable through the Data API once the
-- anon/authenticated roles hold grants, so RLS is on for all of them. The API
-- connects as the table owner and is unaffected. Policies exist only where a
-- signed-in browser should read directly; everything else stays server-only.

alter table profiles enable row level security;
alter table api_keys enable row level security;
alter table jobs enable row level security;
alter table job_tasks enable row level security;
alter table documents enable row level security;
alter table fetch_failures enable row level security;
alter table crawl_state enable row level security;
alter table monitors enable row level security;
alter table monitor_snapshots enable row level security;
alter table monitor_checks enable row level security;
alter table webhook_deliveries enable row level security;
alter table enrich_results enable row level security;
alter table provider_keys enable row level security;
alter table instance_settings enable row level security;
alter table encryption_key_versions enable row level security;
alter table schema_migrations enable row level security;
do $$ begin
  if to_regclass('public.chunks') is not null then
    execute 'alter table chunks enable row level security';
  end if;
end $$;

drop policy if exists profiles_select_self on profiles;
create policy profiles_select_self on profiles for select
  to authenticated using (clerk_user_id = current_clerk_user_id());

drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles for update
  to authenticated
  using (clerk_user_id = current_clerk_user_id())
  with check (clerk_user_id = current_clerk_user_id());

-- Keys are listed directly; they are minted and revoked by the server route,
-- which is the only place the plaintext ever exists.
drop policy if exists api_keys_select_own on api_keys;
create policy api_keys_select_own on api_keys for select
  to authenticated using (profile_id = current_profile_id());

drop policy if exists jobs_select_own on jobs;
create policy jobs_select_own on jobs for select
  to authenticated using (
    api_key_id in (select id from api_keys where profile_id = current_profile_id())
  );

drop policy if exists monitors_select_own on monitors;
create policy monitors_select_own on monitors for select
  to authenticated using (
    api_key_id in (select id from api_keys where profile_id = current_profile_id())
  );

-- The hash column must never reach a browser, even the key owner's. A
-- column-level REVOKE is a no-op while the table-level grant Supabase's default
-- privileges hand out still stands, so the table grant goes and the readable
-- columns come back one by one.
revoke all on api_keys from anon, authenticated;
grant select (id, name, key_prefix, rate_limit, profile_id, created_at, last_used_at, revoked_at)
  on api_keys to authenticated;
