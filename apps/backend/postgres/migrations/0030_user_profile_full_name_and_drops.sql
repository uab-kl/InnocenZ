-- user_profile reshape.
--
-- 1. first_name + last_name collapse into a single full_name. Backfilled with
--    concat_ws so a row carrying only one of the two still keeps that name; the
--    7 rows holding both become "First Last". NULLIF leaves genuinely empty rows
--    NULL rather than storing an empty string.
--
-- 2. under_agency / agency_id are dropped. The agency link already lives on
--    main.pr (pr.agency_id, NOT NULL, FK to agency) and is read through
--    pr.user_id, so keeping a second copy here is the duplicate rule 2 forbids.
--
-- 3. The four accept_* acknowledgement columns are dropped. They are dead
--    storage: NULL on all 12 rows, never written by user-profile.repository.ts,
--    and never read. The signup acknowledgements the UI collects post to
--    /auth/register as ackPersonalInfo / ackDeclarationOfTruth /
--    ackInformationSharing / acceptTerms and do not land here.
--
-- verification_status and verified_at are deliberately left untouched.

ALTER TABLE "main"."user_profile" ADD COLUMN IF NOT EXISTS "full_name" varchar(255);--> statement-breakpoint

UPDATE "main"."user_profile"
SET "full_name" = NULLIF(TRIM(CONCAT_WS(' ', "first_name", "last_name")), '')
WHERE "full_name" IS NULL;--> statement-breakpoint

ALTER TABLE "main"."user_profile" DROP COLUMN IF EXISTS "first_name";--> statement-breakpoint
ALTER TABLE "main"."user_profile" DROP COLUMN IF EXISTS "last_name";--> statement-breakpoint

ALTER TABLE "main"."user_profile" DROP COLUMN IF EXISTS "under_agency";--> statement-breakpoint
ALTER TABLE "main"."user_profile" DROP COLUMN IF EXISTS "agency_id";--> statement-breakpoint

ALTER TABLE "main"."user_profile" DROP COLUMN IF EXISTS "accept_privacy";--> statement-breakpoint
ALTER TABLE "main"."user_profile" DROP COLUMN IF EXISTS "accept_truth";--> statement-breakpoint
ALTER TABLE "main"."user_profile" DROP COLUMN IF EXISTS "accept_agency_share";--> statement-breakpoint
ALTER TABLE "main"."user_profile" DROP COLUMN IF EXISTS "accept_terms";
