-- Table commission removed: an outlet's tables don't generate sales, so the
-- table-sales commission rate (table_pct) is dead on both the workspace row and
-- each per-tier rate row. Drop it from both. IF EXISTS keeps the drop idempotent.
ALTER TABLE "main"."outlet_workspace" DROP COLUMN IF EXISTS "table_pct";
--> statement-breakpoint
ALTER TABLE "main"."outlet_tier_rate" DROP COLUMN IF EXISTS "table_pct";
