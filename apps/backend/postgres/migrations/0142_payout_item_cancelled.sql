-- 0142 — a cancelled payout line, and the guard that stops one voucher being
-- paid out of two runs at once.
--
-- Two holes found by re-reading 0140 after it landed:
--
-- 1. A MISTAKEN DRAFT BLOCKED ITS VOUCHERS FOREVER. `alreadyBatched` treated
--    every item that was not 'failed' as live, so the items of an abandoned
--    draft sat at 'pending' and locked those vouchers out of every future run.
--    There was no way back: nothing called `markStatus(..., 'cancelled')` and
--    no route existed to. Marking them 'failed' instead would have been a lie
--    in the evidence column — nothing was ever sent, so nothing was rejected.
--
-- 2. NOTHING IN THE DATABASE STOPPED A DOUBLE RUN. The only uniqueness was
--    `(batch_id, voucher_id)` — per batch, not global — and the read-time
--    `alreadyBatched` check cannot see a concurrent insert. Two POSTs in the
--    same second both saw a voucher as free and both took it. This is exactly
--    the shape of the coworker's measured subscription bug (three 'succeeded'
--    rows against one RM500 invoice, recorded in 0135's header); the fix there
--    was a database constraint, and it is the fix here.
--
-- ── WHICH STATES BLOCK, AND WHY ─────────────────────────────────────────────
-- BLOCKING: pending (in a live draft), sent (out with a bank), paid (done).
-- NOT BLOCKING: failed (rejected — retrying is the whole point), returned (it
-- left and came back, so it must be re-payable), cancelled (never sent).
--
-- The index enumerates the blocking states POSITIVELY rather than excluding the
-- non-blocking ones. That is not a style choice: `ALTER TYPE ... ADD VALUE` and
-- a USE of the new value cannot share a transaction, and drizzle runs each
-- migration in one. Naming only pre-existing values keeps both statements here
-- legal together.
--
-- Idempotent throughout — the shared innocenz-test DB has a second writer.

ALTER TYPE "main"."payout_item_status" ADD VALUE IF NOT EXISTS 'cancelled';
--> statement-breakpoint
-- ONE LIVE PAYOUT LINE PER VOUCHER, enforced by the database rather than by a
-- read the next request cannot see. A second concurrent create now fails on the
-- constraint instead of quietly paying someone twice.
CREATE UNIQUE INDEX IF NOT EXISTS "payout_batch_item_one_live_per_voucher"
  ON "main"."payout_batch_item" ("voucher_id")
  WHERE "status" IN ('pending', 'sent', 'paid');
