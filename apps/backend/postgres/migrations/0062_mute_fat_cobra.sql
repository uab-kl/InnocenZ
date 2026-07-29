-- Phase C: the notification table. Guarded throughout because this is the SHARED
-- database and both branches migrate it — a half-applied run must be re-runnable.
-- Postgres has no CREATE TYPE IF NOT EXISTS, hence the exception block.
DO $$ BEGIN
	CREATE TYPE "main"."notification_kind" AS ENUM('payment_voucher_issued', 'payment_voucher_dispute_resolved', 'overtime_pending_approval', 'shift_assigned', 'shift_cancelled', 'agency_join_resolved');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "main"."notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "main"."notification_kind" NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"payload" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "main"."notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "main"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;