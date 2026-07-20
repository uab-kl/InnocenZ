-- outlet.subscription_id is dropped: member_subscription is the plan record.
--
-- Before dropping it, the link has to survive. main.member_subscription already
-- carries an 'outlet' row per outlet with plan, amount, status and dates — but
-- its subscriber_id values are orphan uuids that match no outlet row (seed
-- drift), so nothing actually joins today. They are repointed here by name.
--
-- 5 of the 7 outlet rows match a live outlet and are repaired. The other two
-- ('Jade Garden Bar', 'Marble Hall') have no outlet at all and are pre-existing
-- demo noise — left alone rather than invented.
--
-- One conflict, resolved in favour of member_subscription: Onyx KL is 'Scale'
-- there and 'Plus' on outlet.subscription_id. member_subscription is the
-- surviving record and holds the richer row (amount, status, started_at), so
-- its value stands.
--
-- subscriber_id stays FK-less on purpose: it is polymorphic across
-- agency|outlet, which is a standing exception to the reuse-via-FK rule.

UPDATE "main"."member_subscription" ms
SET "subscriber_id" = o."id",
    "updated_at" = now(),
    "updated_by" = 'migration-0034'
FROM "main"."outlet" o
WHERE ms."subscriber_type" = 'outlet'
  AND ms."subscriber_name" = o."name"
  AND ms."subscriber_id" <> o."id";--> statement-breakpoint

ALTER TABLE "main"."outlet" DROP COLUMN IF EXISTS "subscription_id";
