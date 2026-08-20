-- Re-key "one voucher per PR per week" to include the AGENCY.
--
-- 0078 created `payment_voucher_one_per_pr_week` on (pr_id, week_start), and its
-- own comment states the premise it rested on:
--
--     "Deliberately NOT keyed on agency_id as well. A PR belongs to one agency,
--      so adding it would widen the key and let the same PR hold two vouchers
--      for one week under two agencies — the exact thing being prevented."
--
-- That premise is false, and was already false when it was written. A PR's
-- membership lives on `agency_pr`, and one person holds ONE ROW PER AGENCY —
-- which is why `agency_pr` has no unique constraint on user_id. On the live
-- database today four people hold memberships in more than one agency (one in
-- four of them), so the rule as keyed does not say "no double payment"; it says
-- "only the first agency to reach the week may pay this person at all".
--
-- ── WHAT THE OLD KEY ACTUALLY CAUSED ────────────────────────────────────────
-- Three distinct failures, only the third of which is loud:
--
--   A. Agency B's money landed on Agency A's voucher. The lookups behind
--      `getOrCreateCurrentWeekDraft` match on PR + week with no agency term, so
--      an OPEN voucher belonging to A is what B is handed, and `addLine` writes
--      to it. This is the one nobody would notice: every path that routes money
--      onto a weekly voucher shares it — self-logged receipts, approved
--      overtime, and penalty charges alike.
--   B. Agency B was permanently blocked. Once A's voucher left the open
--      statuses, B got "this week's payment voucher has already been sent …
--      ask your agency to reopen it" — naming a document belonging to a
--      different agency, which B can neither see nor reopen.
--   C. The INSERT raced and hit this index, taking down whatever run it was in.
--
-- Widening the key fixes B and C. It does NOT fix A on its own — A is a query
-- scoping bug, not a constraint one — so the same slice adds the agency term to
-- the lookups in payment-voucher.repository.ts. The index and the queries have
-- to move together: widening the key alone would remove the crash that is
-- currently the only thing making the contamination visible.
--
-- ── WHAT IS STILL GUARANTEED ────────────────────────────────────────────────
-- One voucher per (agency, PR, week) — which is the rule 0078 was reaching for.
-- The double payment it was built to stop (PV-000002 and PV-000004, same PR,
-- same week, both live) is still impossible: those two shared an agency, so
-- they collide on the new key exactly as they did on the old one.
--
-- PARTIAL for the same reason as 0078 — `pr_id` and `week_start` are nullable,
-- and Postgres already treats NULLs as distinct. `agency_id` is NOT NULL, so it
-- needs no term of its own. The clause states the intent rather than making a
-- reader re-derive it from the NULL rule.
--
-- Hand-written and idempotent because `drizzle-kit generate` cannot run in this
-- repo (parent-snapshot collision across 0065-0070); see 0078/0080.

-- Refuse LOUDLY if the NEW key already has duplicates, naming them.
--
-- Checked against the new triple, not the old pair: a pair that is a duplicate
-- under (pr, week) but not under (agency, pr, week) is exactly the row this
-- migration exists to permit, and must not block it. Live count at authoring
-- time was zero — the old index made it so — but a migration that trusts a
-- number someone read once is a migration that fails at 3am on a copy of the
-- database nobody checked.
DO $$
DECLARE
  dupes text;
BEGIN
  SELECT string_agg(detail, '; ') INTO dupes
  FROM (
    SELECT "agency_id" || ' / ' || "pr_id" || ' week ' || "week_start" || ' -> ' ||
           string_agg(coalesce("voucher_no", "id"::text), ', ' ORDER BY "created_at") AS detail
    FROM "main"."payment_voucher"
    WHERE "pr_id" IS NOT NULL AND "week_start" IS NOT NULL
    GROUP BY "agency_id", "pr_id", "week_start"
    HAVING count(*) > 1
  ) d;

  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot enforce one-voucher-per-agency-per-PR-per-week: duplicates exist. %', dupes
      USING HINT = 'Resolve each pair first (for real payroll: void + reissue, PR notified), then re-run.';
  END IF;
END $$;

-- Create the wider key BEFORE dropping the narrower one, so there is no instant
-- at which the table is unprotected. The narrow index is strictly stronger than
-- the wide one, so both can coexist: every row that satisfies (pr, week)
-- uniqueness also satisfies (agency, pr, week) uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS "payment_voucher_one_per_agency_pr_week"
  ON "main"."payment_voucher" ("agency_id", "pr_id", "week_start")
  WHERE "pr_id" IS NOT NULL AND "week_start" IS NOT NULL;

DROP INDEX IF EXISTS "main"."payment_voucher_one_per_pr_week";
