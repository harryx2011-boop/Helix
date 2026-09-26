-- The projection a crawl was made against.
--
-- `/crawl/estimate` computed a figure and threw it away, so a finished job
-- had nothing to be compared with, and recomputing one later would report
-- today's site as though it were the estimate. The worker now projects the
-- crawl when it claims it, before fetching a page, and keeps that projection
-- here. NULL for batch jobs (nothing is discovered), for a resumed crawl
-- (the projection belongs to its first run), and for jobs made before this.
--
-- Rollback:
--   ALTER TABLE jobs DROP COLUMN IF EXISTS estimate;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS estimate jsonb;
