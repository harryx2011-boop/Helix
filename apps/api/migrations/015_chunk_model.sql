-- The embedding model each stored chunk was made with.
--
-- `/vectors/search` embeds the query and compares it against stored vectors.
-- Two models place text in unrelated spaces, so a query embedded with one and
-- scored against chunks from another returns confident nonsense. Recording the
-- model beside each chunk lets the search refuse that instead. Rows written
-- before this carry NULL: the search asks the caller to name their model.
--
-- The chunks table exists only where the vector extension does (001), so the
-- columns are added under the same guard.
--
-- Rollback:
--   ALTER TABLE chunks DROP COLUMN IF EXISTS model;
--   ALTER TABLE chunks DROP COLUMN IF EXISTS dimensions;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chunks') THEN
    ALTER TABLE chunks ADD COLUMN IF NOT EXISTS model text;
    ALTER TABLE chunks ADD COLUMN IF NOT EXISTS dimensions integer;
  END IF;
END $$;
