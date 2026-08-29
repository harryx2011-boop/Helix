-- `current_clerk_user_id()` cast `request.jwt.claims` straight to jsonb. When
-- that setting is present but empty — PostgREST sets it to '' on some
-- unauthenticated requests — the cast raises rather than returning no rows, so
-- a signed-out caller got an error where RLS should simply have matched
-- nothing. `nullif` makes the empty case behave like the unset one.
create or replace function current_clerk_user_id() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    ''
  )
$$;
