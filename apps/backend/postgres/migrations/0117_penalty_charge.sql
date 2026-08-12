-- Weekly penalties get somewhere to LIVE, so "have we billed this?" becomes a
-- fact instead of a guess.
--
-- The three weekly rules were computed per request from shift_assignment and
-- stored nowhere. That made them fine to PROPOSE and impossible to track: the
-- Finance list could not include them, because the same RM 50 would reappear
-- every week after being paid and nothing could tell a settled breach from a
-- live one. Cancellation fees already had this (a row with a charged_at); this
-- gives the weekly rules the same shape.
--
-- A row is written when the agency SEALS a week's breaches, not when one is
-- computed. Reading a proposal must not create a debt — otherwise merely
-- opening Manage PR would start billing people.
--
-- `fine_rm` and `detail` are SNAPSHOTS. The rule's amounts are editable and the
-- underlying attendance can still change (a late MC approval, a corrected
-- check-out), so re-deriving at payment time would restate a figure the agency
-- had already accepted. Same reasoning as sealing a cancellation fee.
CREATE TABLE IF NOT EXISTS "main"."penalty_charge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"pr_id" uuid NOT NULL,
	"rule_type" "main"."penalty_rule_type" NOT NULL,
	"week_start" date NOT NULL,
	"week_end" date NOT NULL,
	"fine_rm" numeric(12, 2) DEFAULT '0' NOT NULL,
	"detail" varchar(255) DEFAULT '' NOT NULL,
	"charged_at" timestamp with time zone,
	"charged_voucher_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar DEFAULT 'system' NOT NULL,
	"updated_by" varchar DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."penalty_charge" ADD CONSTRAINT "penalty_charge_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "main"."agency"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- SET NULL, not CASCADE: deleting a voucher must return the charge to the
-- uncharged list, never destroy the record that it was owed.
DO $$ BEGIN
 ALTER TABLE "main"."penalty_charge" ADD CONSTRAINT "penalty_charge_voucher_id_fk" FOREIGN KEY ("charged_voucher_id") REFERENCES "main"."payment_voucher"("id") ON DELETE SET NULL ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- One charge per PR per rule per week. This is what makes sealing IDEMPOTENT:
-- pressing the button twice, or two operators pressing it at once, cannot bill
-- the same breach twice. Without it the safest-looking retry is the one that
-- double-charges someone.
CREATE UNIQUE INDEX IF NOT EXISTS "penalty_charge_agency_pr_rule_week_idx"
  ON "main"."penalty_charge" ("agency_id","pr_id","rule_type","week_start");
--> statement-breakpoint
-- The Finance query is "uncharged for this agency".
CREATE INDEX IF NOT EXISTS "penalty_charge_uncharged_idx"
  ON "main"."penalty_charge" ("agency_id")
  WHERE "charged_at" IS NULL;
