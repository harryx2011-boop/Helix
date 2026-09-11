-- Crawl job leases.
--
-- 010 gave `job_tasks` a visibility timeout, and it works: a worker that is
-- SIGKILLed leaves its tasks reclaimable, and `reclaimExpired` returns them to
-- the queue on the next sweep. The parent `jobs` row never got the same
-- treatment. It is flipped to 'running' when claimed and reset only on the
-- graceful shutdown path, so a hard kill leaves the job at 'running' with no
-- process behind it.
--
-- That is worse than the task-level bug 010 fixed, because both escapes are
-- closed at once: `#claimJob` selects `status = 'queued'`, so no worker will
-- ever pick the job up again, and `POST /crawl {resume}` refuses it with
-- `already_running` precisely because it is 'running'. The documented recovery
-- path is shut against the exact failure it exists for. The tasks are
-- reclaimable and nothing is left to claim them; the crawl polls as 'running'
-- with `started_at` set, forever, and no failure row explains it.
--
-- Same remedy as 010, one level up: a claim becomes a lease. `lease_expires_at`
-- is set when a job is claimed and extended while the worker still holds it.
-- A job whose lease is in the past is claimable by any worker, whether or not
-- the process that took it still exists — a timeout clears itself, a flag needs
-- someone alive to clear it.
--
-- No `max_attempts` counterpart here. A poison URL kills a task and 010 already
-- bounds that; a job is only ever reclaimed because its worker died, and
-- capping job reclaims would strand long crawls on an unlucky restart.
--
-- Rollback:
--   DROP INDEX IF EXISTS jobs_reclaimable;
--   ALTER TABLE jobs DROP COLUMN IF EXISTS lease_expires_at;
-- The claim predicate falls back to 'queued'-only, which loses interrupted
-- jobs exactly as it did before.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

-- Mirrors job_tasks_reclaimable: running jobs are a small fraction of the
-- table, and a full scan per claim would cost more than the work it recovers.
CREATE INDEX IF NOT EXISTS jobs_reclaimable
  ON jobs (lease_expires_at)
  WHERE status = 'running';
