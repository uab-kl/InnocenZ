-- agency_member -> agency_user, outlet_member -> outlet_user.
--
-- Both tables now mean exactly one thing: who can sign into the portal. The
-- PR-to-agency relationship they were doubling as moved to main.agency_pr in
-- migration 0032.
--
-- 1. The 10 sub_role='pr' rows are deleted. A PR is not a portal operator, and
--    agency_pr already carries every one of those links (backfilled from
--    pr.agency_id, which is the same relationship these rows encoded).
--
-- 2. sub_role is KEPT but narrowed to owner|finance. It is the only input that
--    decides agency_finance vs agency_owner in the portal permission matrix
--    (agency-identity.ts), so dropping the column outright would silently
--    promote every finance operator to owner. Narrowing the enum instead means
--    a PR can never be inserted here again, which was the point.
--
-- Postgres cannot remove a value from an enum in place, so the type is rebuilt
-- and swapped. outlet_user keeps all three of its sub-roles and only has its
-- enum renamed for symmetry.

DELETE FROM "main"."agency_member" WHERE "sub_role" = 'pr';--> statement-breakpoint

CREATE TYPE "main"."agency_user_sub_role" AS ENUM('owner', 'finance');--> statement-breakpoint

ALTER TABLE "main"."agency_member"
  ALTER COLUMN "sub_role" TYPE "main"."agency_user_sub_role"
  USING "sub_role"::text::"main"."agency_user_sub_role";--> statement-breakpoint

DROP TYPE "main"."agency_member_sub_role";--> statement-breakpoint

ALTER TYPE "main"."outlet_member_sub_role" RENAME TO "outlet_user_sub_role";--> statement-breakpoint

ALTER TABLE "main"."agency_member" RENAME TO "agency_user";--> statement-breakpoint
ALTER TABLE "main"."outlet_member" RENAME TO "outlet_user";
