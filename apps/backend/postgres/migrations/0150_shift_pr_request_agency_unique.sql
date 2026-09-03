-- A named-PR request is per (shift, person, AGENCY), and the key must say so.
--
-- 0131 created this table with UNIQUE (shift_id, user_id): one ask per person
-- per shift. That matched the writer at the time, which addressed the request
-- to exactly ONE membership. Since the fan-out (3 Sep 2026) a venue posting to
-- two agencies asks BOTH of the ones holding that PR, so two rows are correct
-- and the old key rejected the second.
--
-- It failed SILENTLY: the insert is `onConflictDoNothing`, so the second row
-- was discarded with no error and the shift kept one arbitrary agency --
-- whichever Postgres wrote first. The symptom was identical to the bug the
-- fan-out had just fixed, which is exactly what made it convincing.
--
-- Strictly widening: every (shift_id, user_id) pair that was legal before is
-- still legal, so no existing row can violate the new key and nothing is lost.
ALTER TABLE main.shift_pr_request
  DROP CONSTRAINT IF EXISTS shift_pr_request_shift_user_unique;

-- Belt and braces: the same name could exist as a bare index rather than a
-- constraint-backed one, in which case the DROP CONSTRAINT above is a no-op.
DROP INDEX IF EXISTS main.shift_pr_request_shift_user_unique;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'main.shift_pr_request'::regclass
      AND conname = 'shift_pr_request_shift_user_agency_unique'
  ) THEN
    ALTER TABLE main.shift_pr_request
      ADD CONSTRAINT shift_pr_request_shift_user_agency_unique
      UNIQUE (shift_id, user_id, agency_id);
  END IF;
END $$;
