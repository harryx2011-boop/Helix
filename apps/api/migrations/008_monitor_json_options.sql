-- Field-level JSON diffs on the check path.
--
-- `json_options` mirrors /scrape's jsonOptions: a schema (and optional
-- prompt/provider/model) that a changed page's markdown is run through via
-- helix-extract /structured, before and after, so the check can report which
-- fields changed rather than a text diff of serialized JSON. Null means the
-- monitor never asks for structured extraction and only text diffs run.
--
-- Rollback: `ALTER TABLE monitors DROP COLUMN IF EXISTS json_options;` --
-- existing monitors have none set, so this is safe to add and remove without
-- touching data outside the new column.

ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS json_options jsonb;
