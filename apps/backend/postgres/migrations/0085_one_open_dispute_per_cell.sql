-- One OPEN dispute per day+component — not one ever.
--
-- `payment_voucher_dispute_one_per_day_component` was UNIQUE on
-- (voucher_id, dispute_date, component) with no WHERE clause, so the FIRST
-- claim on a cell locked it permanently. Once the agency had answered it, the
-- PR could never contest that cell again: the sheet opened, they filled it in,
-- and the submit came back 409 "drinks on 2026-08-04 has already been disputed".
--
-- That makes a settled claim final by accident rather than by rule. If the
-- agency's correction is itself wrong — they fixed the wrong shift, or accepted
-- the claim and changed nothing — the PR has no route back, and the money stays
-- wrong because the argument slot was already spent.
--
-- The rule actually wanted is "do not argue about the same thing twice AT THE
-- SAME TIME", which is a partial index. An open claim still blocks a second one,
-- so a double tap cannot create two rows; an answered claim blocks nothing.
--
-- Strictly WEAKER than the index it replaces, so no existing row can violate
-- it: anything unique across all rows is unique across the open ones.

DROP INDEX IF EXISTS "main"."payment_voucher_dispute_one_per_day_component";

CREATE UNIQUE INDEX IF NOT EXISTS "payment_voucher_dispute_one_open_per_day_component"
  ON "main"."payment_voucher_dispute" ("voucher_id", "dispute_date", "component")
  WHERE "outcome" IS NULL;
