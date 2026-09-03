-- Onboarding answers on the profile (WEBSITE.md §6.2).
--
-- Five questions, asked once at /onboarding, re-editable later under
-- Settings → Preferences. Four of the five are optional and skippable, so
-- every column is nullable and the arrays default empty rather than null —
-- a skipped step and an unanswered one are the same thing to every reader,
-- and `selected_endpoints` is iterated by the sidebar and the SKILL.md
-- generator, which should not have to null-check before looping.
--
-- `onboarding_completed_at` is the gate: middleware sends a signed-in user
-- with a null here to /onboarding. It is set when step 5 submits, including
-- when every step was skipped, so skipping is a completion and does not trap
-- the user in a loop.

alter table profiles add column if not exists role                text;
alter table profiles add column if not exists use_cases           text[] not null default '{}';
alter table profiles add column if not exists llm_provider        text;
alter table profiles add column if not exists deploy_intent       text;
alter table profiles add column if not exists selected_endpoints  text[] not null default '{}';
alter table profiles add column if not exists onboarding_completed_at timestamptz;

-- The single-select answers are closed vocabularies. Constraining them here
-- means a typo in a client payload fails at the boundary rather than becoming
-- a value the dashboard silently never matches. Null stays legal (skipped).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table profiles add constraint profiles_role_check
      check (role is null or role in ('engineer', 'founder', 'researcher', 'data_ml', 'other'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_llm_provider_check') then
    alter table profiles add constraint profiles_llm_provider_check
      check (llm_provider is null or llm_provider in ('anthropic', 'openai', 'google', 'openrouter', 'local', 'unsure'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_deploy_intent_check') then
    alter table profiles add constraint profiles_deploy_intent_check
      check (deploy_intent is null or deploy_intent in ('hosted', 'self_host', 'both'));
  end if;
end $$;

-- The multi-selects are checked by containment so an unknown element is
-- rejected without pinning the column to a fixed length.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_use_cases_check') then
    alter table profiles add constraint profiles_use_cases_check
      check (use_cases <@ array['agent_tools', 'research_pipeline', 'rag_search', 'monitoring', 'enrichment', 'internal_tooling']::text[]);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_selected_endpoints_check') then
    alter table profiles add constraint profiles_selected_endpoints_check
      check (selected_endpoints <@ array['scrape', 'parse', 'search', 'crawl', 'interact', 'monitor']::text[]);
  end if;
end $$;

-- profiles_update_self (0001) already lets a signed-in browser update its own
-- row, and these columns are inside it. The wizard nonetheless writes through
-- a server action with the service role, because completing onboarding also
-- mints the first API key, which RLS deliberately cannot do.
