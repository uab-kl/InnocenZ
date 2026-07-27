-- Outlet swap: the agency proposes that an already-rostered PR works a
-- different outlet's shift, and the PR approves or declines it.
--
-- Until now there was no backend for this at all (`grep -ri swap src/` returned
-- nothing) — the roster's "Request Outlet Swap" button matched the slot id
-- against the demo store, which no longer holds the rendered rows, so it
-- silently did nothing.
--
-- A swap is a REQUEST, not a move. Nothing changes on shift_assignment until
-- the PR approves; approval then repoints that assignment at `to_shift_id` in
-- one transaction. See the repository for why agency_id has to move with it.

CREATE TYPE "main"."outlet_swap_status" AS ENUM(
  'pending_pr', 'approved', 'declined', 'cancelled'
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "main"."outlet_swap_request" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

  -- The rostered PR being moved. The assignment row itself is untouched while
  -- the request is pending.
  "assignment_id" uuid NOT NULL
    REFERENCES "main"."shift_assignment"("id") ON DELETE CASCADE,

  -- Where they are now, and where they would go. The destination is a concrete
  -- SHIFT, not an outlet name: approving has to repoint
  -- shift_assignment.shift_id at a real row, and the target outlet may well
  -- have several shifts that night.
  --
  -- from_shift_id is redundant at request time (it equals the assignment's
  -- shift_id) but not after: approval moves the assignment, so without this the
  -- origin would be unrecoverable from the record.
  "from_shift_id" uuid NOT NULL
    REFERENCES "main"."shift"("id") ON DELETE CASCADE,
  "to_shift_id" uuid NOT NULL
    REFERENCES "main"."shift"("id") ON DELETE CASCADE,

  -- Who raised it. Scoping column, mirroring shift_assignment.agency_id.
  "agency_id" uuid NOT NULL
    REFERENCES "main"."agency"("id") ON DELETE CASCADE,

  "agency_note" varchar(500),
  "pr_note" varchar(500),

  "status" "main"."outlet_swap_status" DEFAULT 'pending_pr' NOT NULL,

  -- When the request left 'pending_pr', by whichever party closed it.
  "responded_at" timestamp with time zone,

  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" varchar DEFAULT 'system' NOT NULL,
  "updated_by" varchar DEFAULT 'system' NOT NULL
);--> statement-breakpoint

-- A swap has to actually move the PR somewhere.
ALTER TABLE "main"."outlet_swap_request"
  ADD CONSTRAINT "outlet_swap_request_distinct_shifts"
  CHECK ("from_shift_id" <> "to_shift_id");--> statement-breakpoint

-- At most one LIVE request per assignment, enforced by the database rather than
-- controller convention so a double-tap or retried POST cannot open a second
-- one and leave the PR with two conflicting destinations. Partial on purpose:
-- declined/cancelled rows accumulate as history and must not block re-asking.
CREATE UNIQUE INDEX IF NOT EXISTS "outlet_swap_request_one_pending_per_assignment"
  ON "main"."outlet_swap_request" ("assignment_id")
  WHERE "status" = 'pending_pr';--> statement-breakpoint

-- The PR's inbox and the agency's outstanding list are both
-- "everything still pending, oldest first".
CREATE INDEX IF NOT EXISTS "outlet_swap_request_pending_idx"
  ON "main"."outlet_swap_request" ("created_at")
  WHERE "status" = 'pending_pr';--> statement-breakpoint

-- History lookups: "what swaps has this agency raised", and (on approval)
-- "who else is already headed to this shift".
CREATE INDEX IF NOT EXISTS "outlet_swap_request_agency_idx"
  ON "main"."outlet_swap_request" ("agency_id", "created_at");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "outlet_swap_request_to_shift_idx"
  ON "main"."outlet_swap_request" ("to_shift_id");
