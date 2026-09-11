-- Declining somebody is not the same event as removing them.
--
-- Owner, 11 Sep 2026, looking at a declined applicant still listed in the team
-- roster: "make sure only the member been accepted is the member else cannot be
-- the orgs member why still got show as in the orgs while had been declined",
-- and then the rule itself: "declined is not deactivate — declined is cannot be
-- the user of an orgs; deactivate trigger when there is already a orgs member,
-- but remove by the owner".
--
-- WHAT WAS WRONG. Both events wrote `status: 'inactive'`, because they are the
-- same HTTP call: the Decline button and the Team screen's Remove button both
-- fire `DELETE /:id/members/:memberId`, which lands in `remove()` — a function
-- taking an id and an actor, which therefore cannot know which of the two it is
-- serving. One word was being made to mean two things:
--
--   DECLINED     — asked to join and was turned down. NEVER a member. Has no
--                  history with the organisation and does not belong on its
--                  roster at all.
--   DEACTIVATED  — WAS an active member; the owner removed them. Their history
--                  is real: shifts worked, vouchers raised, an id that was
--                  quoted. They belong on the roster, marked inactive.
--
-- The roster renders every row it is handed, so the declined applicant appeared
-- inside "TEAM · 6 MEMBER(S)" wearing an Inactive pill, beside real colleagues.
--
-- NO SCHEMA CHANGE IS NEEDED, and that is worth saying out loud. Both columns
-- are `varchar(50)` with no CHECK constraint and no PG enum, so a fourth value
-- is accepted as it stands. This migration is a BACKFILL plus this explanation;
-- the vocabulary is tightened in the application layer instead, with a zod enum
-- on the two member-update schemas, because that is where a typo would
-- otherwise be accepted silently and then read as "not active" everywhere.
--
-- ⚠️ HOW A DECLINED ROW IS IDENTIFIED HERE. Not by its status — that is the
-- whole problem. By the MEMBER CODE, exactly as migration 0161 established: a
-- real organisation id is minted only on APPROVAL, so a row still carrying an
-- `INNPND` placeholder was never approved and can only be a turned-down
-- request. A row holding a real id was a member, and stays `inactive`.
--
-- On this database that is precisely one row, and zero genuinely removed
-- members exist yet — so nothing carrying real history is touched.
UPDATE "main"."agency_user"
SET "status" = 'rejected'
WHERE "status" = 'inactive' AND "member_code" LIKE 'INNPND%';
--> statement-breakpoint

UPDATE "main"."outlet_user"
SET "status" = 'rejected'
WHERE "status" = 'inactive' AND "member_code" LIKE 'INNPND%';
