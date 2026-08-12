-- Penalty rules move from the OUTLET to the AGENCY.
--
-- They were stored on `outlet_penalty_rule` (child of outlet_workspace) but the
-- money they produce is agency→PR: a breach becomes a `deduction` on the PR's
-- payment voucher, which the outlet neither pays nor sees. Two of the three
-- rules are not even outlet-observable — `min_shifts_per_week` counts shifts
-- across every venue a PR worked, and `max_mc_per_month` counts MC that only
-- the agency approves. Under per-outlet rules a PR who works 2 shifts at each
-- of two venues has worked 4, yet BOTH outlets fine her for missing a 3-shift
-- minimum. Same for MC: fined once per outlet for leave granted once.
--
-- The live data agreed before this ran: 6 rows, two outlets, one agency,
-- IDENTICAL settings on both — nobody was using the per-outlet dimension.
--
-- The copy below is therefore unambiguous, but it is still written to survive
-- the case it was not: DISTINCT ON keeps the most recently updated row per
-- (agency, rule_type), so a conflict resolves to the newest edit rather than to
-- whichever row the planner happened to emit first.
DO $$ BEGIN
 CREATE TYPE "main"."penalty_rule_type" AS ENUM('min_shifts_per_week', 'max_mc_per_month', 'late_per_week');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "main"."agency_penalty_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"rule_type" "main"."penalty_rule_type" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"applies_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fine_rm" numeric(12, 2) DEFAULT '0' NOT NULL,
	"min_shifts_per_week" integer,
	"max_mc_per_month" integer,
	"fine_per_excess_rm" numeric(12, 2),
	"max_late_per_week" integer,
	"grace_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar DEFAULT 'system' NOT NULL,
	"updated_by" varchar DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."agency_penalty_rule" ADD CONSTRAINT "agency_penalty_rule_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "main"."agency"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- One rule of each type per agency. This is the constraint the old shape could
-- not express, and its absence is exactly what let one PR be fined twice.
CREATE UNIQUE INDEX IF NOT EXISTS "agency_penalty_rule_agency_rule_type_idx" ON "main"."agency_penalty_rule" ("agency_id","rule_type");
--> statement-breakpoint
INSERT INTO "main"."agency_penalty_rule" (
	"agency_id", "rule_type", "enabled", "applies_to", "fine_rm",
	"min_shifts_per_week", "max_mc_per_month", "fine_per_excess_rm",
	"max_late_per_week", "grace_minutes",
	"created_at", "updated_at", "created_by", "updated_by"
)
SELECT DISTINCT ON (o."onboarded_by_agency_id", r."rule_type")
	o."onboarded_by_agency_id",
	-- Old enum → new enum: PostgreSQL has no direct cast between two enum
	-- types, so it goes via text. The value set is identical.
	r."rule_type"::text::"main"."penalty_rule_type",
	r."enabled", r."applies_to", r."fine_rm",
	r."min_shifts_per_week", r."max_mc_per_month", r."fine_per_excess_rm",
	r."max_late_per_week", r."grace_minutes",
	r."created_at", r."updated_at", r."created_by", r."updated_by"
FROM "main"."outlet_penalty_rule" r
JOIN "main"."outlet_workspace" w ON w."id" = r."workspace_id"
JOIN "main"."outlet" o           ON o."id" = w."outlet_id"
WHERE o."onboarded_by_agency_id" IS NOT NULL
ORDER BY o."onboarded_by_agency_id", r."rule_type", r."updated_at" DESC
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DROP TABLE IF EXISTS "main"."outlet_penalty_rule";
--> statement-breakpoint
DROP TYPE IF EXISTS "main"."outlet_penalty_rule_type";
