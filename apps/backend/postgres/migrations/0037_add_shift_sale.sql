-- shift_sale: per-(shift, PR) floor-sales capture. The outlet Today panel logs
-- drink/tip/table revenue here; the Reports screen aggregates it by day and by
-- PR. outlet_id / agency_id / sold_on are denormalized from the shift so the
-- report can scope + group by day without a join. This is the revenue side; the
-- cost side (PR wages/commission) stays on shift_assignment.pay_amount.
CREATE TABLE IF NOT EXISTS "main"."shift_sale" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"pr_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"agency_id" uuid NOT NULL,
	"sold_on" date NOT NULL,
	"drink_units" integer DEFAULT 0 NOT NULL,
	"drink_sales_rm" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tip_units" integer DEFAULT 0 NOT NULL,
	"tip_sales_rm" numeric(12, 2) DEFAULT '0' NOT NULL,
	"table_sales_rm" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_sales_rm" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL,
	CONSTRAINT "shift_sale_shift_pr_unique" UNIQUE("shift_id","pr_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."shift_sale" ADD CONSTRAINT "shift_sale_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "main"."shift"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."shift_sale" ADD CONSTRAINT "shift_sale_pr_id_pr_id_fk" FOREIGN KEY ("pr_id") REFERENCES "main"."pr"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."shift_sale" ADD CONSTRAINT "shift_sale_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "main"."outlet"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."shift_sale" ADD CONSTRAINT "shift_sale_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "main"."agency"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
