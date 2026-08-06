-- 0097 — pro-rata wages: the evidence behind a sealed pay amount.
--
-- `shift_assignment.pay_amount` used to seal FLAT at the tier rate: a PR who
-- checked out three hours early was paid the full day. From now on check-out
-- seals what the shift EARNED — day rate x minutes worked / minutes scheduled,
-- with a five-minute grace and capped at the full day rate.
--
-- These four columns carry the reasoning beside the number, because a voucher
-- line reading RM520 against a RM700 rate card is otherwise unexplainable.
--
--   day_rate_amount   the FULL rate the pro-rata was taken from. This is the
--                     overtime basis: OT is `daily wage / standard shift * 1.5`
--                     and must never be derived from a reduced pay_amount.
--   worked_minutes    minutes clocked INSIDE the scheduled window.
--   scheduled_minutes the window length used as the divisor.
--   pay_rule          full_day | grace | pro_rata | no_schedule | never_present.
--
-- All nullable, no backfill and no default: NULL means the row was sealed before
-- this rule existed. Backfilling would be a guess — the historic rows carry no
-- record of what their window was, and inventing one would restate money that
-- has already been paid.
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "day_rate_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "worked_minutes" integer;--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "scheduled_minutes" integer;--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "pay_rule" varchar(20);
