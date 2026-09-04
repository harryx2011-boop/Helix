-- Per-key request usage, rolled up by hour.
--
-- Nothing recorded before this file could answer "how many requests did this
-- key make". `jobs` is written by exactly two routes (crawl and batch_scrape);
-- scrape, parse, search, map, metadata and interact are synchronous and record
-- nothing at all, so a count derived from `jobs` would under-report by most of
-- the product and look like a working chart while doing it. `last_used_at` on
-- api_keys is a single timestamp with no history behind it, and the rate
-- limiter's buckets are in-memory and per-process — they vanish on restart and
-- disagree between nodes.
--
-- Hourly buckets rather than a row per request: a row per request is unbounded
-- write amplification on the hot path for a number nobody reads at that
-- resolution, and it would need its own retention job. One UPSERT per key per
-- endpoint per status-class per hour keeps the table small enough that the
-- dashboard's range queries stay index-only.
--
-- `bucket_start` is truncated to the hour in UTC by the writer, so the primary
-- key doubles as the upsert conflict target and no separate unique index is
-- needed.
--
-- Rollback:
--   DROP TABLE IF EXISTS request_usage;
-- The recorder tolerates its own table being absent (it is fire-and-forget and
-- swallows errors), so dropping this leaves the API serving traffic exactly as
-- it did before, with the usage endpoint reporting unavailable.

CREATE TABLE IF NOT EXISTS request_usage (
  api_key_id   uuid        NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  bucket_start timestamptz NOT NULL,
  -- The route family, not the raw path: `/v1/scrape` and `/v1/jobs/:id` are
  -- products, `/v1/jobs/9f3c…` is cardinality. Normalised by the recorder.
  endpoint     text        NOT NULL,
  -- 2xx | 4xx | 429 | 5xx. 429 is split out of 4xx because "am I being rate
  -- limited" is the question the headroom panel exists to answer, and it is
  -- invisible once it is averaged into client errors.
  status_class text        NOT NULL,
  requests     bigint      NOT NULL DEFAULT 0,
  PRIMARY KEY (api_key_id, bucket_start, endpoint, status_class)
);

-- The dashboard's only query shape: one key, a time range, grouped. Leading
-- api_key_id then bucket_start means the range scan touches only that key's
-- rows rather than every key's hour.
CREATE INDEX IF NOT EXISTS request_usage_key_time
  ON request_usage (api_key_id, bucket_start DESC);

-- Retention. Ninety days of hourly buckets is ~2k rows per key per endpoint
-- family and bounds the table without a separate job: the sweep runs from the
-- same place the crawl expiry sweep does.
CREATE INDEX IF NOT EXISTS request_usage_expiry
  ON request_usage (bucket_start);
