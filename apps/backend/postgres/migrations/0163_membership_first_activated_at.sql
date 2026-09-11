-- "Was this person ever really a member?" — recorded, not deduced.
--
-- Owner, 11 Sep 2026: "fix the bugs".
--
-- WHAT THIS REPLACES. Telling a DECLINED applicant from a DEACTIVATED
-- colleague is the distinction migration 0162 exists to hold, and it is decided
-- at the moment somebody is removed: a request that was never approved becomes
-- `rejected`, a real membership becomes `inactive`.
--
-- `removalStatusFor` answered that question by INFERENCE — it asked "does this
-- row hold a real member id, or the `INNPND` placeholder?", because 0161
-- established that a real id is minted only on approval. That inference is
-- sound today, and it is the rule the 0162 backfill used. But it chains two
-- separate facts, and the second one turned out to be written in FIVE different
-- places (both `add()` twins, both approval paths, and invite-accept) — one of
-- which had already forgotten it, leaving an active member stamped `INNPND`
-- forever. So the correctness of "were you ever a member" depended on every one
-- of those five sites continuing to behave. Any future path that minted an id
-- early would silently start labelling former colleagues as people who had
-- never been on the team.
--
-- So the fact is now STORED. A row that has ever been active carries a
-- timestamp; one that never got in carries NULL. The question is answered by
-- data rather than by a deduction about a different column, and the two rules
-- stop depending on each other.
--
-- ⚠️ NOT AN AUDIT COLUMN, and deliberately not part of the audit quartet. The
-- quartet (`created_at` / `updated_at` / `created_by` / `updated_by`) says when
-- the ROW changed and who changed it, and `updated_at` churns on every edit.
-- This says when the PERSON first joined, and is written exactly once —
-- `WHERE first_activated_at IS NULL` — because a second activation is a
-- RE-join, and the first one is the fact that matters here.
--
-- It also answers a question nothing could answer before: when did this person
-- join this organisation?
ALTER TABLE "main"."agency_user"
  ADD COLUMN IF NOT EXISTS "first_activated_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "main"."outlet_user"
  ADD COLUMN IF NOT EXISTS "first_activated_at" timestamp with time zone;
--> statement-breakpoint

-- BACKFILL — every row that has demonstrably been active.
--
-- Two groups, and the second is the one that matters: a row that is active NOW,
-- and a row that holds a REAL organisation id, which could only have come from
-- an approval that actually happened. That second group is exactly the set 0162
-- called `inactive` rather than `rejected`, so this preserves the
-- classification those screens already show rather than re-deciding it.
--
-- ⚠️ THE DATE IS AN APPROXIMATION FOR OLDER ROWS, and that is acceptable
-- because of what the column is FOR. Nothing recorded the moment of approval
-- before today, so `created_at` is the best available answer: exact for the
-- many rows created active (organisation sign-up, invite-accept, every seed),
-- and early for a row that sat pending first. The question this column exists
-- to answer is whether a value is PRESENT at all; the precision of the date is
-- secondary, and every row written from here on carries the real moment.
UPDATE "main"."agency_user"
SET "first_activated_at" = "created_at"
WHERE "first_activated_at" IS NULL
  AND ("status" = 'active' OR "member_code" NOT LIKE 'INNPND%');
--> statement-breakpoint

UPDATE "main"."outlet_user"
SET "first_activated_at" = "created_at"
WHERE "first_activated_at" IS NULL
  AND ("status" = 'active' OR "member_code" NOT LIKE 'INNPND%');
