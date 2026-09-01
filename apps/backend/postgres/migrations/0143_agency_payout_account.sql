-- 0143 — `agency_payout_account`: WHOSE provider account pays the PRs.
--
-- Until now `payout-provider.ts` read one PAYOUT_API_KEY from the environment.
-- That is correct while one company runs one agency and WRONG the moment two
-- agencies pay from different accounts — and the wrong version is not merely
-- untidy, it is the thing the owner's decision forbids: one key paying many
-- agencies' PRs makes InnocenZ the payer of third-party funds, which is
-- e-money / remittance activity under FSA 2013 and MSBA 2011.
--
-- ── WHY NOT A ROW ON `payment_method` ───────────────────────────────────────
-- `payment_method` already carries `agency_id` as a first-class FK, so parking
-- a payout account there looks free. It is not. Three mechanisms break:
--
--   1. 0133's partial unique indexes allow one DEFAULT active row per agency,
--      and `getActiveFor()` returns exactly that row as THE subscription
--      instrument — the thing InnocenZ charges.
--   2. the subscription webhook stamps that row onto
--      `subscription_payment.payment_method_id` as the thing that paid us.
--   3. even at is_default = false, `listFor()` and `setDefaultMine` carry NO
--      type filter, so the payout account appears in the agency's subscription
--      instrument list and any agency user can promote it to default.
--
-- On top of which that table refuses account numbers by design, in capitals, in
-- three places. Inbound collection and outbound disbursement are two bounded
-- contexts; this is the second one.
--
-- ── SECRETS ARE NOT STORED HERE ─────────────────────────────────────────────
-- `api_key_ref` / `api_secret_ref` hold a REFERENCE a secret manager resolves
-- (or an env var name), never the credential. `payment_method.gateway_token` is
-- a plaintext varchar protected only by a read projection, and that is the one
-- thing from next door NOT to copy: a payout key can move money out. The
-- projection pattern IS copied — a single toPublic… at the model layer.
--
-- ONE account per agency for now (unique on agency_id). Multiple providers per
-- agency is a real future need but not one anybody has, and a nullable
-- "which is default" column with one row under it buys nothing today.
--
-- Hand-written and idempotent: `drizzle-kit generate` cannot run in this repo
-- and the shared innocenz-test DB has a second writer.

CREATE TABLE IF NOT EXISTS "main"."agency_payout_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"provider" varchar(40) NOT NULL,
	"api_key_ref" varchar(255),
	"api_secret_ref" varchar(255),
	"account_id" varchar(120),
	"active" boolean DEFAULT true NOT NULL,
	"note" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."agency_payout_account" ADD CONSTRAINT "agency_payout_account_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "main"."agency"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- One payout account per agency. Also the ON CONFLICT target for the upsert.
CREATE UNIQUE INDEX IF NOT EXISTS "agency_payout_account_agency_idx"
  ON "main"."agency_payout_account" ("agency_id");
