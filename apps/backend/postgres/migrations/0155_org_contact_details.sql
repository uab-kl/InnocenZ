-- Keep what organisation sign-up already asks for.
--
-- The form collects a contact person, a contact email and a contact phone, and
-- an old-format registration number. Only SOME of that had a column to land in:
--
--   agency  had contact_name / contact_email / contact_phone, no business_license
--   outlet  had business_license, none of the three contact columns
--
-- So a venue's contact email and phone were read from the request, assigned to
-- local variables in `createOrgForSignup`, and then never written — and an
-- agency's old registration number went the same way. Neither loss was visible:
-- both screens simply have nothing to show, which reads like "they left it
-- blank" rather than "we threw it away".
--
-- Owner, 9 Sep 2026: "what user put in sign up page is store to the database".
--
-- The two tables are made symmetric rather than inventing a third: an
-- organisation is an organisation, and the same four questions are asked of
-- both. Nullable throughout, because every row that already exists answered
-- none of them.
ALTER TABLE "main"."outlet" ADD COLUMN IF NOT EXISTS "contact_name" varchar(100);
--> statement-breakpoint
ALTER TABLE "main"."outlet" ADD COLUMN IF NOT EXISTS "contact_email" varchar(255);
--> statement-breakpoint
ALTER TABLE "main"."outlet" ADD COLUMN IF NOT EXISTS "contact_phone" varchar(50);
--> statement-breakpoint
ALTER TABLE "main"."agency" ADD COLUMN IF NOT EXISTS "business_license" varchar(100);
