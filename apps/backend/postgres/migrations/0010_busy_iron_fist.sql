CREATE TYPE "main"."special_service_category" AS ENUM('security', 'bartending', 'cleaning', 'entertainment', 'promotion', 'other');--> statement-breakpoint
CREATE TYPE "main"."special_service_status" AS ENUM('open', 'assigned', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "main"."special_service" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid,
	"outlet_name" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"category" "main"."special_service_category" DEFAULT 'other' NOT NULL,
	"description" text,
	"budget" numeric(12, 2),
	"currency" varchar(8) DEFAULT 'MYR' NOT NULL,
	"status" "main"."special_service_status" DEFAULT 'open' NOT NULL,
	"assigned_agency_id" uuid,
	"assigned_agency_name" varchar(255),
	"scheduled_for" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL
);
--> statement-breakpoint
ALTER TABLE "main"."special_service" ADD CONSTRAINT "special_service_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "main"."outlet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."special_service" ADD CONSTRAINT "special_service_assigned_agency_id_agency_id_fk" FOREIGN KEY ("assigned_agency_id") REFERENCES "main"."agency"("id") ON DELETE set null ON UPDATE no action;