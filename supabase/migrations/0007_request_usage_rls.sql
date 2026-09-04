-- RLS for request_usage (apps/api/migrations/011_request_usage.sql).
--
-- 0001 turned row level security on for every table in `public` and explained
-- why: once the anon/authenticated roles hold Supabase's default grants, every
-- table is reachable through the Data API. A table added by a later API
-- migration is not covered by that statement, so it arrives readable by any
-- signed-in browser — and request_usage is a per-key traffic log, which is
-- exactly the kind of thing that should not be.
--
-- No policy is added. The dashboard reads this table through the service-role
-- client in app/api/app/usage/route.ts, which bypasses RLS; a browser has no
-- business querying it directly, and RLS with no policy denies everything.
-- That is the intended posture, not an omission.
--
-- Requires 011 to have run. The API applies its own migrations against this
-- database at boot, so a deployment that has not restarted the API yet will
-- not have the table: the guard below skips rather than failing the whole
-- migration, and the next run picks it up.
--
-- Rollback:
--   ALTER TABLE request_usage DISABLE ROW LEVEL SECURITY;
--   -- and re-grant only if something other than the service role needs it.

do $$ begin
  if to_regclass('public.request_usage') is not null then
    execute 'alter table request_usage enable row level security';
    execute 'revoke all on request_usage from anon, authenticated';
  end if;
end $$;
