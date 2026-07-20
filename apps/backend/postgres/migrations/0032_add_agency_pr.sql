-- agency_pr: which agencies a PR is under.
--
-- A PR can be under many agencies. main.pr.agency_id is a single NOT NULL
-- column and cannot express that, so this join table takes over the
-- relationship. approve_status records whether the agency has approved the PR.
--
-- pr.agency_id is deliberately LEFT IN PLACE. Every read path today filters PRs
-- by it (roster, shifts, payroll, tenant scoping in pr.controller.ts and
-- shift.controller.ts), so dropping it here would break all of them at once.
-- It stays as the PR's originating agency and is dropped in a follow-up once
-- those reads select through agency_pr instead.
--
-- Backfilled from the existing pr rows as 'approved' — those links are already
-- live and in use, so they are not pending anyone's approval.

DO $$ BEGIN
  CREATE TYPE "main"."agency_pr_approve_status" AS ENUM('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "main"."agency_pr" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid NOT NULL,
  "pr_id" uuid NOT NULL,
  "approve_status" "main"."agency_pr_approve_status" DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" varchar NOT NULL,
  "updated_by" varchar NOT NULL,
  CONSTRAINT "agency_pr_agency_id_pr_id_unique" UNIQUE("agency_id","pr_id")
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "main"."agency_pr" ADD CONSTRAINT "agency_pr_agency_id_agency_id_fk"
    FOREIGN KEY ("agency_id") REFERENCES "main"."agency"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "main"."agency_pr" ADD CONSTRAINT "agency_pr_pr_id_pr_id_fk"
    FOREIGN KEY ("pr_id") REFERENCES "main"."pr"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

INSERT INTO "main"."agency_pr" ("agency_id", "pr_id", "approve_status", "created_by", "updated_by")
SELECT "agency_id", "id", 'approved', 'system', 'system'
FROM "main"."pr"
ON CONFLICT ("agency_id", "pr_id") DO NOTHING;
