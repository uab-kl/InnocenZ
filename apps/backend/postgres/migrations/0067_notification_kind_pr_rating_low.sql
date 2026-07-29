-- A PR's average rating falling below the warning threshold now tells their
-- agency. The notification enum is closed by design (see notification.model.ts:
-- "add one when the code that raises it lands, not before"), so the value is
-- added here alongside the producer in rating.controller.ts.
--
-- Additive and idempotent: IF NOT EXISTS makes a re-run a no-op, which matters
-- because ALTER TYPE ... ADD VALUE cannot be rolled back inside a transaction.
ALTER TYPE "main"."notification_kind" ADD VALUE IF NOT EXISTS 'pr_rating_low';
