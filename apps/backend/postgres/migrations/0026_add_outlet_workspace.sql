DO $$ BEGIN
 CREATE TYPE "main"."outlet_tier_rate_kind" AS ENUM('tier', 'commission_only');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "main"."outlet_penalty_rule_type" AS ENUM('min_shifts_per_week', 'max_mc_per_month', 'late_per_week');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "main"."outlet_workspace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL,
	"base_pay_per_hour" numeric(12, 2) DEFAULT '0' NOT NULL,
	"drink_pct" numeric(6, 2) DEFAULT '0' NOT NULL,
	"tip_pct" numeric(6, 2) DEFAULT '0' NOT NULL,
	"table_pct" numeric(6, 2) DEFAULT '0' NOT NULL,
	"ot_after_hours" numeric(6, 2) DEFAULT '0' NOT NULL,
	"per_drink_rm" numeric(12, 2) DEFAULT '0' NOT NULL,
	"per_table_rm" numeric(12, 2) DEFAULT '0' NOT NULL,
	"happy_hour_start" varchar(10) DEFAULT '' NOT NULL,
	"happy_hour_end" varchar(10) DEFAULT '' NOT NULL,
	"happy_hour_drink_discount_pct" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL,
	CONSTRAINT "outlet_workspace_outlet_id_unique" UNIQUE("outlet_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "main"."outlet_tier_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "main"."outlet_tier_rate_kind" DEFAULT 'tier' NOT NULL,
	"tier" varchar(50),
	"wage_per_hour" numeric(12, 2),
	"drink_pct" numeric(6, 2) DEFAULT '0' NOT NULL,
	"happy_hour_drink_pct" numeric(6, 2),
	"tip_pct" numeric(6, 2) DEFAULT '0' NOT NULL,
	"table_pct" numeric(6, 2),
	"ot_after_hours" numeric(6, 2),
	"target_sales_rm" numeric(12, 2),
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "main"."outlet_drink_menu" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"price_rm" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "main"."outlet_penalty_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"rule_type" "main"."outlet_penalty_rule_type" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"applies_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fine_rm" numeric(12, 2) DEFAULT '0' NOT NULL,
	"min_shifts_per_week" integer,
	"max_mc_per_month" integer,
	"fine_per_excess_rm" numeric(12, 2),
	"max_late_per_week" integer,
	"grace_minutes" integer
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."outlet_workspace" ADD CONSTRAINT "outlet_workspace_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "main"."outlet"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."outlet_tier_rate" ADD CONSTRAINT "outlet_tier_rate_workspace_id_outlet_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "main"."outlet_workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."outlet_drink_menu" ADD CONSTRAINT "outlet_drink_menu_workspace_id_outlet_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "main"."outlet_workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."outlet_penalty_rule" ADD CONSTRAINT "outlet_penalty_rule_workspace_id_outlet_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "main"."outlet_workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
