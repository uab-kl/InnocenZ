-- A NEW RAIL: `fpx` — one-off FPX, paid by link each period.
--
-- Owner's decision, 28 Aug 2026: bill by FPX rather than by direct-debit
-- mandate, because FPX reaches every Malaysian bank (29 consumer + 19 B2B at
-- Fiuu) where a mandate reaches six. The trade is that NOTHING pulls money —
-- each period the venue receives a payment link and pays at its own bank — so
-- this rail is deliberately NOT in `autoChargeableTypes`, exactly like an
-- e-wallet, and `isChargeable()` stays false on it for ever.
--
-- It is a new value rather than a re-reading of `fpx_mandate` because the two
-- are different promises: a mandate row must carry a bank and a mandate state
-- (`payment_method_mandate_bank`, `payment_method_mandate_fields`), and a
-- one-off FPX row must carry NEITHER — the venue picks its bank on the
-- provider's hosted page at pay time, and nothing is stored about it. The
-- mandate rail keeps its columns and constraints for the day direct debit is
-- added beside this one.
--
-- Both CHECKs that enumerate the rails are re-stated, because a settlement row
-- snapshots the rail it was paid on and must be able to say "fpx".
ALTER TABLE "main"."payment_method" DROP CONSTRAINT IF EXISTS "payment_method_type_values";
--> statement-breakpoint
ALTER TABLE "main"."payment_method"
  ADD CONSTRAINT "payment_method_type_values"
  CHECK ("type" IN ('card', 'fpx', 'fpx_mandate', 'ewallet', 'duitnow', 'manual_transfer'));
--> statement-breakpoint
ALTER TABLE "main"."subscription_payment" DROP CONSTRAINT IF EXISTS "subscription_payment_method_type_values";
--> statement-breakpoint
ALTER TABLE "main"."subscription_payment"
  ADD CONSTRAINT "subscription_payment_method_type_values"
  CHECK ("method_type" IN ('card', 'fpx', 'fpx_mandate', 'ewallet', 'duitnow', 'manual_transfer'));
