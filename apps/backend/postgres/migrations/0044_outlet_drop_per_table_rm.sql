-- Per-table price removed: with table sales gone there is no per-table charge,
-- so per_table_rm on the workspace row is dead. Drop it. IF EXISTS keeps the
-- drop idempotent.
ALTER TABLE "main"."outlet_workspace" DROP COLUMN IF EXISTS "per_table_rm";
