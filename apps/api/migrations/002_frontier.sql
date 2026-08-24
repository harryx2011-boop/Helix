-- Frontier persistence and incremental crawl.
--
-- 001 shipped a `job_tasks` table but the worker kept its queue in memory, so a
-- restart mid-crawl lost the frontier and began again. These changes make the
-- queue durable and let a re-crawl skip pages that have not changed.

-- The frontier needs the depth and the politeness partition alongside the URL,
-- so a resuming worker can rebuild its state without re-deriving them.
ALTER TABLE job_tasks ADD COLUMN IF NOT EXISTS site text;
ALTER TABLE job_tasks ADD COLUMN IF NOT EXISTS discovered_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS job_tasks_site ON job_tasks (job_id, site, status);

-- Rejections are counted per job so "crawled 12 pages" can be qualified with
-- "and turned away 4,000 as off-site". A silent cap reads as full coverage.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS rejections jsonb NOT NULL DEFAULT '{}';

-- Incremental crawl compares against the previous visit. `etag` and
-- `last_modified` come from response headers; `content_hash` is the fallback
-- when a server sends neither, which is common.
ALTER TABLE crawl_state ADD COLUMN IF NOT EXISTS status_code integer;
ALTER TABLE crawl_state ADD COLUMN IF NOT EXISTS unchanged_streak integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS crawl_state_hash ON crawl_state (site, content_hash);
