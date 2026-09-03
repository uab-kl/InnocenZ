-- TWO THINGS A PAYER NEEDS THAT AN ADMIN NEVER DID.
--
-- 1. AN INVOICE NUMBER. A receipt with no number is a screenshot. `payment_voucher`
--    has carried `voucher_no` (PV-000001) since it was written; the subscription
--    side had nothing to print at the top of a receipt or quote on a bank
--    transfer. Assigned by the database on insert, so `generateMissing` needs no
--    change and two concurrent openings cannot mint the same number. Existing
--    rows are backfilled in period order so history reads in sequence.
--
-- 2. ONE CHECKOUT, SEVERAL PERIODS. The payer ticks the periods it wants to pay
--    and pays them in ONE gateway session — an outlet on Enterprise + POS should
--    not have to pay twice a month. That means several `subscription_payment`
--    rows share one `gateway_payment_id`, which the 0133 index forbade. The
--    idempotency guarantee is kept, one level finer: a gateway may report the
--    same payment for the same INVOICE only once.
CREATE SEQUENCE IF NOT EXISTS "main"."subscription_invoice_no_seq";
--> statement-breakpoint
ALTER TABLE "main"."subscription_invoice"
  ADD COLUMN IF NOT EXISTS "invoice_no" varchar(20);
--> statement-breakpoint
-- Backfill oldest period first, so INV-000001 is the earliest charge.
UPDATE "main"."subscription_invoice" si
SET "invoice_no" = 'INV-' || lpad(numbered.n::text, 6, '0')
FROM (
  SELECT id, row_number() OVER (ORDER BY period_start, created_at, id) AS n
  FROM "main"."subscription_invoice"
  WHERE "invoice_no" IS NULL
) numbered
WHERE si.id = numbered.id;
--> statement-breakpoint
-- Move the sequence past the backfill, then let the DEFAULT take over.
SELECT setval(
  '"main"."subscription_invoice_no_seq"',
  COALESCE((SELECT max(nullif(regexp_replace("invoice_no", '\D', '', 'g'), '')::int) FROM "main"."subscription_invoice"), 0) + 1,
  false
);
--> statement-breakpoint
ALTER TABLE "main"."subscription_invoice"
  ALTER COLUMN "invoice_no" SET DEFAULT 'INV-' || lpad(nextval('"main"."subscription_invoice_no_seq"')::text, 6, '0');
--> statement-breakpoint
ALTER TABLE "main"."subscription_invoice" ALTER COLUMN "invoice_no" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_invoice_no_idx"
  ON "main"."subscription_invoice" ("invoice_no");
--> statement-breakpoint

DROP INDEX IF EXISTS "main"."subscription_payment_gateway_ref_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payment_gateway_ref_idx"
  ON "main"."subscription_payment" ("gateway", "gateway_payment_id", "subscription_invoice_id")
  WHERE "gateway_payment_id" IS NOT NULL;
