-- Add-ons alongside a plan, and the negotiation that priced them.
--
-- Found 3 Aug 2026: an admin resolved a POS-integration quote at RM 99,999 and
-- the number lived only on the admin_request row — nothing billed it, the venue
-- could not see it, and no report counted it. The venue is meant to be "under
-- Integrate with POS" once resolved, WHILE staying on its plan.
--
-- 1. subscription.kind separates a PLAN (one at a time, Essential..Premier) from
--    an ADD-ON (held alongside a plan). Without it the add-on's ledger row is
--    the newest row for that venue and would masquerade as its current plan.
-- 2. The POS Integration product itself, so an add-on line has something to
--    reference by id rather than a name typed into a row (price 0 = negotiated
--    per venue; the agreed amount is stored on the member_subscription line).
-- 3. member_subscription.admin_request_id records WHICH negotiation set a price,
--    so an unusual amount can always be traced back to the quote that agreed it.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'subscription_kind' AND n.nspname = 'main') THEN
    CREATE TYPE "main"."subscription_kind" AS ENUM('plan', 'addon');
  END IF;
END $$;

ALTER TABLE "main"."subscription"
  ADD COLUMN IF NOT EXISTS "kind" "main"."subscription_kind" DEFAULT 'plan' NOT NULL;

ALTER TABLE "main"."member_subscription"
  ADD COLUMN IF NOT EXISTS "admin_request_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_subscription_admin_request_id_fk') THEN
    ALTER TABLE "main"."member_subscription"
      ADD CONSTRAINT "member_subscription_admin_request_id_fk"
      FOREIGN KEY ("admin_request_id") REFERENCES "main"."admin_request"("id") ON DELETE set null;
  END IF;
END $$;

-- The POS add-on product. Price 0 because it is quoted per venue; the agreed
-- figure lives on each venue's own member_subscription line.
INSERT INTO "main"."subscription" (
  "name", "price", "billing_cycle", "subscription_type", "kind", "status", "coverage", "created_by", "updated_by"
)
SELECT 'POS Integration', 0, 'monthly', 'outlet', 'addon', 'active', 'Quoted per venue', 'migration-0081', 'migration-0081'
WHERE NOT EXISTS (
  SELECT 1 FROM "main"."subscription" WHERE "name" = 'POS Integration' AND "kind" = 'addon'
);
