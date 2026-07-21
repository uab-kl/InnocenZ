-- special_service: support PR-initiated job postings.
--
-- Reuses the existing special_service table (no new table). Two additive changes:
--   1. 'pr' joins the special_service_initiated_by enum, alongside outlet/agency.
--   2. posting_pr_id FK -> main.pr(id). The PR's display name is joined from
--      pr.name on read; it is never copied onto this row (no name column).
--
-- The new enum value is only added here, not used in this migration, so it is
-- safe to add inside the migration transaction (Postgres 12+).

ALTER TYPE "main"."special_service_initiated_by" ADD VALUE IF NOT EXISTS 'pr';--> statement-breakpoint

ALTER TABLE "main"."special_service" ADD COLUMN IF NOT EXISTS "posting_pr_id" uuid;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "main"."special_service" ADD CONSTRAINT "special_service_posting_pr_id_pr_id_fk" FOREIGN KEY ("posting_pr_id") REFERENCES "main"."pr"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
