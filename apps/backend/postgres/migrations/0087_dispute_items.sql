-- WHICH ITEMS a dispute is about — "Lemon Drop", not just "drinks on Tuesday".
--
-- The row already carried the day (`dispute_date`), the bucket (`component`) and,
-- since the picker went single-select, the shift (`receipt_refs`). It still could
-- not say WHAT was wrong. A tips receipt holds Tips, Booking commission and Havoc
-- together, so "tips on Tue 4 is wrong" leaves the agency to guess which of the
-- three, and the PR with no way to say.
--
-- A SNAPSHOT, deliberately, in the same spirit as `disputed_amount`: it records
-- what the PR pointed at WHEN THEY POINTED AT IT.
--
--   [{"lineId":"…uuid…","description":"Lemon Drop","quantity":1,"amount":"3.60"}]
--
-- ⚠️ NOT a foreign key to payment_voucher_line, and that is not laziness.
-- `PUT /payment-voucher/:id` deletes and re-inserts every line on the voucher, so
-- a line id is not stable for the lifetime of a claim — an FK would go null (or
-- block the rewrite) and the record of what was disputed would quietly evaporate.
-- The same reasoning already made `receipt_refs` store receipt NUMBERS rather
-- than ids. `lineId` is kept inside the snapshot as a best-effort pointer for as
-- long as it resolves; `description`, `quantity` and `amount` are what keep the
-- claim legible after a rewrite.
--
-- NULL means the claim named no items — every row raised before this column
-- existed, and any claim about a whole receipt.

ALTER TABLE "main"."payment_voucher_dispute"
  ADD COLUMN IF NOT EXISTS "disputed_items" jsonb;

COMMENT ON COLUMN "main"."payment_voucher_dispute"."disputed_items" IS
  'Snapshot of the item lines this claim names: [{lineId, description, quantity, amount}]. NULL = whole receipt, or raised before the column existed. Deliberately not an FK - PUT /payment-voucher/:id re-inserts lines, so ids are not stable for a claim lifetime.';
