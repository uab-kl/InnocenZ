CREATE TYPE "main"."pr_status" AS ENUM('active', 'inactive', 'pending', 'suspended');--> statement-breakpoint
CREATE TYPE "main"."pr_tier" AS ENUM('tier_1', 'tier_2', 'tier_3');--> statement-breakpoint
CREATE TABLE "main"."pr" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"user_id" uuid,
	"name" varchar(255) NOT NULL,
	"nickname" varchar(100),
	"tier" "main"."pr_tier" DEFAULT 'tier_1' NOT NULL,
	"status" "main"."pr_status" DEFAULT 'active' NOT NULL,
	"phone" varchar(50),
	"email" varchar(255),
	"ic_no" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL
);
--> statement-breakpoint
ALTER TABLE "main"."pr" ADD CONSTRAINT "pr_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "main"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."pr" ADD CONSTRAINT "pr_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "main"."user"("id") ON DELETE set null ON UPDATE no action;