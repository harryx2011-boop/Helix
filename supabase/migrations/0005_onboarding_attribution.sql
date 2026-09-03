-- Where the user heard about Helix, asked during onboarding.
--
-- A closed vocabulary like the other single-selects, plus one free-text field
-- that is ONLY read when the answer is 'other'. Two columns rather than one
-- because a free-text column that sometimes holds a vocabulary value and
-- sometimes holds prose cannot be grouped without cleaning it first, and the
-- entire point of asking is to count the answers.

alter table profiles add column if not exists heard_from        text;
alter table profiles add column if not exists heard_from_detail text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_heard_from_check') then
    alter table profiles add constraint profiles_heard_from_check
      check (heard_from is null or heard_from in (
        'search', 'social', 'friend', 'hn', 'github', 'blog', 'ai_assistant', 'other'
      ));
  end if;

  -- The detail is a note on 'other', never a second answer. Bounding it here
  -- keeps a paste-bomb out of the column, and pinning it to 'other' stops the
  -- free text from quietly becoming the real answer for a categorised row —
  -- which would put the count and the prose out of step.
  if not exists (select 1 from pg_constraint where conname = 'profiles_heard_from_detail_check') then
    alter table profiles add constraint profiles_heard_from_detail_check
      check (
        heard_from_detail is null
        or (heard_from = 'other' and char_length(heard_from_detail) <= 200)
      );
  end if;
end $$;
