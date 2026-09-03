-- Make the Persona tables reachable from the browser's local-first state
-- (PERSONA.md §7, Phase 4). 0002 modelled forks and favourites as if the
-- client already knew catalog UUIDs. It does not: everything Persona stores
-- offline is keyed by SLUG, because the catalog it reads is a directory of
-- markdown files, not the database. Signing in therefore had to translate
-- every local row into a uuid before it could be inserted, and any row whose
-- persona had been renamed or removed was silently unmergeable.
--
-- This migration makes the slug a first-class key so a merge can be a plain
-- upsert, and so a fork survives its source persona being deleted.

-- ------------------------------------------------------------------ forks
--
-- `role_slug` / `persona_slug` are what the editor actually needs to render a
-- fork (its badge, its "back to role" link) and are what localStorage holds.
-- They are kept alongside `persona_id` rather than replacing it: the uuid is
-- the referential link while the catalog still has the row, the slugs are the
-- durable record of where the fork came from once it does not.
alter table persona_forks add column if not exists role_slug    text;
alter table persona_forks add column if not exists persona_slug text;

-- Local forks record the version as an integer (`sourceVersion: 3`), which is
-- what the markdown frontmatter carries. Resolving it to persona_versions.id
-- needs a catalog round trip the browser cannot do offline, so the integer is
-- stored directly and the uuid stays an optional refinement.
alter table persona_forks add column if not exists source_version int;

create index if not exists persona_forks_slug_idx
  on persona_forks (profile_id, role_slug, persona_slug);

-- --------------------------------------------------------------- favourites
--
-- Local favourites are the string "<role>/<persona>". Keying the table on the
-- persona uuid meant a favourite could not be written without a lookup, and
-- cascaded away if the catalog row was reseeded with a new id. The slug pair
-- becomes the identity; persona_id stays as a nullable convenience join.
--
-- Rebuilt rather than altered: the primary key changes, and the table is
-- empty in every environment (Phase 4 is what first writes it).
drop table if exists persona_favorites;

create table persona_favorites (
  profile_id    uuid not null references profiles(id) on delete cascade,
  role_slug     text not null,
  persona_slug  text not null,
  persona_id    uuid references personas(id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (profile_id, role_slug, persona_slug)
);

alter table persona_favorites enable row level security;

drop policy if exists persona_favorites_own on persona_favorites;
create policy persona_favorites_own on persona_favorites for all
  to authenticated
  using (profile_id = current_profile_id())
  with check (profile_id = current_profile_id());

grant select, insert, delete on persona_favorites to authenticated;

-- ----------------------------------------------------------- template values
--
-- 0002 gave this table no touch trigger, so `updated_at` only ever held its
-- insert default and last-write-wins across two devices compared two equal
-- timestamps. The merge resolves conflicts on this column, so it has to move.
drop trigger if exists persona_template_values_touch on persona_template_values;
create trigger persona_template_values_touch before update on persona_template_values
  for each row execute function touch_updated_at();

-- ------------------------------------------------------------------ settings
--
-- Theme, sidebar width and collapse state stay in localStorage: they are
-- per-device UI preferences, and syncing them would make a wide sidebar on a
-- desktop narrow every phone. The wizard's model API key is deliberately NOT
-- stored here either — it is a provider secret, and Persona has no server-side
-- encryption path for it the way apps/api does for provider_keys.
