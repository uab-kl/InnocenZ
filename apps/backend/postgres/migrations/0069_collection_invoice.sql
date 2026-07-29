-- Collections: what an outlet owes its agency for a week's PR work.
--
-- A STATEMENT OF ACCOUNT, not a payment rail. This app does not handle money
-- moving between an agency and an outlet — they settle that between themselves.
-- So there is no payment method, no capture and no gateway reference here. What
-- the table gives both sides is one agreed figure derived from work that
-- actually happened, plus a flag the agency sets once it has been paid
-- elsewhere.
--
-- `settled_at` is therefore bookkeeping, not evidence: it records that the
-- agency SAYS it was settled. Nothing in this system can verify that, and it
-- must not be read as if it could.

DO $$ BEGIN
  CREATE TYPE "main"."collection_invoice_status" AS ENUM ('draft', 'issued', 'settled', 'void');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "main"."collection_invoice" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid NOT NULL REFERENCES "main"."agency"("id") ON DELETE CASCADE,
  "outlet_id" uuid NOT NULL REFERENCES "main"."outlet"("id") ON DELETE CASCADE,
  -- Snapshot so a renamed or removed outlet does not rewrite history, matching
  -- payment_voucher.pr_name and outlet_transaction.outlet_name.
  "outlet_name" varchar(255) NOT NULL,
  "week_start" date NOT NULL,
  "week_end" date NOT NULL,
  "amount" numeric(12, 2) DEFAULT '0' NOT NULL,
  "currency" varchar(8) DEFAULT 'MYR' NOT NULL,
  "status" "main"."collection_invoice_status" DEFAULT 'draft' NOT NULL,
  "issued_at" timestamp with time zone,
  -- Set by the agency AFTER being paid outside this app. Not proof of payment.
  "settled_at" timestamp with time zone,
  "note" varchar(1000),
  -- The shift assignments this figure was built from, so the number can always
  -- be traced back to the work rather than taken on trust.
  "source_assignment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" varchar NOT NULL,
  "updated_by" varchar NOT NULL
);--> statement-breakpoint

-- One invoice per outlet per agency per week. This is what makes the weekly job
-- safe to re-run: a second pass over the same window conflicts instead of
-- quietly issuing a duplicate bill.
CREATE UNIQUE INDEX IF NOT EXISTS "collection_invoice_agency_outlet_week_unique"
  ON "main"."collection_invoice" ("agency_id", "outlet_id", "week_start");
