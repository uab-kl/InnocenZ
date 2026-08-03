-- The card an outlet or agency pays its InnocenZ subscription with.
--
-- No existing table fits: `member_subscription` is the ledger of what was
-- BILLED, and `outlet`/`agency` are organisation profiles. A payment method is
-- neither — it is mutable, replaceable, and owned by exactly one organisation.
--
-- ⚠️ THERE IS DELIBERATELY NO COLUMN FOR THE CARD NUMBER OR THE CVV, and there
-- must never be one. Storing a full PAN puts this database in PCI-DSS scope and
-- storing a CVV is forbidden outright, even encrypted. What is kept is what a
-- human needs to recognise their own card — brand, last four, expiry, holder —
-- plus `gateway_token`, which is where a real charge token goes once a payment
-- gateway is connected. Until then the app can RECORD a card but cannot charge
-- it, and the UI says so rather than implying auto-pay works.
--
-- Ownership is two nullable FKs with a CHECK that exactly one is set, rather
-- than the `subscriber_type` + `subscriber_id` pair used by `member_subscription`:
-- that pair cannot be a foreign key, which is how six ledger rows ended up
-- pointing at organisations that never existed.
CREATE TABLE IF NOT EXISTS "main"."payment_method" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "outlet_id" uuid REFERENCES "main"."outlet"("id") ON DELETE CASCADE,
  "agency_id" uuid REFERENCES "main"."agency"("id") ON DELETE CASCADE,
  "brand" varchar(30) NOT NULL DEFAULT 'Card',
  "last4" varchar(4) NOT NULL,
  "exp_month" smallint NOT NULL,
  "exp_year" smallint NOT NULL,
  "holder_name" varchar(255),
  "billing_email" varchar(255),
  "gateway" varchar(50),
  "gateway_token" varchar(255),
  "auto_pay" boolean NOT NULL DEFAULT true,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" varchar NOT NULL,
  "updated_by" varchar NOT NULL,
  CONSTRAINT "payment_method_one_owner" CHECK (("outlet_id" IS NOT NULL) <> ("agency_id" IS NOT NULL)),
  CONSTRAINT "payment_method_exp_month_range" CHECK ("exp_month" BETWEEN 1 AND 12),
  CONSTRAINT "payment_method_exp_year_range" CHECK ("exp_year" BETWEEN 2000 AND 2100),
  CONSTRAINT "payment_method_last4_digits" CHECK ("last4" ~ '^[0-9]{4}$')
);
--> statement-breakpoint

-- One active card per organisation. Replacing a card updates this row, so a
-- venue cannot end up with two cards and no way to tell which one is charged.
CREATE UNIQUE INDEX IF NOT EXISTS "payment_method_active_outlet_idx"
  ON "main"."payment_method" ("outlet_id")
  WHERE "status" = 'active' AND "outlet_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_method_active_agency_idx"
  ON "main"."payment_method" ("agency_id")
  WHERE "status" = 'active' AND "agency_id" IS NOT NULL;
