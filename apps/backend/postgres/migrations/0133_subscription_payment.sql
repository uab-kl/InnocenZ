-- TWO CHANGES, ONE FEATURE: giving a subscription charge somewhere real to land.
--
-- Until now the collection side of the business was two disconnected halves.
-- `payment_method` recorded a CARD and could not charge it; `subscription_invoice`
-- recorded a CHARGE and flipped to 'paid' only when an admin pressed a button.
-- Nothing joined them — there is not, and never was, a foreign key between the
-- two — so the app could say what an org owed and that someone believed it had
-- paid, but never HOW, never with what reference, and never that an attempt had
-- been made and failed.
--
-- Part 1 stops `payment_method` meaning "the card". Part 2 adds the row that was
-- missing between an invoice and the money.
--
-- No gateway is connected by this migration and none is implied. What it does is
-- make the shape right, so connecting one later is a provider registration
-- rather than a rewrite of how payment is recorded.

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 1 · payment_method: an INSTRUMENT, not a card
--
-- A card is one way a Malaysian venue pays and, for business accounts, not the
-- common one. FPX direct debit runs on a bank-approved MANDATE that is pending
-- before it is usable — a state a card never has — and plenty of venues will
-- only ever bank-transfer. All three are "how this org pays us", so all three
-- belong in this table; a second table per rail would duplicate ownership,
-- default-selection and audit three times over.
--
-- The card columns therefore become NULLABLE, and a CHECK holds the line that
-- the NOT NULLs used to: a row that says it is a card still has to carry the
-- card facts. Nullable-plus-conditional-CHECK, not nullable-and-hope.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "main"."payment_method"
  ADD COLUMN IF NOT EXISTS "type" varchar(30) NOT NULL DEFAULT 'card';
--> statement-breakpoint
-- NULL for every rail that has no mandate. A card is usable the moment it is
-- saved; an FPX mandate is not usable until the payer bank says so, and code
-- that cannot see the difference will debit an account that never authorised it.
ALTER TABLE "main"."payment_method"
  ADD COLUMN IF NOT EXISTS "mandate_status" varchar(20);
--> statement-breakpoint
ALTER TABLE "main"."payment_method"
  ADD COLUMN IF NOT EXISTS "mandate_reference" varchar(120);
--> statement-breakpoint
-- Which instrument gets charged when several are on file. Replaces the old
-- "there can only be one" rule rather than sitting beside it.
ALTER TABLE "main"."payment_method"
  ADD COLUMN IF NOT EXISTS "is_default" boolean NOT NULL DEFAULT true;
--> statement-breakpoint

ALTER TABLE "main"."payment_method" ALTER COLUMN "last4" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "main"."payment_method" ALTER COLUMN "exp_month" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "main"."payment_method" ALTER COLUMN "exp_year" DROP NOT NULL;
--> statement-breakpoint

-- The old checks assumed the columns were always present. Re-stated to allow
-- NULL, with the card requirement moved into a check of its own below.
ALTER TABLE "main"."payment_method" DROP CONSTRAINT IF EXISTS "payment_method_last4_digits";
--> statement-breakpoint
ALTER TABLE "main"."payment_method" DROP CONSTRAINT IF EXISTS "payment_method_exp_month_range";
--> statement-breakpoint
ALTER TABLE "main"."payment_method" DROP CONSTRAINT IF EXISTS "payment_method_exp_year_range";
--> statement-breakpoint

ALTER TABLE "main"."payment_method"
  ADD CONSTRAINT "payment_method_last4_digits"
  CHECK ("last4" IS NULL OR "last4" ~ '^[0-9]{4}$');
--> statement-breakpoint
ALTER TABLE "main"."payment_method"
  ADD CONSTRAINT "payment_method_exp_month_range"
  CHECK ("exp_month" IS NULL OR "exp_month" BETWEEN 1 AND 12);
--> statement-breakpoint
ALTER TABLE "main"."payment_method"
  ADD CONSTRAINT "payment_method_exp_year_range"
  CHECK ("exp_year" IS NULL OR "exp_year" BETWEEN 2000 AND 2100);
--> statement-breakpoint

ALTER TABLE "main"."payment_method"
  ADD CONSTRAINT "payment_method_type_values"
  CHECK ("type" IN ('card', 'fpx_mandate', 'ewallet', 'duitnow', 'manual_transfer'));
--> statement-breakpoint
-- What the dropped NOT NULLs used to guarantee, now scoped to the rail that
-- actually needs it.
ALTER TABLE "main"."payment_method"
  ADD CONSTRAINT "payment_method_card_fields"
  CHECK (
    "type" <> 'card'
    OR ("last4" IS NOT NULL AND "exp_month" IS NOT NULL AND "exp_year" IS NOT NULL)
  );
--> statement-breakpoint
ALTER TABLE "main"."payment_method"
  ADD CONSTRAINT "payment_method_mandate_status_values"
  CHECK ("mandate_status" IS NULL OR "mandate_status" IN ('pending', 'active', 'cancelled', 'failed'));
--> statement-breakpoint
-- A mandate rail without a mandate state is the bug this column exists to stop.
ALTER TABLE "main"."payment_method"
  ADD CONSTRAINT "payment_method_mandate_fields"
  CHECK ("type" <> 'fpx_mandate' OR "mandate_status" IS NOT NULL);
--> statement-breakpoint

-- "One ACTIVE instrument per org" becomes "one DEFAULT instrument per org".
-- The old rule is what made several rails impossible: a venue cannot keep a
-- card AND a bank-transfer arrangement if the second insert is rejected. The
-- ambiguity the old index guarded against — which one gets charged — is now
-- answered by is_default instead of by there being only one row.
--
-- Existing rows need no backfill: the dropped indexes already guaranteed at
-- most one active row per org, and is_default defaults to true, so every
-- surviving card becomes its own org default and the new indexes hold on the
-- first try.
DROP INDEX IF EXISTS "main"."payment_method_active_outlet_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "main"."payment_method_active_agency_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_method_default_outlet_idx"
  ON "main"."payment_method" ("outlet_id")
  WHERE "status" = 'active' AND "is_default" AND "outlet_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_method_default_agency_idx"
  ON "main"."payment_method" ("agency_id")
  WHERE "status" = 'active' AND "is_default" AND "agency_id" IS NOT NULL;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 2 · subscription_payment: ONE ROW PER ATTEMPT
--
-- The same argument that made `subscription_invoice` necessary, one level down.
-- `member_subscription` could not hold payment state, so invoices were split
-- out; an invoice cannot hold ATTEMPT state, because an invoice is one thing
-- and the tries against it are many. A card declines and is retried. A mandate
-- debit sits pending for two days and then fails. A bank transfer arrives with
-- a reference. A charge is refunded. `status` on the invoice is one flag and
-- cannot say any of that.
--
-- It also closes a gap that has nothing to do with gateways: `payment_voucher`
-- has carried `bank_ref` since it was written, so an agency paying a PR records
-- WHICH transfer paid it. The subscription side had no equivalent — an admin
-- marked an invoice paid and the reference lived in their memory. `reference`
-- here is that column, finally.
--
-- The invoice keeps its own `status`: it is what every existing screen reads,
-- and one flag that is always written together with the attempt row is safer
-- than a derived value four surfaces would each have to recompute.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
 CREATE TYPE "main"."subscription_payment_status" AS ENUM(
   'initiated', 'pending', 'succeeded', 'failed', 'refunded', 'voided'
 );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "main"."subscription_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_invoice_id" uuid NOT NULL,
	-- Nullable, and ON DELETE SET NULL: a manual bank transfer is paid through
	-- no instrument at all, and a venue that removes an old card must not take
	-- the record of what it paid with it.
	"payment_method_id" uuid,
	-- Snapshotted from the instrument, deliberately, for the same reason the
	-- invoice snapshots its amount: how a period was actually paid must not
	-- change when the venue later switches rails.
	"method_type" varchar(30) NOT NULL,
	"gateway" varchar(50),
	"gateway_payment_id" varchar(255),
	-- The bank/gateway reference a human can match against a statement.
	"reference" varchar(120),
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(8) DEFAULT 'MYR' NOT NULL,
	"status" "main"."subscription_payment_status" DEFAULT 'initiated' NOT NULL,
	"failure_reason" varchar(500),
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL,
	CONSTRAINT "subscription_payment_method_type_values"
	  CHECK ("method_type" IN ('card', 'fpx_mandate', 'ewallet', 'duitnow', 'manual_transfer')),
	-- A succeeded payment with no timestamp is a row that cannot answer "when".
	CONSTRAINT "subscription_payment_paid_at_required"
	  CHECK ("status" <> 'succeeded' OR "paid_at" IS NOT NULL),
	CONSTRAINT "subscription_payment_amount_positive" CHECK ("amount" > 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."subscription_payment"
   ADD CONSTRAINT "subscription_payment_invoice_id_fk"
   FOREIGN KEY ("subscription_invoice_id") REFERENCES "main"."subscription_invoice"("id")
   ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."subscription_payment"
   ADD CONSTRAINT "subscription_payment_payment_method_id_fk"
   FOREIGN KEY ("payment_method_id") REFERENCES "main"."payment_method"("id")
   ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- THE IDEMPOTENCY GUARANTEE, and the whole reason a webhook can be trusted.
-- Gateways retry until they get a 2xx, so the same settlement arrives three or
-- four times as a matter of course. Without this index the second delivery
-- records a second payment and the period looks paid twice.
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payment_gateway_ref_idx"
  ON "main"."subscription_payment" ("gateway", "gateway_payment_id")
  WHERE "gateway_payment_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_payment_invoice_idx"
  ON "main"."subscription_payment" ("subscription_invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_payment_status_idx"
  ON "main"."subscription_payment" ("status");
