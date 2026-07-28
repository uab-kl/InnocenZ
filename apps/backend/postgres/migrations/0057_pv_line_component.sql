-- Closes an out-of-band schema change: `payment_voucher_line.component` and its
-- enum exist on the live DB (21 rows already classified) but were created by no
-- migration, so a fresh database would lack both and the repository-layer writer
-- in payment-voucher-component.ts would fail on insert.
--
-- 0051 created `payment_voucher_dispute_component`; that is a DIFFERENT type with
-- different labels. This one is the voucher-LINE bucket.
--
-- Both statements are guarded: against live this migration is a no-op that simply
-- records its ledger row, and against a fresh DB it creates the real objects.
DO $$ BEGIN
  CREATE TYPE "main"."payment_voucher_component" AS ENUM('wages', 'drink_commission', 'tip_commission', 'ot', 'deduction', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "main"."payment_voucher_line" ADD COLUMN IF NOT EXISTS "component" "main"."payment_voucher_component";
