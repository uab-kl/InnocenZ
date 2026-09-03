-- PLAN SWITCHES MID-PERIOD ARE NO LONGER FREE OR PUNITIVE.
--
-- Owner, 28 Aug 2026: an outlet that has PAID its period and then moves to a
-- dearer plan pays the difference, "deducted based on their previous plan"; one
-- that moves to a cheaper plan gets the difference back as a deduction on its
-- next payment. Both must be VISIBLE — on the period row and on the receipt.
--
-- Three columns on the invoice, one new table:
--
-- `kind`            'period' (the normal monthly/weekly charge) or 'upgrade' (the
--                   difference charged when a paid period moves to a dearer plan).
-- `base_amount`     what the period cost before any deduction. `amount` stays the
--                   NET a payer owes, so every existing reader keeps working, and
--                   the CHECK below makes the three columns unable to disagree.
-- `credit_applied`  how much of an open credit was used up on this invoice.
-- `note`            the human sentence behind an upgrade or a deduction.
--
-- `subscription_credit` is what a downgrade produces: money the org has already
-- paid for a plan it no longer holds, waiting to be taken off its next period.
-- Kept as its own row rather than a negative invoice, because a credit has a
-- life the invoice does not — open, partly used, used, voided — and because the
-- invoice CHECK from 0135 (`amount >= 0`) is right and should stay.
ALTER TABLE "main"."subscription_invoice"
  ADD COLUMN IF NOT EXISTS "kind" varchar(20) NOT NULL DEFAULT 'period';
--> statement-breakpoint
ALTER TABLE "main"."subscription_invoice"
  ADD CONSTRAINT "subscription_invoice_kind_values" CHECK ("kind" IN ('period', 'upgrade'));
--> statement-breakpoint
ALTER TABLE "main"."subscription_invoice"
  ADD COLUMN IF NOT EXISTS "base_amount" numeric(12, 2);
--> statement-breakpoint
UPDATE "main"."subscription_invoice" SET "base_amount" = "amount" WHERE "base_amount" IS NULL;
--> statement-breakpoint
ALTER TABLE "main"."subscription_invoice" ALTER COLUMN "base_amount" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "main"."subscription_invoice"
  ADD COLUMN IF NOT EXISTS "credit_applied" numeric(12, 2) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "main"."subscription_invoice"
  ADD COLUMN IF NOT EXISTS "note" varchar(255);
--> statement-breakpoint
-- The one arithmetic fact every reader relies on, enforced where it cannot drift.
ALTER TABLE "main"."subscription_invoice"
  ADD CONSTRAINT "subscription_invoice_net_amount"
  CHECK ("credit_applied" >= 0 AND "amount" = "base_amount" - "credit_applied");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "main"."subscription_credit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	-- The lane row the credit belongs to (the NEW, cheaper subscription). Who the
	-- org is comes through this FK; nothing about the org is copied here.
	"member_subscription_id" uuid NOT NULL,
	-- The paid invoice the money came from. SET NULL, never cascade: a credit
	-- must outlive housekeeping on the invoice it was born from.
	"source_invoice_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"remaining" numeric(12, 2) NOT NULL,
	"status" varchar(20) NOT NULL DEFAULT 'open',
	"reason" varchar(255),
	"applied_to_invoice_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL,
	CONSTRAINT "subscription_credit_amount_positive" CHECK ("amount" > 0),
	CONSTRAINT "subscription_credit_remaining_range" CHECK ("remaining" >= 0 AND "remaining" <= "amount"),
	CONSTRAINT "subscription_credit_status_values" CHECK ("status" IN ('open', 'applied', 'void'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."subscription_credit"
   ADD CONSTRAINT "subscription_credit_member_subscription_id_fk"
   FOREIGN KEY ("member_subscription_id") REFERENCES "main"."member_subscription"("id")
   ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."subscription_credit"
   ADD CONSTRAINT "subscription_credit_source_invoice_id_fk"
   FOREIGN KEY ("source_invoice_id") REFERENCES "main"."subscription_invoice"("id")
   ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."subscription_credit"
   ADD CONSTRAINT "subscription_credit_applied_to_invoice_id_fk"
   FOREIGN KEY ("applied_to_invoice_id") REFERENCES "main"."subscription_invoice"("id")
   ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_credit_open_idx"
  ON "main"."subscription_credit" ("member_subscription_id") WHERE "status" = 'open';
