-- Monitor: single-URL watches with a check timeline.
--
-- 001 created `monitors`, `monitor_snapshots` and `webhook_deliveries`. This
-- adds what the shipped route needs on top: the sensitivity setting, the last
-- change/error markers, and a per-check row so history can say "checked, not
-- changed" — a timeline of snapshots alone cannot express a quiet check.

ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS sensitivity    text        NOT NULL DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS last_change_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error     text,
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS monitor_checks (
  id           bigserial   PRIMARY KEY,
  monitor_id   uuid        NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  snapshot_id  bigint      REFERENCES monitor_snapshots(id) ON DELETE SET NULL,
  checked_at   timestamptz NOT NULL DEFAULT now(),
  changed      boolean     NOT NULL DEFAULT false,
  reason       text        NOT NULL,   -- first | changed | unchanged | filtered | trigger_not_met | error
  diff         jsonb,
  error        text
);

CREATE INDEX IF NOT EXISTS monitor_checks_timeline ON monitor_checks (monitor_id, checked_at DESC);

-- Monitor deliveries never carry a job id; the dedupe key already scopes them.
ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS response_status integer;
