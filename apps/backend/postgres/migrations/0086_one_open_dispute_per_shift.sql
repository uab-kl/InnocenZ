-- A dispute is about ONE SHIFT's drinks or tips — so the open-claim key is the
-- shift, not the day.
--
-- 0085 made the uniqueness partial (one OPEN claim per voucher+day+component),
-- which fixed "a settled cell can never be disputed again". It still assumed a
-- claim addressed a DAY. It does not: the rule is that a dispute is made against
-- that shift's drinks, or that shift's tips.
--
-- A PR working two shifts on one night could therefore contest the first shift's
-- drinks and then be REFUSED on the second with "drinks on 2026-08-04 has
-- already been disputed" — two different papers, two different figures, one
-- argument slot between them. The second shift's money had no route to being
-- questioned until the first claim was answered.
--
-- The key now includes the receipt the claim NAMES. Since the picker became
-- single-select, `receipt_refs` holds exactly one receipt number, so `->>0` is
-- that shift. A claim naming nothing (every row raised before the picker) keys
-- on '', so at most one whole-day claim can be open — the old behaviour, kept
-- for the rows that still rely on it.
--
-- Still exactly one OPEN claim per shift per bucket, so a double tap cannot
-- create two rows. Strictly weaker than 0085's index, so no existing row can
-- violate it.

DROP INDEX IF EXISTS "main"."payment_voucher_dispute_one_open_per_day_component";

CREATE UNIQUE INDEX IF NOT EXISTS "payment_voucher_dispute_one_open_per_shift_component"
  ON "main"."payment_voucher_dispute" (
    "voucher_id",
    "dispute_date",
    "component",
    (coalesce("receipt_refs"->>0, ''))
  )
  WHERE "outcome" IS NULL;
