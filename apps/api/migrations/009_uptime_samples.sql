-- Uptime samples for the public status page.
--
-- One row per service per sampler tick (`src/status/sampler.ts`, every 60s),
-- reusing the same checks `/health` runs so the two never drift. `days`
-- bucketing and `okPct`/`p50Ms` are computed from this table at read time by
-- `GET /status/history`; nothing here is pre-aggregated. 90 days of samples at
-- one row per service per minute is a few million rows at most — small enough
-- that the sampler prunes anything older on every tick rather than needing a
-- separate job.
--
-- Rollback: `DROP TABLE IF EXISTS uptime_samples;` — nothing else reads it.

CREATE TABLE IF NOT EXISTS uptime_samples (
  service text NOT NULL,
  sampled_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  latency_ms integer
);

CREATE INDEX IF NOT EXISTS uptime_samples_service_sampled_at_idx
  ON uptime_samples (service, sampled_at DESC);
