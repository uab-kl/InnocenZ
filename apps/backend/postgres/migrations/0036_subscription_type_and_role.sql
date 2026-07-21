-- subscription gains an explicit audience: subscription_type + role_id.
--
-- Migration 0028 dropped subscription_role and the plan->role link with it,
-- leaving audience *derived* from billing_cycle (monthly = outlet, weekly =
-- agency) — a rule hardcoded across seed-plans.ts, seed-sample-activity.ts,
-- seed-sample-orgs.ts, subscriptions-table.tsx and the admin Plan route. That
-- heuristic breaks the moment an agency plan is billed monthly.
--
-- role_id is the FK the user asked for, back onto main.role ('agency' /
-- 'outlet'). subscription_type is the audience discriminator the UI filters and
-- groups by; it is derivable from role_id, but role also holds admin/pr/Test
-- rows that are not plan audiences, so the enum states the intent directly and
-- keeps the check cheap.
--
-- Backfill uses the billing_cycle rule that was true until now: all 12 rows are
-- weekly (6, agency) or monthly (6, outlet). Roles are resolved by role_name,
-- not hardcoded uuids.

CREATE TYPE "main"."subscription_type" AS ENUM('agency', 'outlet');--> statement-breakpoint

ALTER TABLE "main"."subscription" ADD COLUMN IF NOT EXISTS "subscription_type" "main"."subscription_type";--> statement-breakpoint
ALTER TABLE "main"."subscription" ADD COLUMN IF NOT EXISTS "role_id" uuid;--> statement-breakpoint

UPDATE "main"."subscription"
SET "subscription_type" = CASE WHEN "billing_cycle" = 'weekly' THEN 'agency'::"main"."subscription_type"
                               ELSE 'outlet'::"main"."subscription_type" END
WHERE "subscription_type" IS NULL;--> statement-breakpoint

UPDATE "main"."subscription" s
SET "role_id" = r."id"
FROM "main"."role" r
WHERE r."role_name" = s."subscription_type"::text
  AND s."role_id" IS NULL;--> statement-breakpoint

ALTER TABLE "main"."subscription" ALTER COLUMN "subscription_type" SET NOT NULL;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "main"."subscription" ADD CONSTRAINT "subscription_role_id_role_id_fk"
    FOREIGN KEY ("role_id") REFERENCES "main"."role"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
