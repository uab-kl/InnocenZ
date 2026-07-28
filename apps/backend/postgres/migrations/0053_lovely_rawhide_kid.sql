-- Hand-adjusted migration: the auto-generated version (a) added NOT NULL
-- outlet_id columns to populated tables (crash), (b) dropped wage_per_hour /
-- ot_after_hours after creating empty replacements (data loss — these are
-- RENAMES), and (c) re-added columns/enum values the live DB may already
-- have. Every step below is guarded so it applies cleanly on any state.
ALTER TYPE "main"."shift_assignment_status" ADD VALUE IF NOT EXISTS 'leave_pending';--> statement-breakpoint
ALTER TYPE "main"."shift_assignment_status" ADD VALUE IF NOT EXISTS 'leave_approved';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "main"."payment_voucher_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voucher_id" uuid NOT NULL,
	"shift_assignment_id" uuid,
	"receipt_no" varchar(40) NOT NULL,
	"order_no" varchar(100),
	"source" varchar(20) DEFAULT 'manual' NOT NULL,
	"receipt_date" date,
	"receipt_time" varchar(10),
	"proof_photos" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar DEFAULT 'system' NOT NULL,
	"updated_by" varchar DEFAULT 'system' NOT NULL,
	CONSTRAINT "payment_voucher_receipt_receipt_no_unique" UNIQUE("receipt_no")
);
--> statement-breakpoint
-- shift_pay_tier: ot_after_hours → standard_shift_hours is a RENAME (keeps data).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='main' AND table_name='shift_pay_tier' AND column_name='ot_after_hours')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='main' AND table_name='shift_pay_tier' AND column_name='standard_shift_hours') THEN
    ALTER TABLE "main"."shift_pay_tier" RENAME COLUMN "ot_after_hours" TO "standard_shift_hours";
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='main' AND table_name='shift_pay_tier' AND column_name='standard_shift_hours') THEN
    ALTER TABLE "main"."shift_pay_tier" ADD COLUMN "standard_shift_hours" numeric(6, 2);
  END IF;
END $$;
--> statement-breakpoint
-- shift_pay_tier: wage_per_hour → daily_wage is a RENAME (keeps data).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='main' AND table_name='shift_pay_tier' AND column_name='wage_per_hour')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='main' AND table_name='shift_pay_tier' AND column_name='daily_wage') THEN
    ALTER TABLE "main"."shift_pay_tier" RENAME COLUMN "wage_per_hour" TO "daily_wage";
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='main' AND table_name='shift_pay_tier' AND column_name='daily_wage') THEN
    ALTER TABLE "main"."shift_pay_tier" ADD COLUMN "daily_wage" numeric(12, 2);
  END IF;
END $$;
--> statement-breakpoint
-- outlet_tier_rate: same two renames (keep the configured tier wages).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='main' AND table_name='outlet_tier_rate' AND column_name='wage_per_hour')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='main' AND table_name='outlet_tier_rate' AND column_name='daily_wage') THEN
    ALTER TABLE "main"."outlet_tier_rate" RENAME COLUMN "wage_per_hour" TO "daily_wage";
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='main' AND table_name='outlet_tier_rate' AND column_name='daily_wage') THEN
    ALTER TABLE "main"."outlet_tier_rate" ADD COLUMN "daily_wage" numeric(12, 2);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='main' AND table_name='outlet_tier_rate' AND column_name='ot_after_hours')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='main' AND table_name='outlet_tier_rate' AND column_name='standard_shift_hours') THEN
    ALTER TABLE "main"."outlet_tier_rate" RENAME COLUMN "ot_after_hours" TO "standard_shift_hours";
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='main' AND table_name='outlet_tier_rate' AND column_name='standard_shift_hours') THEN
    ALTER TABLE "main"."outlet_tier_rate" ADD COLUMN "standard_shift_hours" numeric(6, 2);
  END IF;
END $$;
--> statement-breakpoint
-- outlet_drink_menu.outlet_id: add NULLABLE → backfill via the workspace FK → lock NOT NULL.
ALTER TABLE "main"."outlet_drink_menu" ADD COLUMN IF NOT EXISTS "outlet_id" uuid;--> statement-breakpoint
UPDATE "main"."outlet_drink_menu" m SET "outlet_id" = w."outlet_id" FROM "main"."outlet_workspace" w WHERE m."workspace_id" = w."id" AND m."outlet_id" IS NULL;--> statement-breakpoint
ALTER TABLE "main"."outlet_drink_menu" ALTER COLUMN "outlet_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."outlet_drink_menu" ADD COLUMN IF NOT EXISTS "category" varchar(20) DEFAULT 'service' NOT NULL;--> statement-breakpoint
-- outlet_tier_rate.outlet_id: same add → backfill → lock.
ALTER TABLE "main"."outlet_tier_rate" ADD COLUMN IF NOT EXISTS "outlet_id" uuid;--> statement-breakpoint
UPDATE "main"."outlet_tier_rate" r SET "outlet_id" = w."outlet_id" FROM "main"."outlet_workspace" w WHERE r."workspace_id" = w."id" AND r."outlet_id" IS NULL;--> statement-breakpoint
ALTER TABLE "main"."outlet_tier_rate" ALTER COLUMN "outlet_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."payment_voucher_line" ADD COLUMN IF NOT EXISTS "receipt_id" uuid;--> statement-breakpoint
ALTER TABLE "main"."payment_voucher_line" ADD COLUMN IF NOT EXISTS "proof_photos" jsonb;--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "check_in_lat" numeric(10, 8);--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "check_in_lng" numeric(11, 8);--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "check_in_distance_m" integer;--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "check_in_accuracy_m" integer;--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "check_out_lat" numeric(10, 8);--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "check_out_lng" numeric(11, 8);--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "check_out_distance_m" integer;--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "check_out_accuracy_m" integer;--> statement-breakpoint
ALTER TABLE "main"."user_profile" ADD COLUMN IF NOT EXISTS "comcard_image" varchar;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "main"."payment_voucher_receipt" ADD CONSTRAINT "payment_voucher_receipt_voucher_id_payment_voucher_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "main"."payment_voucher"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "main"."payment_voucher_receipt" ADD CONSTRAINT "payment_voucher_receipt_shift_assignment_id_shift_assignment_id_fk" FOREIGN KEY ("shift_assignment_id") REFERENCES "main"."shift_assignment"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "main"."outlet_drink_menu" ADD CONSTRAINT "outlet_drink_menu_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "main"."outlet"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "main"."outlet_tier_rate" ADD CONSTRAINT "outlet_tier_rate_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "main"."outlet"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "main"."payment_voucher_line" ADD CONSTRAINT "payment_voucher_line_receipt_id_payment_voucher_receipt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "main"."payment_voucher_receipt"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
