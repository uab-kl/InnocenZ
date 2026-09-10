-- 0160 — a job title belongs to a MEMBERSHIP, not to a person.
--
-- Owner, 10 Sep 2026: *"make them per org as they are not always the same
-- position in different orgs"* and *"it should only change for the
-- organisation, not all organisation, because that person might have different
-- job titles with different organisation"*.
--
-- This reverses 0107, which dropped `sub_role` from both membership tables on
-- the reasoning that "agency_user / outlet_user are tenancy only (which org)"
-- and the lane belonged on `user_role`. That reasoning had one flaw: `user_role`
-- is `(user_id, role_id)` with no organisation on it and `role` carries only
-- `portal_id`, so the lane it holds is per-PORTAL — one title per person for
-- every agency they will ever join. Somebody who is Finance at one agency and
-- Owner at another is not representable, and changing their title at one
-- rewrites it at the other.
--
-- DIVISION OF LABOUR after this migration:
--   * `user_role` → MAY THIS PERSON OPEN THE AGENCY / OUTLET PORTAL AT ALL.
--     Unchanged, still global, still what `requireRole('agency')` reads.
--   * `agency_user.sub_role` / `outlet_user.sub_role` → WHICH TITLE AT THIS
--     ORGANISATION. New, per membership, and the only answer to that question.
--
-- varchar(50), NOT an enum: 0102 made the same call for the sibling column
-- `org_member_invite.sub_role`, and 0033 is the receipt for why — removing one
-- value from an enum meant rebuilding the type and swapping the column. The two
-- enum TYPEs 0107 destroyed (`main.agency_user_sub_role`,
-- `main.outlet_user_sub_role`) are deliberately NOT recreated.
--
-- ⚠️ NO DEFAULT, on purpose. 0033 warns that losing this distinction "would
-- silently promote every finance operator to owner"; a `DEFAULT 'owner'` would
-- reintroduce exactly that on every future insert that forgets the column.
-- Every insert site is updated in the same change to pass it explicitly.

ALTER TABLE "main"."agency_user" ADD COLUMN IF NOT EXISTS "sub_role" varchar(50);
--> statement-breakpoint

ALTER TABLE "main"."outlet_user" ADD COLUMN IF NOT EXISTS "sub_role" varchar(50);
--> statement-breakpoint

-- BACKFILL, from the only source that exists today: the person's portal role.
--
-- One row per person, choosing by the owner's stated precedence — the same
-- LANE_RANK that `scripts/backfill-member-codes.ts` already uses (owner 0,
-- guarantor 1, finance 2, operations_head 3, director 4). It is needed: one live
-- account (outlet@gmail.com at 4Gays Club) holds BOTH Owner@outlet and
-- Finance@outlet, and today's `laneFromRoleHints` picks between them with a bare
-- `.find()` and no ordering — so that person's title is currently
-- nondeterministic. This resolves it deliberately rather than freezing whichever
-- row Postgres happened to emit.
--
-- ⚠️ NO OWNER FALLBACK. An unrecognised or missing role leaves NULL so the
-- assert below fails loudly and names the count. The runtime code does the
-- opposite — every step of `laneFromRoleHints` falls back to owner — which is
-- how a member with no role reads as a full-privilege owner today. A migration
-- must not inherit that: writing a wrong owner here would be permanent.
UPDATE "main"."agency_user" au
   SET "sub_role" = pick.lane
  FROM (
    SELECT DISTINCT ON (ur.user_id)
           ur.user_id,
           CASE lower(r.role_name)
             WHEN 'owner'     THEN 'owner'
             WHEN 'finance'   THEN 'finance'
             WHEN 'director'  THEN 'director'
             WHEN 'guarantor' THEN 'guarantor'
           END AS lane
      FROM "main"."user_role" ur
      JOIN "main"."role" r   ON r.id = ur.role_id
      JOIN "main"."portal" p ON p.id = r.portal_id
     WHERE p.code = 'agency'
       AND lower(r.role_name) IN ('owner', 'finance', 'director', 'guarantor')
     ORDER BY ur.user_id,
              CASE lower(r.role_name)
                WHEN 'owner'     THEN 0
                WHEN 'guarantor' THEN 1
                WHEN 'finance'   THEN 2
                WHEN 'director'  THEN 4
              END
  ) AS pick
 WHERE pick.user_id = au.user_id
   AND au."sub_role" IS NULL;
--> statement-breakpoint

UPDATE "main"."outlet_user" ou
   SET "sub_role" = pick.lane
  FROM (
    SELECT DISTINCT ON (ur.user_id)
           ur.user_id,
           CASE
             WHEN lower(r.role_name) = 'owner'     THEN 'owner'
             WHEN lower(r.role_name) = 'finance'   THEN 'finance'
             WHEN lower(r.role_name) = 'director'  THEN 'director'
             WHEN lower(r.role_name) = 'guarantor' THEN 'guarantor'
             WHEN lower(r.role_name) IN ('ops head', 'ops_head', 'operations head', 'operations_head', 'ops')
               THEN 'operations_head'
           END AS lane
      FROM "main"."user_role" ur
      JOIN "main"."role" r   ON r.id = ur.role_id
      JOIN "main"."portal" p ON p.id = r.portal_id
     WHERE p.code = 'outlet'
       AND lower(r.role_name) IN (
         'owner', 'finance', 'director', 'guarantor',
         'ops head', 'ops_head', 'operations head', 'operations_head', 'ops'
       )
     ORDER BY ur.user_id,
              CASE
                WHEN lower(r.role_name) = 'owner'     THEN 0
                WHEN lower(r.role_name) = 'guarantor' THEN 1
                WHEN lower(r.role_name) = 'finance'   THEN 2
                WHEN lower(r.role_name) IN ('ops head', 'ops_head', 'operations head', 'operations_head', 'ops')
                  THEN 3
                WHEN lower(r.role_name) = 'director'  THEN 4
              END
  ) AS pick
 WHERE pick.user_id = ou.user_id
   AND ou."sub_role" IS NULL;
--> statement-breakpoint

-- CORRECTION — the backfill source is CORRUPT for Velvet 23, and copying it
-- would be worse than leaving the column empty.
--
-- 0105 remapped every holder of the bare `outlet` role to Owner@outlet, and
-- `scripts/seed-outlet-roles.ts` had granted that bare role to all three Velvet
-- 23 staff. So today `finance@velvet23.my` (Michelle Lim) and `ops@velvet23.my`
-- (Ahmad Razif) both derive as **Owner** — verified live before writing this.
-- The step above would therefore make the venue's finance operator and its
-- operations head into owners, permanently, on a column that is about to become
-- the authority on what they may do.
--
-- The truth lives in `scripts/seed-sample-orgs.ts` VELVET_TEAM, which is what
-- created them: owner / finance / operations_head. Matched by email, so this is
-- a no-op on any database where those accounts do not exist.
UPDATE "main"."outlet_user" ou
   SET "sub_role" = v.lane
  FROM (VALUES
    ('owner@velvet23.my',   'owner'),
    ('finance@velvet23.my', 'finance'),
    ('ops@velvet23.my',     'operations_head')
  ) AS v(email, lane)
 WHERE ou.user_id = (
   SELECT u.id FROM "main"."user" u WHERE lower(u.email) = v.email
 );
--> statement-breakpoint

-- Fail HERE, naming the counts, rather than letting ALTER TABLE fail with a
-- constraint error that names nothing. 0159's shape, reused.
DO $$
DECLARE
  missing_agency int;
  missing_outlet int;
BEGIN
  SELECT count(*) INTO missing_agency FROM "main"."agency_user" WHERE "sub_role" IS NULL;
  SELECT count(*) INTO missing_outlet FROM "main"."outlet_user" WHERE "sub_role" IS NULL;
  IF missing_agency > 0 OR missing_outlet > 0 THEN
    RAISE EXCEPTION
      'Cannot set NOT NULL: % agency and % outlet membership(s) have no sub_role. Every membership must name a job title; give the unmatched rows a role on the correct portal, or set their sub_role by hand, then re-run.',
      missing_agency, missing_outlet;
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "main"."agency_user" ALTER COLUMN "sub_role" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "main"."outlet_user" ALTER COLUMN "sub_role" SET NOT NULL;
--> statement-breakpoint

-- One membership per person per organisation, now that the row carries a title.
--
-- Neither table has ever had this constraint — checked live against
-- pg_constraint and pg_indexes: only the primary key and a partial member_code
-- index exist. Two active rows for the same person at the same agency would now
-- mean two different job titles at once, with nothing to say which wins.
--
-- PARTIAL on status='active' because removal is a SOFT delete (`remove()` sets
-- status='inactive' and keeps the row). A plain unique index would make a
-- removed member impossible to re-add, which is the opposite of what the
-- Legacy Member screen exists to support.
CREATE UNIQUE INDEX IF NOT EXISTS "agency_user_active_membership_unique"
  ON "main"."agency_user" ("agency_id", "user_id")
  WHERE "status" = 'active';
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "outlet_user_active_membership_unique"
  ON "main"."outlet_user" ("outlet_id", "user_id")
  WHERE "status" = 'active';
