-- Persist the PR's auto-generated photo comcard on the existing user_profile
-- row (same table as portfolio / height / weight). Path only — name/age live
-- on user + user_profile via FK, not duplicated here.
ALTER TABLE "main"."user_profile" ADD COLUMN IF NOT EXISTS "comcard_image" varchar;
