-- A REAL "request detach" for a PR tied to an agency for less than a year
-- (owner, 20 Nov 2026: "Keep rule, real admin request"; button word stays
-- "Detach").
--
-- WHAT WAS WRONG. Manage PR → Agency actions → Detach has two paths. Tied a
-- year or more, it lets the PR go at once (`DELETE /pr/:id` → `agency_pr` =
-- 'left'). Tied under a year, it is meant to ask the InnocenZ admin instead —
-- and that path was a toast: nothing was filed, nobody was asked. Worse, the
-- year was never computable for real data: `agency_pr` records when the row
-- was CREATED, not when the membership was APPROVED (a re-join flips the same
-- row back to 'pending', so `created_at` can be months stale), and the website
-- fell back to "400 days ago" for every real PR. So on a real login every PR
-- counted as over a year, and the rule did not exist on the server at all.
--
-- WHAT THIS ADDS. Three facts, each in the table it belongs to:
--
--  1. `agency_pr.approved_at` — when THIS membership last became approved.
--     Stamped by the trigger below on every path that approves one (there are
--     seven in the code today: the approvals page, an owner invite, the ops
--     bridge, the roster scripts…), so no future path can forget it. A rejected
--     departure (`leave_pending` → `approved`) KEEPS the old stamp: the PR never
--     stopped being tied. Back-filled from `created_at` for the rows that are
--     live today — the only date there is for them.
--
--  2. `admin_request` type `pr_detach` + `subject_user_id` — the request itself,
--     in the admin inbox that already exists (rule 1: reuse the table that
--     fits). `subscriber_*` is the agency asking, as for every other request;
--     `subject_user_id` is the PR it is about — a FOREIGN KEY to `user`, never
--     a copied name (rule 3). ON DELETE SET NULL: the request is history and
--     outlives an account.
--
--  3. `notification_kind` `pr_detach_decided` — the admin's answer, approved or
--     declined, told to the agency. One kind for both outcomes, like
--     `leave_decided` / `cutlost_decided`.
--
-- ⚠️ ENUM VALUES ARE NOT USED IN THIS FILE. drizzle-kit migrate runs every
-- pending migration in ONE transaction, and Postgres refuses to use a value
-- added by `ALTER TYPE … ADD VALUE` before that transaction commits. That is
-- why there is no partial unique index on "one open pr_detach per PR" here —
-- its predicate would name 'pr_detach'. The duplicate guard is in the server
-- instead, serialised on the `agency_pr` row (pr-detach-request.ts).
--
-- Additive and idempotent: every statement is IF NOT EXISTS / OR REPLACE /
-- guarded, so a re-run is a no-op and today's code is unaffected by any of it
-- (Drizzle only selects the columns a model declares).

ALTER TYPE "main"."admin_request_type" ADD VALUE IF NOT EXISTS 'pr_detach';
ALTER TYPE "main"."notification_kind" ADD VALUE IF NOT EXISTS 'pr_detach_decided';

-- 2. The PR a request is about.
ALTER TABLE "main"."admin_request"
  ADD COLUMN IF NOT EXISTS "subject_user_id" uuid;

DO $$ BEGIN
  ALTER TABLE "main"."admin_request"
    ADD CONSTRAINT "admin_request_subject_user_id_user_id_fk"
    FOREIGN KEY ("subject_user_id") REFERENCES "main"."user"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The duplicate guard and the agency's "detach requested" read both look up
-- by (agency, PR); almost every row has no subject, so the index is partial.
CREATE INDEX IF NOT EXISTS "admin_request_subject_user_id_idx"
  ON "main"."admin_request" ("subscriber_id", "subject_user_id")
  WHERE "subject_user_id" IS NOT NULL;

-- 1. When this membership became approved.
ALTER TABLE "main"."agency_pr"
  ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;

-- Back-fill the live memberships. `created_at` is the only date they have; it
-- is the EARLIEST the approval can have been, so a stale one can only make a
-- PR look tied longer, never shorter. Leaves updated_at alone: this is not
-- anybody's edit. Does not fire the trigger below (approve_status is not set).
UPDATE "main"."agency_pr"
   SET "approved_at" = "created_at"
 WHERE "approved_at" IS NULL
   AND "approve_status" IN ('approved', 'leave_pending');

CREATE OR REPLACE FUNCTION "main"."agency_pr_stamp_approved_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."approve_status" = 'approved' THEN
    IF TG_OP = 'INSERT' THEN
      NEW."approved_at" := COALESCE(NEW."approved_at", now());
    ELSIF OLD."approve_status" NOT IN ('approved', 'leave_pending') THEN
      -- pending / rejected / left → approved: a membership starts now.
      NEW."approved_at" := now();
    END IF;
    -- approved → approved and leave_pending → approved keep their stamp.
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "agency_pr_stamp_approved_at" ON "main"."agency_pr";
CREATE TRIGGER "agency_pr_stamp_approved_at"
  BEFORE INSERT OR UPDATE OF "approve_status" ON "main"."agency_pr"
  FOR EACH ROW EXECUTE FUNCTION "main"."agency_pr_stamp_approved_at"();
