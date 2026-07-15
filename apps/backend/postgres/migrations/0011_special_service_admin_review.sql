CREATE TYPE "main"."special_service_initiated_by" AS ENUM('outlet', 'agency');--> statement-breakpoint
CREATE TYPE "main"."special_service_admin_accepted" AS ENUM('n_a', 'pending', 'accepted', 'declined');--> statement-breakpoint
ALTER TABLE "main"."special_service" ADD COLUMN "initiated_by" "main"."special_service_initiated_by" DEFAULT 'outlet' NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."special_service" ADD COLUMN "admin_accepted" "main"."special_service_admin_accepted" DEFAULT 'n_a' NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."special_service" ADD COLUMN "posting_agency_id" uuid;--> statement-breakpoint
ALTER TABLE "main"."special_service" ADD COLUMN "posting_agency_name" varchar(255);--> statement-breakpoint
ALTER TABLE "main"."special_service" ADD CONSTRAINT "special_service_posting_agency_id_agency_id_fk" FOREIGN KEY ("posting_agency_id") REFERENCES "main"."agency"("id") ON DELETE set null ON UPDATE no action;
