-- GitHub App connections: a per-user OAuth grant, separate from the GitHub
-- identity Clerk holds when someone signs in with GitHub.
--
-- WHY A SEPARATE TABLE rather than widening `provider_keys`. That table lives
-- in the API's own Postgres, is keyed on `api_key_id`, and its `provider`
-- column is CHECK-constrained to the four LLM vendors. A GitHub grant is a
-- different thing on all three counts: it belongs to a PERSON rather than to
-- one of their API keys, it carries an expiry and a scope set, and it is
-- refreshed rather than replaced. Widening the CHECK would put two unrelated
-- lifecycles in one row shape.
--
-- WHY NOT REUSE THE CLERK SIGN-IN TOKEN. Clerk holds a GitHub OAuth token for
-- users who signed in with GitHub, but its scopes are the ones sign-in asked
-- for, and users who signed in with Google or email have none at all. A
-- separate grant means every user can connect, and the scopes are ours.
--
-- The token is stored the same way `api_keys` stores its plaintext: AES-256-GCM
-- ciphertext plus IV, never a readable column. `token_last4` exists only so the
-- UI can show which credential is held without decrypting one.

create table if not exists github_connections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  -- The GitHub account the grant belongs to, for telling two connections
  -- apart in the UI. Display only; authorization is the token's job.
  github_login text not null,
  github_user_id bigint,
  avatar_url text,
  token_ciphertext bytea not null,
  token_iv bytea not null,
  token_last4 text not null,
  -- Refresh tokens exist only for GitHub Apps with expiring tokens switched
  -- on; a classic OAuth app token does not expire and these stay null.
  refresh_ciphertext bytea,
  refresh_iv bytea,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  -- Off until the user says otherwise. Connecting authorizes Helix to reach
  -- the account; letting a RUN act with it is a second, revocable decision —
  -- the same split the agent's credential handling makes elsewhere.
  agent_may_use boolean not null default false,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One connection per GitHub account per profile. Reconnecting the same account
-- updates the existing row rather than accumulating dead tokens beside it.
create unique index if not exists github_connections_profile_login_idx
  on github_connections(profile_id, github_login);

alter table github_connections enable row level security;

-- Matches the existing per-table policies: server routes use the service role,
-- and this covers any direct client access keyed by the Clerk JWT's sub claim.
drop policy if exists github_connections_self on github_connections;
create policy github_connections_self on github_connections for all
  using (profile_id in (select id from profiles where clerk_user_id = current_clerk_user_id()));

drop trigger if exists github_connections_touch on github_connections;
create trigger github_connections_touch before update on github_connections
  for each row execute function touch_updated_at();
