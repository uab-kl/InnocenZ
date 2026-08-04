-- Comcard body sizes: height/weight already exist; add the standard 3 dimensions
-- (bust / waist / hip in cm) used on PR comcards.
ALTER TABLE "main"."user_profile" ADD COLUMN IF NOT EXISTS "comcard_bust_cm" integer;--> statement-breakpoint
ALTER TABLE "main"."user_profile" ADD COLUMN IF NOT EXISTS "comcard_waist_cm" integer;--> statement-breakpoint
ALTER TABLE "main"."user_profile" ADD COLUMN IF NOT EXISTS "comcard_hip_cm" integer;
