CREATE TYPE "main"."shift_assignment_status" AS ENUM('assigned', 'confirmed', 'completed', 'no_show', 'cancelled');--> statement-breakpoint
CREATE TABLE "main"."shift_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"pr_id" uuid NOT NULL,
	"status" "main"."shift_assignment_status" DEFAULT 'assigned' NOT NULL,
	"pay_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"check_in_at" timestamp with time zone,
	"check_out_at" timestamp with time zone,
	"notes" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL,
	CONSTRAINT "shift_assignment_shift_pr_unique" UNIQUE("shift_id","pr_id")
);
--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD CONSTRAINT "shift_assignment_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "main"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD CONSTRAINT "shift_assignment_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "main"."shift"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD CONSTRAINT "shift_assignment_pr_id_pr_id_fk" FOREIGN KEY ("pr_id") REFERENCES "main"."pr"("id") ON DELETE cascade ON UPDATE no action;