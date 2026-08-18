-- 0124 — `shift_agency`: one shift, MANY staffing agencies.
--
-- The outlet picks a subset of its approved agencies (0123) when it posts a
-- job, and every one of them may send PRs to it. A 10-slot shift can end up 6
-- filled by agency A and 4 by agency B, and both are correct.
--
-- ── WHY A TABLE, AND WHAT HAPPENS TO shift.agency_id ────────────────────────
-- `shift.agency_id` is a single NOT NULL uuid. It structurally cannot hold a
-- set, so it stops being "the agency of this shift" the moment sharing exists.
--
-- It is NOT dropped and NOT made nullable here. Making it nullable ripples
-- `string | null` through every `ShiftType` consumer in backend AND web, and
-- every "which agency" surface would need an unclaimed state — a large,
-- separately verifiable change that should not ride along inside a migration.
--
-- Instead it is REDEFINED to something still true: the ORIGINATING agency —
-- the first one the outlet addressed when posting. That is a real fact, not a
-- convenient lie. What it must never again mean is "the only agency", and so:
--
--   ⚠️ NOTHING MAY SCOPE BY shift.agency_id ANYMORE. Visibility, rostering and
--      reconciliation all read `shift_agency`. Scoping by the anchor silently
--      hides a shift from every agency except the first — and that failure
--      looks like "the other agency just doesn't see it", with no error.
--
-- `shift_assignment.agency_id` already records WHICH agency supplied each PR,
-- so per-agency fulfilment tracking needs no change — that column was right all
-- along. This table is the invitation; that column is the delivery.
--
-- The money chain is safe in both directions: vouchers derive from
-- `shift_assignment`, which already carries its own agency, and
-- `collection_invoice` is keyed (agency_id, outlet_id, week_start) so one venue
-- can already be billed against several agencies with no schema change.
--
-- THE BACKFILL IS NOT OPTIONAL. Readers switch to this table in the same
-- deploy; without a row per existing shift, every agency's roster empties.
--
-- Fully idempotent — the shared innocenz-test DB has a second writer.

CREATE TABLE IF NOT EXISTS "main"."shift_agency" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar DEFAULT 'system' NOT NULL,
	"updated_by" varchar DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."shift_agency" ADD CONSTRAINT "shift_agency_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "main"."shift"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."shift_agency" ADD CONSTRAINT "shift_agency_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "main"."agency"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- One invitation per (shift, agency) — also the ON CONFLICT target the backfill
-- and every write path rely on.
CREATE UNIQUE INDEX IF NOT EXISTS "shift_agency_shift_agency_idx" ON "main"."shift_agency" ("shift_id","agency_id");
--> statement-breakpoint
-- "Every shift MY agency was invited to" is the hottest read in the portal —
-- it replaces the old `shift.agency_id = $me` equality filter.
CREATE INDEX IF NOT EXISTS "shift_agency_agency_id_idx" ON "main"."shift_agency" ("agency_id");
--> statement-breakpoint
-- ── THE BACKFILL ─────────────────────────────────────────────────────────────
-- Every existing shift keeps reaching exactly the agency it already reached.
-- Behaviour after this migration is therefore identical for all historical
-- data: the new table starts as a faithful copy of the old column.
INSERT INTO "main"."shift_agency" (
	"shift_id", "agency_id", "created_at", "updated_at", "created_by", "updated_by"
)
SELECT s."id", s."agency_id", now(), now(), 'migration_0124', 'migration_0124'
FROM "main"."shift" s
ON CONFLICT ("shift_id", "agency_id") DO NOTHING;
