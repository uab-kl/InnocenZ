-- 0123 — `agency_outlet`: an outlet reaches MANY agencies, by invitation and
-- approval, instead of exactly one.
--
-- Until now a venue reached exactly one agency because
-- `outlet.onboarded_by_agency_id` was quietly doing THREE different jobs:
--
--   1. routing     — POST /shift stamped `shift.agency_id` from it
--   2. visibility  — the agency portal's whole outlet list was
--                    `GET /outlet?onboardedByAgencyId=`
--   3. provenance  — who signed this venue up (singular and historical)
--
-- Only (3) is actually a property of the outlet. (1) and (2) are properties of
-- a RELATIONSHIP, and a relationship that can have many rows does not belong in
-- a column on one side of it. This table is that relationship.
--
-- Deliberately mirrors `agency_pr` field for field — same approval semantics,
-- same enum shape, same reject_reason. A venue asking to work with an agency is
-- the same act as a PR asking to join one, so it should not become a second,
-- differently-shaped mechanism. Approve once, then post freely, exactly as a PR
-- is approved once and then rostered freely.
--
-- `onboarded_by_agency_id` is NOT dropped here, and that is on purpose:
--   * dropping it is a data-loss migration on a shared DB with a broken journal
--     — real risk, and nothing gained;
--   * it still answers a genuine question (who brought this venue in), which is
--     a DIFFERENT fact from who may staff it today;
--   * migration 0113 already used it as a historical backfill source.
-- It is demoted to pure provenance. Nothing behavioural may read it again —
-- the danger was never the column, it is a reader left behind.
--
-- THE BACKFILL AT THE BOTTOM IS NOT OPTIONAL. The agency portal's outlet list
-- is about to start reading this table; if the existing links are not carried
-- across in the same file, every agency portal goes blank the moment this
-- deploys. Existing links land as `approved` because they already are —
-- re-asking live venues to request permission they were already granted would
-- be a regression dressed as a migration.
--
-- Fully idempotent — the shared innocenz-test DB has a second writer, so every
-- statement here must be safe to re-run.

DO $$ BEGIN
 CREATE TYPE "main"."agency_outlet_approve_status" AS ENUM('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "main"."agency_outlet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"approve_status" "main"."agency_outlet_approve_status" DEFAULT 'pending' NOT NULL,
	"reject_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar DEFAULT 'system' NOT NULL,
	"updated_by" varchar DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."agency_outlet" ADD CONSTRAINT "agency_outlet_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "main"."agency"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."agency_outlet" ADD CONSTRAINT "agency_outlet_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "main"."outlet"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- One link per (agency, outlet). This is also the ON CONFLICT target the
-- backfill below and every upsert in AgencyOutletRepository rely on — without
-- it those upserts silently become blind inserts and a venue accumulates
-- duplicate requests to the same agency.
CREATE UNIQUE INDEX IF NOT EXISTS "agency_outlet_agency_outlet_idx" ON "main"."agency_outlet" ("agency_id","outlet_id");
--> statement-breakpoint
-- The agency portal reads "my venues" on every page load; the outlet settings
-- screen reads "my agencies". The unique index above already serves the first
-- direction; this one serves the second.
CREATE INDEX IF NOT EXISTS "agency_outlet_outlet_id_idx" ON "main"."agency_outlet" ("outlet_id");
--> statement-breakpoint
-- ── THE BACKFILL ─────────────────────────────────────────────────────────────
-- Every outlet that already has an onboarding agency keeps working with it,
-- already approved. `created_by` records where the row came from, so a
-- backfilled link stays distinguishable from one a venue actually requested.
INSERT INTO "main"."agency_outlet" (
	"agency_id", "outlet_id", "approve_status",
	"created_at", "updated_at", "created_by", "updated_by"
)
SELECT
	o."onboarded_by_agency_id",
	o."id",
	'approved'::"main"."agency_outlet_approve_status",
	now(), now(), 'migration_0123', 'migration_0123'
FROM "main"."outlet" o
WHERE o."onboarded_by_agency_id" IS NOT NULL
ON CONFLICT ("agency_id", "outlet_id") DO NOTHING;
