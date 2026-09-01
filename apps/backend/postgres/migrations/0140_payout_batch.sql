-- 0140 — `payout_batch` / `payout_batch_item`: the record of money actually
-- leaving an agency, which `payment_voucher.status = 'paid'` could never hold.
--
-- A voucher's status answers "has this person been paid?" with one word. That
-- was enough while paying meant one human keying one transfer and ticking one
-- box. It stops being enough the moment a week goes out as a FILE: a run needs
-- to record what was sent, to which account, on what day, by whom, and — the
-- part a single status can never express — which of the 59 lines came BACK.
--
-- Same reasoning that made `subscription_invoice` a table rather than a column
-- on the subscription: a thing that is attempted, can partially fail, and can
-- be retried is a row with a lifecycle, not an adjective on something else.
--
-- ── WHY THE ITEM CARRIES ITS OWN STATUS ─────────────────────────────────────
-- Because a batch does not fail; its items do. A run where 57 landed and 2
-- bounced on a mistyped account number is the NORMAL bad day, and it must not
-- render as one red word over 57 successful payments. `payout_batch.status` has
-- no 'failed' value for exactly this reason — a batch reaches 'settled' when
-- every item is terminal, with its failures visible inside it.
--
-- ── WHY THE PAYEE COLUMNS ARE NOT A DUPLICATE ───────────────────────────────
-- Rule 3 says one fact lives in one table and others reach it by FK, and the
-- LIVE bank details do live once, on `user_profile`, reached through the
-- voucher. `payee_name` / `payee_ic` / `bank_name` / `bank_account_no` here are
-- a different fact: what was written into the file the bank received, on the
-- day it received it. The two diverge the moment a PR corrects their account
-- number, and when a payment bounces the only useful question is "what did we
-- send?" — never "what does their profile say today". Precedent in this same
-- feature: `payment_voucher_dispute.disputed_amount` and
-- `payment_voucher_day_review.approved_total_cents`. A snapshot of a claim is
-- not a copy of a fact.
--
-- ⚠️ InnocenZ NEVER HOLDS THIS MONEY (owner's decision, 27 Aug 2026). The
-- agency is payer of record; funds move from the agency's own bank or its own
-- provider account. These tables RECORD a transfer, they do not make one.
-- `provider` / `provider_batch_id` / `provider_payout_id` are reserved for a
-- licensed payout API operating on the AGENCY's credentials — anything that
-- made InnocenZ the payer would be an e-money/remittance question under
-- FSA 2013 and MSBA 2011, not a schema question.
--
-- Hand-written and fully idempotent because `drizzle-kit generate` cannot run
-- in this repo (parent-snapshot collision across 0065-0070), and because the
-- shared innocenz-test DB has a second writer — every statement below must be
-- safe to re-run. See 0080/0123/0129/0130/0132.

DO $$ BEGIN
 CREATE TYPE "main"."payout_method" AS ENUM('ibg', 'duitnow', 'manual', 'provider');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "main"."payout_batch_status" AS ENUM('draft', 'exported', 'submitted', 'settled', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "main"."payout_item_status" AS ENUM('pending', 'sent', 'paid', 'failed', 'returned');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "main"."payout_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"reference" varchar(40),
	"week_start" date,
	"week_end" date,
	"method" "main"."payout_method" DEFAULT 'ibg' NOT NULL,
	"status" "main"."payout_batch_status" DEFAULT 'draft' NOT NULL,
	"provider" varchar(40),
	"provider_batch_id" varchar(120),
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"exported_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"note" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL,
	CONSTRAINT "payout_batch_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "main"."payout_batch_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"voucher_id" uuid NOT NULL,
	"payee_name" varchar(255),
	"payee_ic" varchar(100),
	"bank_name" varchar(255),
	"bank_account_no" varchar(50),
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" "main"."payout_item_status" DEFAULT 'pending' NOT NULL,
	"failure_reason" varchar(500),
	"provider_payout_id" varchar(120),
	"bank_ref" varchar(100),
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar DEFAULT 'system' NOT NULL,
	"updated_by" varchar DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."payout_batch" ADD CONSTRAINT "payout_batch_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "main"."agency"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."payout_batch_item" ADD CONSTRAINT "payout_batch_item_batch_id_payout_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "main"."payout_batch"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."payout_batch_item" ADD CONSTRAINT "payout_batch_item_voucher_id_payment_voucher_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "main"."payment_voucher"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- One line per voucher per batch. This is also the ON CONFLICT target the
-- batch builder relies on — without it, rebuilding a draft turns an upsert into
-- a blind insert and the same person is paid twice out of one run.
CREATE UNIQUE INDEX IF NOT EXISTS "payout_batch_item_one_per_voucher" ON "main"."payout_batch_item" ("batch_id","voucher_id");
--> statement-breakpoint
-- "Has this voucher already gone out?" — asked once per candidate before a new
-- batch is assembled, so it must not be a sequential scan of every line ever
-- paid.
CREATE INDEX IF NOT EXISTS "payout_batch_item_voucher_idx" ON "main"."payout_batch_item" ("voucher_id");
--> statement-breakpoint
-- The agency's own run list, newest first.
CREATE INDEX IF NOT EXISTS "payout_batch_agency_idx" ON "main"."payout_batch" ("agency_id","created_at");
