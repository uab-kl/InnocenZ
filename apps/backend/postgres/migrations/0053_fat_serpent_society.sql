-- Idempotent: every object below already exists on innocenz-test (applied
-- out-of-band before the journal was repaired). Guards let drizzle record
-- this entry and continue to the later migrations instead of dying here.
DO $$ BEGIN
	CREATE TYPE "main"."outlet_swap_status" AS ENUM('pending_pr', 'approved', 'declined', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "main"."payment_voucher_dispute_component" AS ENUM('wages', 'drinks', 'tips', 'others');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "main"."payment_voucher_dispute_outcome" AS ENUM('accepted', 'rejected', 'withdrawn');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "main"."outlet_swap_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"from_shift_id" uuid NOT NULL,
	"to_shift_id" uuid NOT NULL,
	"agency_id" uuid NOT NULL,
	"agency_note" varchar(500),
	"pr_note" varchar(500),
	"status" "main"."outlet_swap_status" DEFAULT 'pending_pr' NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "main"."payment_voucher_dispute" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voucher_id" uuid NOT NULL,
	"dispute_date" date NOT NULL,
	"component" "main"."payment_voucher_dispute_component" NOT NULL,
	"reason" varchar(1000),
	"note" varchar(1000),
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disputed_amount" numeric(12, 2),
	"claimed_amount" numeric(12, 2),
	"proof_photos" jsonb,
	"receipt_refs" jsonb,
	"outcome" "main"."payment_voucher_dispute_outcome",
	"resolved_at" timestamp with time zone,
	"resolved_by" varchar,
	"resolution_note" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar DEFAULT 'system' NOT NULL,
	"updated_by" varchar DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "main"."outlet_swap_request" ADD CONSTRAINT "outlet_swap_request_assignment_id_shift_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "main"."shift_assignment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "main"."outlet_swap_request" ADD CONSTRAINT "outlet_swap_request_from_shift_id_shift_id_fk" FOREIGN KEY ("from_shift_id") REFERENCES "main"."shift"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "main"."outlet_swap_request" ADD CONSTRAINT "outlet_swap_request_to_shift_id_shift_id_fk" FOREIGN KEY ("to_shift_id") REFERENCES "main"."shift"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "main"."outlet_swap_request" ADD CONSTRAINT "outlet_swap_request_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "main"."agency"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "main"."payment_voucher_dispute" ADD CONSTRAINT "payment_voucher_dispute_voucher_id_payment_voucher_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "main"."payment_voucher"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_voucher_dispute_one_per_day_component" ON "main"."payment_voucher_dispute" USING btree ("voucher_id","dispute_date","component");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_voucher_dispute_open_idx" ON "main"."payment_voucher_dispute" USING btree ("raised_at") WHERE "main"."payment_voucher_dispute"."outcome" is null;
