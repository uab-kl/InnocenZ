DO $$ BEGIN
 CREATE TYPE "main"."payment_voucher_status" AS ENUM('pending_review', 'sent', 'signed', 'paid', 'disputed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "main"."payment_voucher_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voucher_id" uuid NOT NULL,
	"line_date" date,
	"outlet" varchar(255),
	"description" varchar(500) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"ref" varchar(100),
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "main"."payment_voucher" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"pr_id" uuid,
	"pr_name" varchar(255) NOT NULL,
	"pr_ic" varchar(100),
	"outlet" varchar(255),
	"cycle" varchar(100),
	"issued_date" date,
	"due_date" date,
	"week_start" date,
	"week_end" date,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"deduction" numeric(12, 2) DEFAULT '0' NOT NULL,
	"net" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" "main"."payment_voucher_status" DEFAULT 'pending_review' NOT NULL,
	"finance_head_name" varchar(255),
	"finance_head_signed_at" timestamp with time zone,
	"pr_signed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"bank_ref" varchar(100),
	"dispute_reason" varchar(1000),
	"disputed_at" timestamp with time zone,
	"dispute_note" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."payment_voucher_line" ADD CONSTRAINT "payment_voucher_line_voucher_id_payment_voucher_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "main"."payment_voucher"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."payment_voucher" ADD CONSTRAINT "payment_voucher_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "main"."agency"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."payment_voucher" ADD CONSTRAINT "payment_voucher_pr_id_pr_id_fk" FOREIGN KEY ("pr_id") REFERENCES "main"."pr"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
