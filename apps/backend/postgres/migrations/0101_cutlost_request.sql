-- 0101 — cut-loss: an outlet asks to spend less on a shift, the agency decides.
--
-- Numbered 0101, not 0098, to leave 0098-0100 free for work in flight on another
-- branch. It was applied once as 0098 before the renumber, so drizzle runs it
-- again under the new tag: every statement below is IF NOT EXISTS guarded and the
-- re-run is a no-op. The stale 0098 row in __drizzle_migrations is harmless.
--
-- Until now this lived entirely in the web prototype's Zustand store: the submit
-- handlers called `requestOutletCutlostReduction()`, which wrote to memory and
-- was lost on reload. Backend references: zero. It demoed convincingly because
-- the UI computed real-looking savings from real rate cards.
--
-- Three kinds, matching the UI that already exists:
--   release_prs  send named PRs home early (the assignments are listed below)
--   cut_slots    drop N unfilled slots off the plan; nobody is sent home
--   best_effort  a mix of the two, with the recommender's rationale kept
--
-- WHY A NEW TABLE: no existing one fits. `outlet_swap` is agency->PR and MOVES an
-- assignment; this is outlet->agency and CLOSES one. A request also outlives the
-- thing it acts on (it stays readable after the shift seals), so it cannot hang
-- off shift_assignment.
--
-- Deliberately NOT stored: outlet_id, agency_id, PR names, the shift's date and
-- slot. Every one of them is reachable by FK through `shift`, and a copy is a
-- second place for the truth to live. The UI's `outletName` / `shiftLabel` /
-- `releasedPrNames` are rendered from those joins, never from here.
CREATE TABLE IF NOT EXISTS "main"."cutlost_request" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shift_id" uuid NOT NULL REFERENCES "main"."shift"("id") ON DELETE CASCADE,
  "kind" varchar(20) NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  -- Unfilled slots taken off the plan. NULL for a pure release_prs request —
  -- distinct from 0, which means "a best_effort plan that cut no slots".
  "slots_cut" integer,
  -- What the OUTLET was shown when it asked, frozen. Never recompute it for the
  -- agency's screen: the two would then disagree about what is being approved,
  -- and the rate card can move between the request and the decision.
  "estimated_savings" numeric(12, 2) DEFAULT '0' NOT NULL,
  -- The recommender's reasons, as shown to the outlet (best_effort only).
  "rationale" jsonb,
  "decline_reason" varchar(500),
  "decided_at" timestamp with time zone,
  "decided_by" varchar,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" varchar NOT NULL,
  "updated_by" varchar NOT NULL
);--> statement-breakpoint

-- Which assignments a release names. An FK to the ASSIGNMENT, not to the user:
-- the thing being closed is one PR on one shift, and a PR may hold several
-- assignments. Cascades with the request; a request naming none is a pure
-- cut_slots one.
CREATE TABLE IF NOT EXISTS "main"."cutlost_request_assignment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL REFERENCES "main"."cutlost_request"("id") ON DELETE CASCADE,
  "assignment_id" uuid NOT NULL REFERENCES "main"."shift_assignment"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" varchar NOT NULL,
  "updated_by" varchar NOT NULL,
  CONSTRAINT "cutlost_request_assignment_unique" UNIQUE ("request_id", "assignment_id")
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cutlost_request_shift_idx" ON "main"."cutlost_request" ("shift_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cutlost_request_status_idx" ON "main"."cutlost_request" ("status");--> statement-breakpoint

-- Three new notification kinds. `notification_kind` is a PG ENUM, so these are
-- DDL rather than data — a new kind cannot simply be passed to notify().
--
-- ⚠️ ADD VALUE only, never used in this same migration. Postgres refuses to use a
-- freshly added enum value inside the transaction that added it, and drizzle runs
-- each migration in one. Adding without inserting is safe on PG 12+.
--
-- Why three and not a reuse of `shift_cancelled`: a released PR was not
-- cancelled — they worked part of the shift and are owed part of the day. Filing
-- it under cancellation would tell them the opposite of what happened.
ALTER TYPE "main"."notification_kind" ADD VALUE IF NOT EXISTS 'cutlost_requested';--> statement-breakpoint
ALTER TYPE "main"."notification_kind" ADD VALUE IF NOT EXISTS 'cutlost_decided';--> statement-breakpoint
ALTER TYPE "main"."notification_kind" ADD VALUE IF NOT EXISTS 'shift_released_early';--> statement-breakpoint

-- WHO closed a shift, when it was not the PR themselves.
--
-- A release stamps check-out on the PR's behalf, and the stamp it writes is
-- indistinguishable from one the PR tapped: same column, same shape. Nothing
-- else records the difference and it cannot be inferred afterwards — which
-- matters because the PR is owed an explanation for a short wage, and because a
-- released stamp has no geofence fix and no selfie behind it. NULL on every row
-- a PR closed themselves.
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "released_by" varchar;--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "release_reason" varchar(500);
