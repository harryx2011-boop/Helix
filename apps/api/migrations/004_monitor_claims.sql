-- Monitor claims carry a timestamp.
--
-- A claim is `next_check_at = NULL`. Without knowing when it was taken, a
-- second API process starting up cannot tell a crashed check from one that is
-- running right now, and re-arms both. `claimed_at` lets it release only the
-- claims old enough to be dead.

ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
