-- Close the Supabase Data API surface.
--
-- Supabase grants `anon` and `authenticated` full DML on every table in
-- `public` by default, and PostgREST exposes them at /rest/v1 to anyone holding
-- the publishable key — which ships in the browser bundle and is not a secret.
-- RLS is what makes that grant inert: a table with RLS on and no policy denies
-- everything, which is why most of this schema was already safe.
--
-- Two tables were not. `request_usage` (011) and `uptime_samples` (009) are
-- created by the API's own migration runner, which has no reason to know about
-- Supabase's roles, so they were created with RLS off. Verified against the live
-- project on 2026-09-04: both were readable with the publishable key, and an
-- anonymous INSERT into `uptime_samples` was refused only by a not-null
-- constraint (23502) rather than by any permission check — an authorized write
-- that would have poisoned the public status page.
--
-- This migration governs the browser surface only. It does NOT constrain the
-- API, which connects as `postgres` and holds BYPASSRLS; the /v1/* tenant
-- boundary is enforced in application code (HELIX_MULTI_TENANT, 1.11.0). Making
-- RLS bind the API needs a non-BYPASSRLS role and a per-request transaction
-- scope, which is a separate and much larger change.
--
-- Rollback: `alter table <t> disable row level security;` per table below, and
-- drop the two policies. Nothing here changes data.

-- ---------------------------------------------------------------- deny by default

alter table request_usage  enable row level security;
alter table uptime_samples enable row level security;

-- REVOKE rather than rely on RLS alone. Defence in depth: a policy added later
-- for an unrelated reason should not silently re-open write access, and a grant
-- nobody uses is a grant nobody audits. The API is unaffected — it is the table
-- owner and does not consult these grants.
revoke all on request_usage  from anon, authenticated;
revoke all on uptime_samples from anon, authenticated;

-- ---------------------------------------------------------------- the status page

-- `/status` is public and reads uptime history through the API, not through
-- PostgREST, so no browser role needs access. Left with no policy: RLS on plus
-- no policy denies every role that does not bypass it.

-- ---------------------------------------------------------------- force

-- FORCE makes a table's owner subject to its own policies. It does NOT affect a
-- BYPASSRLS role, so this does not constrain the API today; it is here so that
-- pointing the API at a non-BYPASSRLS role later is a connection-string change
-- rather than another migration. Applied only to the two tables above, because
-- forcing it on tables the API writes through owner privilege would break them
-- the moment that role changes.
alter table request_usage  force row level security;
alter table uptime_samples force row level security;
