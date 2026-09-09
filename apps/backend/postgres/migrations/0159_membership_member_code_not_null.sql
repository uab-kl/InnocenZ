-- Every membership carries an id too (owner, 9 Sep 2026: "all member code are
-- not null").
--
-- Unlike `user.member_code` (0158), these two CANNOT have a database default:
-- the value is built from the organisation's own prefix — INNATAGY0001 — and a
-- DEFAULT expression cannot reach across to the parent row. So the guarantee is
-- made of two halves, and both must hold:
--
--   * the generator can no longer answer "nothing" — `nextOrgMemberCode`
--     returns a string or throws, and an organisation whose name has no letters
--     now falls back to two letters derived from its own id rather than null;
--   * this constraint, which turns any path that still forgets into a refused
--     write instead of a quiet null.
--
-- The trade the owner accepted: a membership that cannot be given an id is now
-- REFUSED. That is the point — a member without an id is what this whole scheme
-- exists to prevent — but it does mean a broken organisation row fails the
-- sign-up rather than half-completing it.
--
-- No backfill: both columns are already 100% filled (8 of 8 agency, 13 of 13
-- outlet). The assert below says so out loud, so if that stops being true on
-- another database this fails HERE naming the counts, instead of ALTER TABLE
-- failing with a constraint error that names nothing.
DO $$
DECLARE
  missing_agency int;
  missing_outlet int;
BEGIN
  SELECT count(*) INTO missing_agency FROM "main"."agency_user" WHERE "member_code" IS NULL;
  SELECT count(*) INTO missing_outlet FROM "main"."outlet_user" WHERE "member_code" IS NULL;
  IF missing_agency > 0 OR missing_outlet > 0 THEN
    RAISE EXCEPTION
      'Cannot set NOT NULL: % agency and % outlet membership(s) have no member_code. Run scripts/backfill-member-codes.ts first.',
      missing_agency, missing_outlet;
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "main"."agency_user" ALTER COLUMN "member_code" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "main"."outlet_user" ALTER COLUMN "member_code" SET NOT NULL;
