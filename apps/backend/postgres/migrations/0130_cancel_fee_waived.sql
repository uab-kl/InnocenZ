-- The cancellation fee becomes OPT-OUT, and forgiving one becomes a RECORDED
-- decision instead of an omission.
--
-- 0116 sealed the fee onto the assignment and left `cancel_fee_charged_at` NULL
-- until a human pressed Charge on the penalties panel. That made FORGETTING the
-- default: an agency that never opened the panel before sending the week's PV
-- pushed the fee into a later week, or lost it. The agency's own screen admits
-- it — "Add penalties BEFORE sending the PV. A voucher already sent to the PR
-- cannot take a new line."
--
-- From here the fee attaches to the voucher for the CANCELLED SHIFT'S OWN WEEK
-- at the moment the PR cancels, and the agency's remaining decision is to WAIVE
-- it rather than to charge it.
--
-- ── WHY THREE COLUMNS AND NOT A FLAG ────────────────────────────────────────
-- "Never charged" and "forgiven" are different facts, and `charged_at IS NULL`
-- cannot hold both. Without a separate record a fee lifted off a voucher is
-- indistinguishable from one nobody has got to yet — so it reappears on the
-- Finance list and is charged again, silently reversing a decision somebody
-- made on purpose. The repository states the invariant this protects: "An
-- uncollected fee has to resurface, never quietly disappear." A WAIVED fee has
-- been decided, so it must stop resurfacing; an UNCHARGED one must not.
--
-- `_by` and `_reason` are not decoration. A deduction removed from a worker's
-- pay is money, and "who decided, and why" is the only thing that makes it
-- auditable afterwards. Same DECISION-STAMP shape as `released_by` /
-- `release_reason` and `overtime_decided_by` / `overtime_decided_at`, not the
-- four-column audit set, which `shift_assignment` already carries in full.
--
-- No FK on `_by`, for the same reason `created_by`, `updated_by` and
-- `released_by` carry none: it holds an actor string, not a guaranteed user row.
--
-- ── WHAT THE WAIVE WRITE DOES *NOT* DO ──────────────────────────────────────
-- It does NOT null `cancel_fee_voucher_id`. That column is the audit trail of
-- WHERE the line went, and it is also how a retry finds the line to remove —
-- clearing it in the same statement that stamps `waived_at` would make the
-- waive non-re-entrant, so a half-completed waive (stamped, line not yet
-- deleted) could never heal itself and would leave a live deduction nobody can
-- reach. Ask instead whether `waived_at` is set; that is the whole test.
--
-- Hand-written and idempotent because `drizzle-kit generate` cannot run in this
-- repo (parent-snapshot collision across 0065-0070); see 0078/0080/0129.

ALTER TABLE "main"."shift_assignment"
  ADD COLUMN IF NOT EXISTS "cancel_fee_waived_at" timestamp with time zone;

ALTER TABLE "main"."shift_assignment"
  ADD COLUMN IF NOT EXISTS "cancel_fee_waived_by" varchar;

ALTER TABLE "main"."shift_assignment"
  ADD COLUMN IF NOT EXISTS "cancel_fee_waive_reason" varchar(500);

-- The uncharged Finance list asks "fee sealed, above zero, not charged, not
-- waived" on every read, and it is unbounded by date on purpose — a fee that
-- went uncollected for three weeks is exactly the one worth surfacing. Partial
-- on the NULL predicates so the index holds only the rows that list can ever
-- return, which is a handful out of every cancelled shift ever recorded.
CREATE INDEX IF NOT EXISTS "shift_assignment_uncharged_cancel_fee"
  ON "main"."shift_assignment" ("agency_id")
  WHERE "cancel_fee_charged_at" IS NULL
    AND "cancel_fee_waived_at" IS NULL
    AND "cancel_fee_rm" IS NOT NULL;
