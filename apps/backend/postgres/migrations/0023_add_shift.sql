DO $$ BEGIN
 CREATE TYPE "main"."shift_event_kind" AS ENUM('normal', 'special');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "main"."shift_status" AS ENUM('draft', 'open', 'confirmed', 'sealed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "main"."shift" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"shift_date" date NOT NULL,
	"slot" varchar(100),
	"event_name" varchar(255),
	"event_kind" "main"."shift_event_kind" DEFAULT 'normal' NOT NULL,
	"languages" varchar(255),
	"quantity" integer DEFAULT 0 NOT NULL,
	"filled" integer DEFAULT 0 NOT NULL,
	"preferred_rating" integer,
	"pay_per_hour" numeric(12, 2) DEFAULT '0' NOT NULL,
	"estimated_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"live_sales" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" "main"."shift_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."shift" ADD CONSTRAINT "shift_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "main"."agency"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."shift" ADD CONSTRAINT "shift_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "main"."outlet"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
