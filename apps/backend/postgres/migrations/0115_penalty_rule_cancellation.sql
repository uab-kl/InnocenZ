-- The cancellation rule joins the penalty table, and its hours become editable.
--
-- It was hardcoded in THREE places that did not agree:
--
--   apps/mobile/src/lib/demo-shifts.ts        > 24h free · 12–24h -25% · < 12h -50%
--   apps/mobile/.../AgencySchedulePanel.tsx   >= 24h free ·  2-24h -25% · <  2h -50%
--   apps/web/.../pr-schedule-cancellation.ts  >= 24h free ·  2-24h -25% · <  2h -50%
--
-- The first is the panel a PR READS; the second is the function that computes
-- what they are CHARGED — and it sits under a comment claiming to mirror the
-- first. So a PR cancelling 6 hours out was told -50% and actually charged
-- -25%. One editable row per agency ends that by construction.
--
-- SEEDED FROM THE CODE (24 / 2 / 25 / 50), NOT FROM THE PANEL. The panel's 12h
-- is the number nobody was ever charged against; seeding it would change what
-- every PR pays. This preserves today's real behaviour exactly, and the hours
-- are now editable, so 12 is one field away if that was the intent.
--
-- Additive and idempotent; ALTER TYPE ... ADD VALUE cannot be rolled back
-- inside a transaction, so a re-run must be a no-op.
ALTER TYPE "main"."penalty_rule_type" ADD VALUE IF NOT EXISTS 'cancellation';
--> statement-breakpoint
-- Nullable like every other rule-specific column: each rule type uses its own
-- subset, and these four are meaningless on the three attendance rules.
-- `fine_rm` stays unused here — a cancellation costs a PERCENTAGE of the
-- shift's daily wage, not a flat ringgit amount, so reusing that column would
-- have made the same number mean two different things.
ALTER TABLE "main"."agency_penalty_rule" ADD COLUMN IF NOT EXISTS "free_cancel_hours" integer;
--> statement-breakpoint
ALTER TABLE "main"."agency_penalty_rule" ADD COLUMN IF NOT EXISTS "short_notice_hours" integer;
--> statement-breakpoint
ALTER TABLE "main"."agency_penalty_rule" ADD COLUMN IF NOT EXISTS "short_notice_pct" integer;
--> statement-breakpoint
ALTER TABLE "main"."agency_penalty_rule" ADD COLUMN IF NOT EXISTS "late_cancel_pct" integer;
