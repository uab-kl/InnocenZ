-- agency_pr: key membership by user account, not pr row.
-- Pre-account PRs (pr.user_id IS NULL) stay on pr.agency_id only.

ALTER TABLE "main"."agency_pr"
  ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint

UPDATE "main"."agency_pr" ap
SET "user_id" = p."user_id"
FROM "main"."pr" p
WHERE p."id" = ap."pr_id";--> statement-breakpoint

DELETE FROM "main"."agency_pr" WHERE "user_id" IS NULL;--> statement-breakpoint

-- Collapse duplicates if two pr rows linked the same (agency, user)
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY agency_id, user_id
      ORDER BY
        CASE approve_status::text
          WHEN 'approved' THEN 3
          WHEN 'pending' THEN 2
          ELSE 1
        END DESC,
        created_at ASC,
        id ASC
    ) AS rn
  FROM "main"."agency_pr"
)
DELETE FROM "main"."agency_pr" ap
USING ranked r
WHERE ap.id = r.id AND r.rn > 1;--> statement-breakpoint

ALTER TABLE "main"."agency_pr"
  ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "main"."agency_pr"
  DROP CONSTRAINT IF EXISTS "agency_pr_pr_id_pr_id_fk";--> statement-breakpoint

ALTER TABLE "main"."agency_pr"
  DROP CONSTRAINT IF EXISTS "agency_pr_agency_id_pr_id_unique";--> statement-breakpoint

ALTER TABLE "main"."agency_pr"
  DROP COLUMN IF EXISTS "pr_id";--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "main"."agency_pr"
    ADD CONSTRAINT "agency_pr_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "main"."user"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "main"."agency_pr"
    ADD CONSTRAINT "agency_pr_agency_id_user_id_unique"
    UNIQUE ("agency_id", "user_id");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
