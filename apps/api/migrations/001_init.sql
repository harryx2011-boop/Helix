-- Helix initial schema.
--
-- Postgres backs everything: API keys, jobs, results, crawl state, monitors and
-- vectors. One datastore means no Redis, no RabbitMQ, and no boot race — which is
-- the single most-cited self-host complaint about comparable tools.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- pgvector is optional: the chunks table below is created only when the extension
-- is available, so a Postgres without it still boots (the pgvector sink reports unavailable).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
  END IF;
END $$;

-- ---------------------------------------------------------------- auth

-- Helix API keys authenticate a caller to this instance. They are unrelated to
-- the operator's LLM/proxy/vector credentials, which live in the environment and
-- never touch the database.
CREATE TABLE api_keys (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         text        NOT NULL,
  key_hash     text        NOT NULL UNIQUE,   -- sha256; the key itself is shown once, at creation
  key_prefix   text        NOT NULL,          -- first 8 chars, for display: hx_a1b2c3d4…
  rate_limit   integer     NOT NULL DEFAULT 1000,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

CREATE INDEX api_keys_active ON api_keys (key_hash) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------- jobs

CREATE TYPE job_type   AS ENUM ('crawl', 'batch_scrape', 'enrich', 'monitor_check');
CREATE TYPE job_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

CREATE TABLE jobs (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_id   uuid        REFERENCES api_keys(id) ON DELETE SET NULL,
  type         job_type    NOT NULL,
  status       job_status  NOT NULL DEFAULT 'queued',
  request      jsonb       NOT NULL,
  total        integer     NOT NULL DEFAULT 0,
  completed    integer     NOT NULL DEFAULT 0,
  failed       integer     NOT NULL DEFAULT 0,
  usage        jsonb       NOT NULL DEFAULT '{}',
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '7 days'
);

CREATE INDEX jobs_status_created ON jobs (status, created_at);
CREATE INDEX jobs_expiry         ON jobs (expires_at);

-- The work queue. Claimed with SELECT … FOR UPDATE SKIP LOCKED, which gives
-- multi-worker safety without a separate broker.
CREATE TABLE job_tasks (
  id            bigserial PRIMARY KEY,
  job_id        uuid        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  url           text        NOT NULL,
  depth         integer     NOT NULL DEFAULT 0,
  status        job_status  NOT NULL DEFAULT 'queued',
  attempts      integer     NOT NULL DEFAULT 0,
  -- hash(normalised url + render params + profile + proxy geo + schema version).
  -- The queue is honestly at-least-once, so side effects must be idempotent.
  idempotency_key text      NOT NULL,
  claimed_at    timestamptz,
  claimed_by    text,
  available_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX job_tasks_claimable ON job_tasks (status, available_at) WHERE status = 'queued';
CREATE INDEX job_tasks_job       ON job_tasks (job_id, status);
CREATE UNIQUE INDEX job_tasks_idem ON job_tasks (job_id, idempotency_key);

-- ---------------------------------------------------------------- results

CREATE TABLE documents (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id       uuid        REFERENCES jobs(id) ON DELETE CASCADE,
  url          text        NOT NULL,
  final_url    text,
  content_hash text        NOT NULL,   -- sha256 of normalised content; drives incremental crawl
  status_code  integer,
  content_type text,
  tier         text        NOT NULL,   -- which fetch tier ultimately succeeded
  profile      text,
  content      jsonb       NOT NULL,   -- markdown, html, json, chunks …
  metadata     jsonb       NOT NULL DEFAULT '{}',
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '7 days'
);

CREATE INDEX documents_job     ON documents (job_id);
CREATE INDEX documents_url     ON documents (url);
CREATE INDEX documents_hash    ON documents (content_hash);
CREATE INDEX documents_expiry  ON documents (expires_at);

-- Typed failures. A bot challenge returning HTTP 200 is recorded here, never as a
-- document — the whole point is that a block page is never mistaken for content.
CREATE TABLE fetch_failures (
  id            bigserial PRIMARY KEY,
  job_id        uuid        REFERENCES jobs(id) ON DELETE CASCADE,
  url           text        NOT NULL,
  reason        text        NOT NULL,   -- blocked | challenge | timeout | dns | tls | http_error | empty | robots_denied
  detail        text,
  status_code   integer,
  detected_by   text[],                 -- which signals fired
  tier          text,
  tiers_tried   text[],
  profile       text,
  escalation_available boolean NOT NULL DEFAULT false,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fetch_failures_job ON fetch_failures (job_id);

-- ---------------------------------------------------------------- crawl state

-- Per-site memory so incremental re-crawls can skip unchanged pages, and so a
-- restart resumes a frontier rather than restarting it.
CREATE TABLE crawl_state (
  id            bigserial PRIMARY KEY,
  site          text        NOT NULL,   -- eTLD+1
  url           text        NOT NULL,
  content_hash  text,
  last_modified timestamptz,
  etag          text,
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX crawl_state_url ON crawl_state (url);
CREATE INDEX crawl_state_site       ON crawl_state (site);

-- ---------------------------------------------------------------- monitors

CREATE TABLE monitors (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_id      uuid        REFERENCES api_keys(id) ON DELETE CASCADE,
  urls            text[]      NOT NULL,
  schedule        jsonb       NOT NULL,
  diff_config     jsonb       NOT NULL DEFAULT '{}',
  trigger_config  jsonb       NOT NULL DEFAULT '{}',
  scrape_options  jsonb       NOT NULL DEFAULT '{}',
  webhook         jsonb,
  status          text        NOT NULL DEFAULT 'active',
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  next_check_at   timestamptz,
  checks          integer     NOT NULL DEFAULT 0,
  changes         integer     NOT NULL DEFAULT 0,
  pages_unchanged integer     NOT NULL DEFAULT 0   -- unchanged pages cost nothing
);

CREATE INDEX monitors_due ON monitors (next_check_at) WHERE status = 'active';

CREATE TABLE monitor_snapshots (
  id           bigserial PRIMARY KEY,
  monitor_id   uuid        NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  url          text        NOT NULL,
  content_hash text        NOT NULL,
  content      text,
  captured_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX monitor_snapshots_lookup ON monitor_snapshots (monitor_id, url, captured_at DESC);

-- ---------------------------------------------------------------- webhooks

-- Stripe-shaped delivery: exponential backoff over days, then a dead letter you
-- can replay. Not three retries over twenty minutes.
CREATE TABLE webhook_deliveries (
  id            bigserial PRIMARY KEY,
  job_id        uuid        REFERENCES jobs(id) ON DELETE CASCADE,
  monitor_id    uuid        REFERENCES monitors(id) ON DELETE CASCADE,
  url           text        NOT NULL,
  event_type    text        NOT NULL,
  payload       jsonb       NOT NULL,
  -- dedupe key: (job, event, url) — the queue is at-least-once
  dedupe_key    text        NOT NULL,
  attempts      integer     NOT NULL DEFAULT 0,
  status        text        NOT NULL DEFAULT 'pending',  -- pending | delivered | dead
  last_error    text,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  delivered_at  timestamptz
);

CREATE UNIQUE INDEX webhook_deliveries_dedupe ON webhook_deliveries (dedupe_key);
CREATE INDEX webhook_deliveries_pending ON webhook_deliveries (next_retry_at) WHERE status = 'pending';

-- ---------------------------------------------------------------- vectors

-- pgvector sink. Point IDs are deterministic (UUID v5 from the URL) so a re-crawl
-- updates in place instead of duplicating vectors.
-- 384 is the default local model's embedding dimension; other dimensions need
-- an ALTER COLUMN embedding TYPE vector(N) after this migration runs.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE $sql$CREATE TABLE chunks (
  id          uuid PRIMARY KEY,
  document_id uuid        REFERENCES documents(id) ON DELETE CASCADE,
  collection  text        NOT NULL DEFAULT 'default',
  url         text        NOT NULL,
  anchor      text        NOT NULL,   -- stable across re-crawls, so citations keep resolving
  text        text        NOT NULL,
  tokens      integer,
  embedding   vector(384),
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
)$sql$;
    EXECUTE $sql$CREATE INDEX chunks_collection ON chunks (collection)$sql$;
    EXECUTE $sql$CREATE INDEX chunks_url        ON chunks (url)$sql$;
    EXECUTE $sql$CREATE INDEX chunks_embedding  ON chunks USING hnsw (embedding vector_cosine_ops)$sql$;
  END IF;
END $$;

-- ---------------------------------------------------------------- enrichment

CREATE TABLE enrich_results (
  id         bigserial PRIMARY KEY,
  job_id     uuid        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  row_index  integer     NOT NULL,
  input      jsonb       NOT NULL,
  -- Each field carries value, confidence, and the passage that grounded it.
  -- A null value carries a reason: no sources, conflicting sources, low confidence.
  fields     jsonb       NOT NULL DEFAULT '{}',
  status     text        NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX enrich_results_job ON enrich_results (job_id, row_index);
