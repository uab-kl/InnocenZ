-- THE PLAN LIMIT AS A NUMBER, so the server can enforce it.
--
-- `coverage` is free text — the literal string '5 PV/week' — written by the
-- admin form and read back verbatim by every screen. Nothing could compare a
-- count against it without parsing that string, and nothing did: an agency on
-- the RM125 "5 PV/week" tier could issue 40 vouchers in a week, and an outlet
-- could post past its PRs/day through any caller that was not the Post Job
-- screen, because that cap existed only in the browser.
--
-- ONE column, because the UNIT is already implied by `subscription_type`:
-- agency plans are PVs per payroll week (Sun-Sat), outlet plans are PRs per
-- calendar day. Splitting unit/period into their own columns would let a row
-- claim a combination the enforcement does not implement.
--
-- NULL means UNLIMITED, and that is the honest reading of the open-ended bands:
-- agency Custom is "151+ PV/week" and outlet Premier is "101+ PRs/day" — a
-- floor with no ceiling — while the POS add-on is not a capacity product at all.
-- `coverage` stays as the display string; this is its machine-readable twin, and
-- the two must be kept in step when a band is re-cut.
ALTER TABLE "main"."subscription" ADD COLUMN IF NOT EXISTS "limit_amount" integer;
--> statement-breakpoint
-- Backfilled from the bands the rate cards already advertise. Keyed on
-- (subscription_type, name) because BOTH types have a 'Plus' and an
-- 'Enterprise' at different numbers. Only fills rows still NULL, so a limit an
-- admin has already tuned is never overwritten by a re-run.
UPDATE "main"."subscription" SET "limit_amount" = v.lim
FROM (VALUES
  ('agency', 'Starter', 5),
  ('agency', 'Plus', 10),
  ('agency', 'Growth', 25),
  ('agency', 'Enterprise', 75),
  ('agency', 'Scale', 150),
  ('outlet', 'Essential', 5),
  ('outlet', 'Plus', 10),
  ('outlet', 'Pro', 25),
  ('outlet', 'Enterprise', 50),
  ('outlet', 'Scale', 100)
) AS v(stype, sname, lim)
WHERE "main"."subscription"."subscription_type"::text = v.stype
  AND "main"."subscription"."name" = v.sname
  AND "main"."subscription"."limit_amount" IS NULL;
