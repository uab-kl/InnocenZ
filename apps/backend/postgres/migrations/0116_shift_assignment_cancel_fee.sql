-- A cancellation fee becomes a real, sealed number — and stays visible until
-- someone charges it.
--
-- Until now the PR app showed "Cancel (-RM 27.50)" and no code ever collected
-- it: a warning the system did not keep. These columns are what make it
-- collectable, and they are SEALED AT CANCEL TIME on purpose.
--
-- Re-deriving the fee later from the agency's current rule would be wrong in a
-- way that is hard to see: an agency that raises its late-cancel percentage in
-- September would retroactively increase what a PR owed for a shift dropped in
-- August. The rule in force AT THE MOMENT OF CANCELLING is the one the PR was
-- shown and agreed to, so that is the one stored. Same reasoning as sealing a
-- wage at check-out rather than recomputing it from today's rate card.
--
-- `cancel_notice_hours` and `cancel_fee_pct` are the EVIDENCE behind the
-- amount, kept beside it for the same reason 0097 kept the four pro-rata
-- columns beside `pay_amount`: a fee of RM 27.50 against a RM 55 shift is
-- unexplainable without the band that produced it.
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "cancel_fee_rm" numeric(12, 2);
--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "cancel_fee_pct" integer;
--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "cancel_notice_hours" numeric(6, 2);
--> statement-breakpoint
-- NULL = sealed but NOT YET CHARGED. This single column is what the agency's
-- Finance head reads: "what have I not collected?" is a question the system
-- could not answer before, because nothing recorded that a fee existed.
--
-- Deliberately NOT a boolean: the timestamp says WHEN it was charged, which a
-- flag cannot, and "never" is expressible as NULL either way.
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "cancel_fee_charged_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "cancel_fee_voucher_id" uuid;
--> statement-breakpoint
-- FK rather than a copied voucher number: one fact, one table. ON DELETE SET
-- NULL so deleting a voucher returns the fee to the uncharged list instead of
-- destroying the assignment row or orphaning the reference — an uncollected fee
-- must resurface, never silently vanish.
DO $$ BEGIN
 ALTER TABLE "main"."shift_assignment" ADD CONSTRAINT "shift_assignment_cancel_fee_voucher_id_fk" FOREIGN KEY ("cancel_fee_voucher_id") REFERENCES "main"."payment_voucher"("id") ON DELETE SET NULL ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- The Finance query is "uncharged fees for this agency", so index what it
-- filters on rather than leaving a sequential scan over every assignment ever
-- made.
CREATE INDEX IF NOT EXISTS "shift_assignment_uncharged_cancel_fee_idx"
  ON "main"."shift_assignment" ("agency_id")
  WHERE "cancel_fee_rm" IS NOT NULL AND "cancel_fee_charged_at" IS NULL;
