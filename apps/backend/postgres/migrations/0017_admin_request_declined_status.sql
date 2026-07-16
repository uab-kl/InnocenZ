ALTER TYPE "main"."admin_request_status" ADD VALUE IF NOT EXISTS 'declined';--> statement-breakpoint
ALTER TABLE "main"."admin_request" ADD COLUMN IF NOT EXISTS "requested_plan_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "main"."admin_request" ADD CONSTRAINT "admin_request_requested_plan_id_subscription_id_fk" FOREIGN KEY ("requested_plan_id") REFERENCES "main"."subscription"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
