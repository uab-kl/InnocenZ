-- 0144 — two naming/width decisions taken while they were still cheap.
--
-- ── 1. `reference` -> `run_no` ──────────────────────────────────────────────
-- `payout_batch.reference` held `PO-000001`, a number WE allocate. That is the
-- same concept as `payment_voucher.voucher_no` holding `PV-000001` — one idea
-- under two names, in one feature, in the same folder. `run_no` matches its
-- neighbour.
--
-- It also collided with the other money subsystem, in the worst way: two
-- columns with one name meaning OPPOSITE things.
--
--   subscription_payment.reference  = "the bank/gateway reference a human can
--                                      match against a statement"  (external)
--   payout_batch.reference          = PO-000001                    (ours)
--
-- What their `reference` means is what our `payout_batch_item.bank_ref` holds.
-- So after this rename the vocabulary lines up across both flows: a *_no column
-- we allocate, and a bank_ref/reference the bank gave us.
--
-- ── 2. provider id widths ───────────────────────────────────────────────────
-- Ours were varchar(40)/(120) against their varchar(50)/(255) for the same
-- concept. Real ids are far shorter (Stripe ~30, Razorpay ~20), so this is a
-- consistency fix rather than a capacity one — but note WHEN a too-long value
-- would bite: the insert recording a provider's payout id happens AFTER the
-- money moved. Postgres throws rather than truncating, so the failure mode is a
-- successful payout with no recorded reference. Cheap to remove entirely.
--
-- Widening a varchar is metadata-only in Postgres — no table rewrite.
--
-- Idempotent throughout: the rename is guarded on the old column still
-- existing, so a re-run against an already-migrated database is a no-op. The
-- shared innocenz-test DB has a second writer.

DO $$ BEGIN
 IF EXISTS (
   SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'main' AND table_name = 'payout_batch'
      AND column_name = 'reference'
 ) AND NOT EXISTS (
   SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'main' AND table_name = 'payout_batch'
      AND column_name = 'run_no'
 ) THEN
   ALTER TABLE "main"."payout_batch" RENAME COLUMN "reference" TO "run_no";
 END IF;
END $$;
--> statement-breakpoint
-- The unique constraint follows the column automatically, but its NAME still
-- says `reference`. Renamed too, so a constraint-violation message names a
-- column that exists.
DO $$ BEGIN
 IF EXISTS (
   SELECT 1 FROM pg_constraint WHERE conname = 'payout_batch_reference_unique'
 ) THEN
   ALTER TABLE "main"."payout_batch"
     RENAME CONSTRAINT "payout_batch_reference_unique" TO "payout_batch_run_no_unique";
 END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "main"."payout_batch" ALTER COLUMN "provider" TYPE varchar(50);
--> statement-breakpoint
ALTER TABLE "main"."payout_batch" ALTER COLUMN "provider_batch_id" TYPE varchar(255);
--> statement-breakpoint
ALTER TABLE "main"."payout_batch_item" ALTER COLUMN "provider_payout_id" TYPE varchar(255);
