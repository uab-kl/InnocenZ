-- A recorded penalty becomes REVERSIBLE, because recording it is about to stop
-- being a human act.
--
-- Owner's call, 7 Sep 2026: "i want it to be auto-recorded but once it is
-- recorded then the Agency can decide whether they want to delete/void it".
-- Until now nothing in the product ever sealed a proposal at all — the button
-- that called POST /:id/penalties/seal was deleted on 24 Aug and was its only
-- caller — so every breach sat under "Not yet recorded" for ever. The weekly
-- job that closes that gap creates charges with NO human in the loop, and a
-- charge nobody chose has to be one somebody can undo.
--
-- ── WHY A COLUMN AND NOT A DELETE ───────────────────────────────────────────
-- `penalty_charge` carries a UNIQUE index on (agency_id, pr_id, rule_type,
-- week_start) and `seal()` inserts with ON CONFLICT DO NOTHING — that pair is
-- what makes sealing idempotent. It also means a DELETED charge is recreated by
-- the very next run of the job, because the breach it came from is still true.
-- A hard delete would therefore last minutes. A voided ROW keeps the slot, so
-- the conflict clause does the enforcing and the sealer needs no special case:
-- the void is durable by construction.
--
-- ── WHY THREE COLUMNS AND NOT A FLAG ────────────────────────────────────────
-- Same reasoning as 0130's waive, and the same shape. "Never billed" and
-- "cancelled by the agency" are different facts, and `charged_at IS NULL`
-- cannot hold both: without a separate record a voided charge is
-- indistinguishable from one nobody has got to yet, so it goes on resurfacing
-- in the Finance list and is billed anyway — silently reversing a decision
-- somebody made on purpose. `_by` and `_reason` are not decoration: this is
-- money coming out of a worker's pay, and "who decided, and why" is the only
-- thing that makes the reversal auditable afterwards.
--
-- DECISION-STAMP shape (`waived_at`/`waived_by`/`waive_reason`,
-- `overtime_decided_at`/`overtime_decided_by`), not the four-column audit set —
-- `penalty_charge` already carries created_at/updated_at/created_by/updated_by
-- in full.
--
-- No FK on `voided_by`, for the same reason `created_by`, `updated_by` and
-- `waived_by` carry none: it holds an actor string, not a guaranteed user row.
--
-- Hand-written and idempotent because `drizzle-kit generate` cannot run in this
-- repo (parent-snapshot collision across 0065-0070); see 0078/0080/0129/0130.

ALTER TABLE "main"."penalty_charge"
  ADD COLUMN IF NOT EXISTS "voided_at" timestamp with time zone;

ALTER TABLE "main"."penalty_charge"
  ADD COLUMN IF NOT EXISTS "voided_by" varchar;

ALTER TABLE "main"."penalty_charge"
  ADD COLUMN IF NOT EXISTS "void_reason" varchar(500);

-- The Finance list asks "sealed, not billed, not voided" on every read, scoped
-- to one agency and unbounded by date on purpose — a charge left uncollected
-- for three weeks is exactly the one worth surfacing. Partial on the NULL
-- predicates so the index holds only the rows that list can ever return.
CREATE INDEX IF NOT EXISTS "penalty_charge_uncharged_idx"
  ON "main"."penalty_charge" ("agency_id")
  WHERE "charged_at" IS NULL
    AND "voided_at" IS NULL;
