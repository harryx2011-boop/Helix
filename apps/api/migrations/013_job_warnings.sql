-- Job warnings.
--
-- A crawl could finish 'completed' with pages it fetched and never recorded:
-- a task row left 'queued' or 'running', or a result dropped because this
-- worker no longer owned the row. Nothing on the job said so, so a partial
-- crawl read as a whole one. The worker now checks `job_tasks` at finish and
-- names any gap here; a job with nothing recorded and rows left over is
-- 'failed' instead.
--
-- Rollback:
--   ALTER TABLE jobs DROP COLUMN IF EXISTS warnings;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS warnings jsonb NOT NULL DEFAULT '[]';
