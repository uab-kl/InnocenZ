ALTER TABLE "main"."user_profile" ADD COLUMN IF NOT EXISTS "gender" varchar(20);--> statement-breakpoint
ALTER TABLE "main"."user_profile" ADD COLUMN IF NOT EXISTS "race" varchar(50);--> statement-breakpoint
ALTER TABLE "main"."user_profile" ADD COLUMN IF NOT EXISTS "portfolio_photos" jsonb;--> statement-breakpoint
ALTER TABLE "main"."user_profile" ADD COLUMN IF NOT EXISTS "comcard_height_cm" integer;--> statement-breakpoint
ALTER TABLE "main"."user_profile" ADD COLUMN IF NOT EXISTS "comcard_weight_kg" integer;
