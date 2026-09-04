-- Crawl task leases.
--
-- 002 made the frontier durable, but a claim was only half a lease. A worker
-- that exits cleanly calls `release()` and returns its claims to the queue; a
-- worker that is SIGKILLed, OOM-killed or loses its container does not, and
-- those rows sit at 'running' with a `claimed_at` nobody ever reads again. The
-- crawl then finishes reporting fewer pages than it queued, with no failure row
-- to explain the difference — the worst shape a bug can take here, because it
-- looks like a completed crawl.
--
-- A lease is a claim with an expiry. `lease_expires_at` is set when a task is
-- claimed and extended while the worker still holds it; any task whose lease is
-- in the past is reclaimable by any worker, whether or not the process that
-- took it still exists. That is the difference between an 'in_progress' flag
-- and a visibility timeout: the flag needs someone to clear it, the timeout
-- clears itself.
--
-- `attempts` already existed and was only ever incremented on failure. Reclaim
-- increments it too, so a URL that repeatedly kills its worker is visible as a
-- task with rising attempts rather than an invisible retry loop.
--
-- Rollback:
--   DROP INDEX IF EXISTS job_tasks_reclaimable;
--   ALTER TABLE job_tasks DROP COLUMN IF EXISTS lease_expires_at;
--   ALTER TABLE job_tasks DROP COLUMN IF EXISTS max_attempts;
-- Nothing else reads either column; the worker falls back to the pre-lease
-- behaviour, which loses interrupted tasks exactly as it did before.

ALTER TABLE job_tasks ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

-- Bounded here rather than in code so a reclaim loop cannot outlive a migration
-- that changes its mind. A task reclaimed this many times is recorded as failed
-- instead of being handed to a fourth worker to kill.
ALTER TABLE job_tasks ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3;

-- The partial index carries the whole reclaim query: running tasks are a small
-- fraction of a large crawl, and a full scan of job_tasks per sweep would make
-- the reclaim more expensive than the work it recovers.
CREATE INDEX IF NOT EXISTS job_tasks_reclaimable
  ON job_tasks (lease_expires_at)
  WHERE status = 'running';
