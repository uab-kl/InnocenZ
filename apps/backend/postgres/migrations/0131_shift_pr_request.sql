-- 0131_shift_pr_request
--
-- THE OUTLET'S NAMED-PR PICKS FINALLY HAVE SOMEWHERE TO LAND.
--
-- Post Job has carried a "SELECT PRS" picker for weeks, and the web client has
-- dutifully collected `prIds` on every draft — then dropped them on the floor:
-- `createShiftInputFromPost` documents that named PR ids "have no backend
-- column and are dropped here". So a venue that hand-picked five faces posted
-- a shift that said only "5 PRs", and the agency never learned who was wanted.
-- The owner found this from the outside (23 Aug 2026): "auto assign also needs
-- show that the outlet if want that pr for that time".
--
-- A REQUEST IS A WANT, NOT A BOOKING — which is why no existing table fits:
--   - shift_agency says which AGENCIES may staff the shift (agency-grain);
--   - shift_assignment says who IS booked (and is written only by the agency
--     lane — the outlet must never be able to seat a person);
-- this row says "the venue asked for this person", and the agency remains the
-- one who turns a want into a seat. "Booked" is therefore NOT a column here:
-- it is derived from shift_assignment existing for the same (shift, person) —
-- one fact, one place.
--
-- WHY agency_id: a PR can hold memberships at several agencies (Alice: Atlas
-- AND Why We Met), and the picker card the outlet tapped came from ONE of
-- them. Recording it lets each agency read only the requests addressed to it
-- ("which pr under which agency is requested"), so a rival never sees who a
-- venue asked from someone else's roster.
--
-- user_id, not pr_id: there is no `pr` table — a PR is a `user` row and the
-- membership lives on agency_pr (0089).
--
-- No FK on the `_by` audit columns: they hold actor strings, same as every
-- sibling (see 0130).
--
-- Hand-written and idempotent because `drizzle-kit generate` cannot run in
-- this repo (parent-snapshot collision across 0065-0070); see 0078/0080/0129.

CREATE TABLE IF NOT EXISTS "main"."shift_pr_request" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shift_id" uuid NOT NULL REFERENCES "main"."shift"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "main"."user"("id") ON DELETE CASCADE,
  "agency_id" uuid NOT NULL REFERENCES "main"."agency"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" varchar DEFAULT 'system' NOT NULL,
  "updated_by" varchar DEFAULT 'system' NOT NULL,
  CONSTRAINT "shift_pr_request_shift_user_unique" UNIQUE ("shift_id", "user_id")
);
--> statement-breakpoint

-- The two reads: "requests on this shift" (outlet sheet, shift list fan-out)
-- and "requests addressed to this agency" (roster planning, auto-assign).
CREATE INDEX IF NOT EXISTS "shift_pr_request_shift_idx"
  ON "main"."shift_pr_request" ("shift_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "shift_pr_request_agency_idx"
  ON "main"."shift_pr_request" ("agency_id");
