-- WHICH SHIFT, as a FOREIGN KEY — not a copied receipt number.
--
-- `receipt_refs` stored the receipt NUMBER ("RCP-000012") as jsonb text. That
-- breaks the standing rule: read other tables through a FOREIGN KEY, reference
-- rows by their uuid primary id, never keep a second copy of a value that
-- already lives somewhere. A number in a jsonb array cannot be joined, cannot be
-- constrained, and goes stale silently if the row it names is removed.
--
-- The real identity of "which shift's drinks" is the RECEIPT — one paper, logged
-- during one shift. So the claim points at `payment_voucher_receipt.id`, and the
-- SHIFT comes through it: receipt.shift_assignment_id -> shift_assignment -> shift.
-- The shift is deliberately NOT copied onto the dispute as well; the receipt
-- already knows it, and two columns holding one fact is how they drift apart.
--
-- ON DELETE SET NULL: deleting a receipt's last line deletes the receipt
-- (deleteMyLine), and losing the paper must not delete the argument about it.
-- The claim survives, pointing at nothing, which is the truth of that situation.
--
-- `receipt_refs` is left in place, unwritten from now on: the two live rows carry
-- NULL there, and dropping a column mid-flight buys nothing.

ALTER TABLE "main"."payment_voucher_dispute"
  ADD COLUMN IF NOT EXISTS "receipt_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_voucher_dispute_receipt_id_fk'
  ) THEN
    ALTER TABLE "main"."payment_voucher_dispute"
      ADD CONSTRAINT "payment_voucher_dispute_receipt_id_fk"
      FOREIGN KEY ("receipt_id") REFERENCES "main"."payment_voucher_receipt"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "payment_voucher_dispute_receipt_id_idx"
  ON "main"."payment_voucher_dispute" ("receipt_id");

-- Backfill from the text the old column held, matched WITHIN the same voucher —
-- receipt numbers are globally unique, but scoping to the voucher means a bad
-- value can never attach a claim to another PR's paper.
UPDATE "main"."payment_voucher_dispute" AS d
SET "receipt_id" = r.id
FROM "main"."payment_voucher_receipt" AS r
WHERE d."receipt_id" IS NULL
  AND d."receipt_refs" IS NOT NULL
  AND r."voucher_id" = d."voucher_id"
  AND r."receipt_no" = d."receipt_refs"->>0;

-- One OPEN claim per shift per bucket, now keyed on the FK rather than on text
-- dug out of a jsonb array. Same rule as 0086, expressed against real columns.
DROP INDEX IF EXISTS "main"."payment_voucher_dispute_one_open_per_shift_component";

CREATE UNIQUE INDEX IF NOT EXISTS "payment_voucher_dispute_one_open_per_receipt_component"
  ON "main"."payment_voucher_dispute" (
    "voucher_id",
    "dispute_date",
    "component",
    (coalesce("receipt_id"::text, ''))
  )
  WHERE "outcome" IS NULL;
