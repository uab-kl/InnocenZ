-- TWO GUARDS THE CODE NOW RELIES ON, MOVED INTO THE DATABASE.
--
-- 0133 gave a subscription charge somewhere to land and made the WEBHOOK lane
-- idempotent with a unique index on (gateway, gateway_payment_id). It left the
-- other lane open: an admin's "Mark paid" carries no gateway id, so that index
-- can never see it, and nothing anywhere said "an invoice may be settled once".
--
-- Measured on a live RM500 invoice before this migration: an admin double-click
-- wrote a second full settlement and a gateway settling the same period wrote a
-- third — three succeeded rows, a ledger reading RM1,500 against RM500 owed.
-- The repository now refuses the second inside a locked transaction, and this
-- index is what makes that refusal a GUARANTEE rather than a well-written
-- function. It is the missing sibling of the index 0133 already wrote.

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 1 · one settlement per invoice
--
-- Partial, on `succeeded` only, for the same reason the gateway index is
-- partial: declines, pending debits and voided settlements are all history and
-- there can be many of them. Only a SETTLEMENT is unique, and `voided` sitting
-- outside the predicate is what lets an invoice be marked unpaid and then paid
-- again — the correction path stays open.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payment_settled_invoice_idx"
  ON "main"."subscription_payment" ("subscription_invoice_id")
  WHERE "status" = 'succeeded';
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 2 · a RM 0.00 period can be settled
--
-- `amount > 0` was written to stop a meaningless payment row, and it also made
-- a zero-amount invoice IMPOSSIBLE to mark paid: the settle transaction reads
-- the amount from the invoice, the insert violates the CHECK, and the whole
-- path answers an opaque 500 with no hint of which constraint refused it.
--
-- Zero is a real amount here. A trial period, a fully-credited month and a
-- waived add-on all cost nothing and all still need the period closed and the
-- record of who closed it. Negative stays refused — a refund is its own status
-- on this table, not a negative charge.
--
-- No rows are affected: `select count(*) from subscription_invoice where
-- amount <= 0` returns 0 today, so this widens a boundary rather than repairing
-- data.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "main"."subscription_payment"
  DROP CONSTRAINT IF EXISTS "subscription_payment_amount_positive";
--> statement-breakpoint
ALTER TABLE "main"."subscription_payment"
  ADD CONSTRAINT "subscription_payment_amount_positive" CHECK ("amount" >= 0);
