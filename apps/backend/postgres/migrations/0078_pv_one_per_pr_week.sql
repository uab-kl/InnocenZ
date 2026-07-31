-- One payment voucher per PR per week — enforced by the DATABASE, not by code.
--
-- The code already refuses a second voucher: `getOrCreateCurrentWeekDraft` now
-- checks every status (it used to look only for a `pending_review` draft, so a
-- week already `sent` was invisible and the next self-log silently minted a
-- second voucher), and the agency create/update path gained `existsForPrWeek`.
-- Both are correct and neither is sufficient. A rule that lives only in
-- application code is one forgotten INSERT away from being no rule at all — and
-- this particular rule had already failed: PV-000002 (sent, RM1,581.48) and
-- PV-000004 (pending_review, RM703.60) both existed for the same PR and the same
-- week, which is a double payment waiting to be made.
--
-- PARTIAL, because `pr_id` and `week_start` are both NULLABLE on this table.
-- Postgres already treats NULLs as distinct in a unique index, so the WHERE
-- clause changes no behaviour — it is here to state the intent out loud: an
-- unassigned or weekless voucher is a different kind of row and is deliberately
-- not constrained. Reading the index should not require knowing the NULL rule.
--
-- Deliberately NOT keyed on agency_id as well. A PR belongs to one agency, so
-- adding it would widen the key and let the same PR hold two vouchers for one
-- week under two agencies — the exact thing being prevented.
--
-- Hand-written and idempotent for the same reason as 0072/0074/0075: drizzle-kit
-- generate aborts on a pre-existing parent-snapshot collision across 0065-0070.

-- Fail LOUDLY and usefully if duplicates still exist. Without this, index
-- creation fails with a generic "could not create unique index" naming one key
-- value, and the operator has to go digging for which vouchers collided. On a
-- shared database that dig happens under time pressure, so the message names
-- them up front. This is also why any cleanup must run BEFORE this migration.
DO $$
DECLARE
  dupes text;
BEGIN
  SELECT string_agg(detail, '; ') INTO dupes
  FROM (
    SELECT "pr_id" || ' week ' || "week_start" || ' -> ' ||
           string_agg(coalesce("voucher_no", "id"::text), ', ' ORDER BY "created_at") AS detail
    FROM "main"."payment_voucher"
    WHERE "pr_id" IS NOT NULL AND "week_start" IS NOT NULL
    GROUP BY "pr_id", "week_start"
    HAVING count(*) > 1
  ) d;

  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot enforce one-voucher-per-PR-per-week: duplicates exist. %', dupes
      USING HINT = 'Resolve each pair first (for real payroll: void + reissue, PR notified), then re-run.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "payment_voucher_one_per_pr_week"
  ON "main"."payment_voucher" ("pr_id", "week_start")
  WHERE "pr_id" IS NOT NULL AND "week_start" IS NOT NULL;
