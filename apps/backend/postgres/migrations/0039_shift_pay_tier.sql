-- shift: persist per-shift pay-tier overrides (the Post Job composer rows).
--
-- New child table shift_pay_tier — one row per requested PR tier on a shift,
-- carrying the wage/commission/target that shift pays plus the requested
-- headcount. There is no existing table that models per-shift, per-tier rates
-- (outlet_tier_rate is per-workspace default), so this is a genuine new table,
-- not a duplicate. It mirrors outlet_tier_rate's shape and reuses the existing
-- main.outlet_tier_rate_kind enum (no new type). Audit columns are included up
-- front (all four together). The mobile earnings resolver prefers this row over
-- the outlet workspace default.

CREATE TABLE IF NOT EXISTS "main"."shift_pay_tier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"kind" "main"."outlet_tier_rate_kind" DEFAULT 'tier' NOT NULL,
	"tier" varchar(50),
	"wage_per_hour" numeric(12, 2),
	"drink_pct" numeric(6, 2) DEFAULT '0' NOT NULL,
	"happy_hour_drink_pct" numeric(6, 2),
	"tip_pct" numeric(6, 2) DEFAULT '0' NOT NULL,
	"ot_after_hours" numeric(6, 2),
	"target_sales_rm" numeric(12, 2),
	"pr_count" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar DEFAULT 'system' NOT NULL,
	"updated_by" varchar DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."shift_pay_tier" ADD CONSTRAINT "shift_pay_tier_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "main"."shift"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
