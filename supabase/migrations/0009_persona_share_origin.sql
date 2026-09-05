-- Persona shares record their origin by slug, the way forks do since 0004.
--
-- Persona's catalog is markdown on disk, so a share created from the editor
-- has no catalog uuid to point `persona_id` at. The recipient's "Fork this"
-- needs the role and persona slugs plus the source version to build a fork
-- the sidebar and the version chip can render. All three are nullable so
-- rows written before this migration still resolve.

alter table persona_shares add column if not exists role_slug      text;
alter table persona_shares add column if not exists persona_slug   text;
alter table persona_shares add column if not exists source_version integer;
