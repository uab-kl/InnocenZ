-- Table sales removed from the floor-sales model: an outlet's tables don't
-- generate "tips", and table_sales_rm was only ever folded into the tips figure.
-- Recompute the stored total from drinks + tips (dropping any table portion),
-- then drop the column. IF EXISTS keeps the drop idempotent.
UPDATE "main"."shift_sale" SET "total_sales_rm" = "drink_sales_rm" + "tip_sales_rm";
--> statement-breakpoint
ALTER TABLE "main"."shift_sale" DROP COLUMN IF EXISTS "table_sales_rm";
