-- WHICH SHIFT A VENUE'S VERDICT WAS WRITTEN ABOUT.
--
-- `rating` is unique on (outlet_id, pr_id): one CURRENT verdict per PR per
-- venue, deliberately not a per-shift log. That stays. What was missing is the
-- attribution — the row recorded who was rated and where, but never which night
-- it was about, so nothing could answer "which agency staffed that shift".
--
-- Without it an agency's read scope could only ask the looser question "did I
-- ever supply this PR to this venue", which hands a rating to BOTH agencies once
-- the same PR works the same venue through two of them. An agency is not
-- supposed to see a score earned on a rival's shift, nor learn the PR is on a
-- rival's roster.
--
-- NULLABLE on purpose, and ON DELETE SET NULL:
--   * legacy rows predate the link and have no honest answer;
--   * deleting an assignment must not delete the venue's opinion of a PR.
-- A NULL is read as "not attributable", which makes it invisible to every
-- agency rather than visible to all of them — the safe direction for a column
-- whose whole job is confining who may read the row.
ALTER TABLE "main"."rating" ADD COLUMN IF NOT EXISTS "shift_assignment_id" uuid;
--> statement-breakpoint
ALTER TABLE "main"."rating" ADD CONSTRAINT "rating_shift_assignment_id_fk" FOREIGN KEY ("shift_assignment_id") REFERENCES "main"."shift_assignment"("id") ON DELETE SET NULL ON UPDATE no action;
--> statement-breakpoint
-- Backfill: attribute each existing verdict to the LATEST shift that PR actually
-- worked at that venue. The rating UI fires straight after a shift is sealed, so
-- for a verdict written under the old code the most recent night at that venue
-- is the night it was about.
--
-- Deploying without this would blank the attribution of every rating already in
-- the database and drop them all out of the agency view at once. Only fills rows
-- still NULL, so re-running cannot overwrite a real link.
--
-- `rating.pr_id` is varchar and `shift_assignment.pr_id` is uuid (the column is
-- deliberately not a FK), so the cast is required — without it Postgres refuses
-- the comparison rather than quietly matching nothing.
UPDATE "main"."rating" r
SET "shift_assignment_id" = latest."id"
FROM (
  SELECT DISTINCT ON (s."outlet_id", sa."pr_id")
         sa."id", s."outlet_id", sa."pr_id"
  FROM "main"."shift_assignment" sa
  JOIN "main"."shift" s ON s."id" = sa."shift_id"
  ORDER BY s."outlet_id", sa."pr_id", s."shift_date" DESC, sa."created_at" DESC
) AS latest
WHERE r."outlet_id" = latest."outlet_id"
  AND r."pr_id" = latest."pr_id"::text
  AND r."shift_assignment_id" IS NULL;
