-- One person must be ONE pr row.
--
-- Seeding created a second `pr` row for some users (one per agency), so the
-- same person showed twice on an agency roster — once approved, once pending.
-- This merges each user's duplicate rows into the oldest one, keeps the
-- strongest approval status when both rows pointed at the same agency, moves
-- every operational reference across, and then makes the duplicate
-- impossible with a unique constraint on pr.user_id.
--
-- Nothing operational is lost: links, vouchers, assignments, sales and
-- postings are all repointed to the surviving row before the extra row goes.

CREATE TEMP TABLE pr_merge_map AS
SELECT p.id AS loser_id, k.keep_id
FROM "main"."pr" p
JOIN (
  SELECT user_id, (array_agg(id ORDER BY created_at, id))[1] AS keep_id
  FROM "main"."pr"
  WHERE user_id IS NOT NULL
  GROUP BY user_id
  HAVING count(*) > 1
) k ON k.user_id = p.user_id
WHERE p.id <> k.keep_id;

-- Same person + same agency on both rows: the stronger status wins.
UPDATE "main"."agency_pr" survivor
SET approve_status = loser.approve_status,
    updated_at = now(),
    updated_by = 'merge-duplicate-pr'
FROM "main"."agency_pr" loser
JOIN pr_merge_map m ON m.loser_id = loser.pr_id
WHERE survivor.pr_id = m.keep_id
  AND survivor.agency_id = loser.agency_id
  AND (CASE loser.approve_status WHEN 'approved' THEN 3 WHEN 'pending' THEN 2 ELSE 1 END)
    > (CASE survivor.approve_status WHEN 'approved' THEN 3 WHEN 'pending' THEN 2 ELSE 1 END);

-- Drop the now-redundant duplicate link.
DELETE FROM "main"."agency_pr" loser
USING pr_merge_map m
WHERE loser.pr_id = m.loser_id
  AND EXISTS (
    SELECT 1 FROM "main"."agency_pr" s
    WHERE s.pr_id = m.keep_id AND s.agency_id = loser.agency_id
  );

-- Links the survivor did not already have simply move across.
UPDATE "main"."agency_pr" l
SET pr_id = m.keep_id, updated_at = now(), updated_by = 'merge-duplicate-pr'
FROM pr_merge_map m
WHERE l.pr_id = m.loser_id;

-- Operational history follows the surviving PR row.
UPDATE "main"."payment_voucher" t SET pr_id = m.keep_id
FROM pr_merge_map m WHERE t.pr_id = m.loser_id;
UPDATE "main"."shift_assignment" t SET pr_id = m.keep_id
FROM pr_merge_map m WHERE t.pr_id = m.loser_id;
UPDATE "main"."shift_sale" t SET pr_id = m.keep_id
FROM pr_merge_map m WHERE t.pr_id = m.loser_id;
UPDATE "main"."special_service" t SET posting_pr_id = m.keep_id
FROM pr_merge_map m WHERE t.posting_pr_id = m.loser_id;

DELETE FROM "main"."pr" p USING pr_merge_map m WHERE p.id = m.loser_id;

DROP TABLE pr_merge_map;

-- NULL user_id stays allowed (PRs with no account yet); Postgres treats NULLs
-- as distinct, so only real accounts are constrained to one row each.
ALTER TABLE "main"."pr" ADD CONSTRAINT "pr_user_id_unique" UNIQUE ("user_id");
