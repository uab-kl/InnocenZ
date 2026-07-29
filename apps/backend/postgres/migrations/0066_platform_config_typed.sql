-- Reshape platform_config from a key/value store into the single-row typed
-- config the code has always expected.
--
-- Why this is hand-written: `drizzle-kit generate` reports "nothing to migrate"
-- because it diffs the model against 0065_snapshot.json, and that snapshot
-- ALREADY describes the typed shape. It never opens a database connection, so
-- it cannot see that the live table is still key/value. No SQL migration in the
-- journal ever created these columns — the snapshot ran ahead of the SQL.
--
-- Every reader is already on the typed shape: platform-config.model.ts, its
-- repository and controller, apps/web services/platform-config.ts and the admin
-- Settings screen. Nothing in the repo reads `key` or `value`.

ALTER TABLE "main"."platform_config" ADD COLUMN IF NOT EXISTS "platform_fee_percent" numeric(5, 2) DEFAULT '5.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."platform_config" ADD COLUMN IF NOT EXISTS "geofence_radius_meters" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."platform_config" ADD COLUMN IF NOT EXISTS "subscription_monthly_fee" numeric(10, 2) DEFAULT '499.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."platform_config" ADD COLUMN IF NOT EXISTS "duplicate_payment_window_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."platform_config" ADD COLUMN IF NOT EXISTS "currency" varchar(8) DEFAULT 'MYR' NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."platform_config" ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'active' NOT NULL;--> statement-breakpoint

-- Carry the live fee forward BEFORE the source columns are dropped.
--
-- This matters: the model's default is 5.00 and the live row says 2.5. Taking
-- the default would silently double the platform fee, which is a pricing
-- decision, not a migration. The cross join yields no rows when the key is
-- absent, so a fresh database is left on the 5.00 default untouched.
UPDATE "main"."platform_config" AS p
SET "platform_fee_percent" = src.v
FROM (
  SELECT ("value")::numeric(5, 2) AS v
  FROM "main"."platform_config"
  WHERE "key" = 'PLATFORM_FEE_PERCENTAGE'
  LIMIT 1
) AS src
WHERE TRUE;--> statement-breakpoint

-- The typed design holds exactly one row (the repository does getOrCreate on
-- limit 1). Keep the oldest; anything else was a second setting under the old
-- key/value design and has no home in the new shape.
DELETE FROM "main"."platform_config"
WHERE "id" <> (SELECT "id" FROM "main"."platform_config" ORDER BY "created_at" LIMIT 1);--> statement-breakpoint

ALTER TABLE "main"."platform_config" DROP COLUMN IF EXISTS "key";--> statement-breakpoint
ALTER TABLE "main"."platform_config" DROP COLUMN IF EXISTS "value";--> statement-breakpoint
ALTER TABLE "main"."platform_config" DROP COLUMN IF EXISTS "description";
