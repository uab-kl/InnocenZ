-- 0127 — unlinking ENDS a partnership instead of erasing it, and every
-- transition it passes through is recorded.
--
-- Two changes, one idea.
--
-- ── 1. `ended` ───────────────────────────────────────────────────────────────
-- Removing an agency used to DELETE the `agency_outlet` row. That is wrong in
-- three separate ways:
--
--   * it destroys the fact that the two ever worked together, which is exactly
--     what someone asks about months later when a payment is disputed;
--   * the agency still has shifts in flight. Those live in `shift_agency`,
--     which has no FK to this table, so they survived the delete — but the
--     venue vanished from the agency's outlet list the same instant, leaving
--     them PRs rostered at a venue they could no longer open. The obligation
--     outlived the access;
--   * re-linking became indistinguishable from a first-time request, so an
--     agency deciding on a returning partner was shown a stranger.
--
-- `ended` fixes all three. The row stays, `listApproved*` already filters on
-- `= 'approved'` so routing and visibility exclude it for free, and re-linking
-- is a status change on a row that remembers.
--
-- Re-linking still needs the agency's approval (`ended` → `pending`). The case
-- that forces this is the one where the AGENCY ended it: auto-restoring on
-- request would let a venue walk straight back in and undo the agency's own
-- decision, silently. One rule for both directions, because a rule that
-- depends on who ended it is invisible in the UI and fails quietly.
--
-- ── 2. `agency_outlet_event` ─────────────────────────────────────────────────
-- The link row holds the CURRENT state and nothing else. Re-linking overwrites
-- `approve_status`, so without a log the row could never answer "when did we
-- stop working together, the first time" — and reconstructing history nobody
-- recorded is impossible, whereas recording it now is one table.
--
-- Deliberately NOT `ended_at` / `ended_by` columns on `agency_outlet`. Those
-- would hold only the LAST ending, would be overwritten by the next one, and
-- would restate a fact this log already owns — the same duplicated-fact trap
-- the schema rules exist to prevent.
--
-- Fully idempotent — the shared innocenz-test DB has a second writer.

-- `IF NOT EXISTS` on ADD VALUE is PG12+; the DO block keeps it re-runnable on
-- any build. Nothing below uses the literal 'ended', which is what Postgres
-- forbids inside the same transaction that adds it.
DO $$ BEGIN
 ALTER TYPE "main"."agency_outlet_approve_status" ADD VALUE IF NOT EXISTS 'ended';
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Append-only. Nothing updates a row here, which is why `updated_at` /
-- `updated_by` always equal their `created_*` twin — they are present because
-- the house rule is that audit columns arrive as a set of four, not because a
-- transition is ever edited.
--
-- `from_status` is NULL on the first event only: the link did not exist yet, so
-- there was no status to come from. That is a real distinction, not a missing
-- value, and it is what makes "requested" identifiable in the timeline.
CREATE TABLE IF NOT EXISTS "main"."agency_outlet_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_outlet_id" uuid NOT NULL,
	"from_status" "main"."agency_outlet_approve_status",
	"to_status" "main"."agency_outlet_approve_status" NOT NULL,
	"actor_side" varchar(16) NOT NULL,
	"reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar DEFAULT 'system' NOT NULL,
	"updated_by" varchar DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."agency_outlet_event" ADD CONSTRAINT "agency_outlet_event_agency_outlet_id_fk" FOREIGN KEY ("agency_outlet_id") REFERENCES "main"."agency_outlet"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- WHICH SIDE acted, not which person — the UI copy turns on it ("ended by the
-- outlet" vs "ended by the agency"), and `created_by` already carries the
-- individual. Constrained rather than left free-text because a typo'd side
-- would read as neither and quietly drop the row out of every filter.
DO $$ BEGIN
 ALTER TABLE "main"."agency_outlet_event" ADD CONSTRAINT "agency_outlet_event_actor_side_check" CHECK ("actor_side" IN ('outlet', 'agency', 'admin', 'system'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Every read of this table is "the history of ONE link, newest first".
CREATE INDEX IF NOT EXISTS "agency_outlet_event_link_created_idx" ON "main"."agency_outlet_event" ("agency_outlet_id","created_at" DESC);
--> statement-breakpoint
-- ── THE BACKFILL ─────────────────────────────────────────────────────────────
-- One event per existing link, so no link starts life with an empty timeline
-- and the "have we worked together before" read never has to special-case a
-- gap. It records the state each link is in TODAY, stamped at the moment it
-- reached that state (`updated_at`), not at migration time.
--
-- It does NOT invent the transitions that got it there — those were never
-- recorded and guessing them would put fiction in an audit log. `from_status`
-- is NULL and `created_by` says where the row came from, so a backfilled event
-- stays distinguishable from a real one forever.
INSERT INTO "main"."agency_outlet_event" (
	"agency_outlet_id", "from_status", "to_status", "actor_side", "reason",
	"created_at", "updated_at", "created_by", "updated_by"
)
SELECT
	l."id",
	NULL,
	l."approve_status",
	'system',
	l."reject_reason",
	l."updated_at", l."updated_at", 'migration_0127', 'migration_0127'
FROM "main"."agency_outlet" l
WHERE NOT EXISTS (
	SELECT 1 FROM "main"."agency_outlet_event" e WHERE e."agency_outlet_id" = l."id"
);
