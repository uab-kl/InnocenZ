-- Repairs live drift, not a design change.
--
-- 0051 declares payment_voucher_dispute.component as
-- "main"."payment_voucher_dispute_component" (wages | drinks | tips | others),
-- and the drizzle model and snapshot both agree. The LIVE column was created as
-- "main"."payment_voucher_component" (wages | drink_commission | tip_commission
-- | ot | deduction | other) — the voucher-LINE vocabulary, which is a different
-- thing on purpose: the PR app disputes in receipt kinds, the ledger
-- distinguishes overtime and deductions.
--
-- Nothing caught it. tsc reads the model, and drizzle-kit generate diffs the
-- model against the SNAPSHOT, never the database — so both stayed green while
-- any dispute for drinks/tips/others would have failed at runtime with
-- "invalid input value for enum". Only 'wages' worked, by coincidence of
-- appearing in both enums.
--
-- Safe to retype: payment_voucher_dispute has 0 rows, so no value is converted
-- or lost. The USING clause is required because Postgres will not cast between
-- two enum types implicitly; via text is the standard route.
ALTER TABLE "main"."payment_voucher_dispute"
  ALTER COLUMN "component" TYPE "main"."payment_voucher_dispute_component"
  USING "component"::text::"main"."payment_voucher_dispute_component";
