-- A payment voucher gets its own number.
--
-- Until now the "Voucher No." printed on the document, shown in the PR app and
-- used as the download filename was DERIVED: `PV-<weekEnd>`. Every PR's voucher
-- for the same week therefore carried the same number and downloaded over the
-- top of the last one. A voucher number that cannot identify the voucher breaks
-- the paper trail it exists to provide.
--
-- It was derived in FIVE places (the backend export plus four in the PR app),
-- which is the same shape as this project's other repeated defect: a display
-- field with no column behind it does not go blank, it invents a plausible
-- value. So this is a stored fact, allocated once, that every surface reads.
--
-- Format follows the receipts already in this schema (RCP-000001): a running
-- number, allocated on insert. The WEEK is still printed on the voucher itself,
-- so nothing is lost by the number no longer carrying it.
--
-- Nullable on purpose: the column is unique, and a NULL never collides. Existing
-- rows are backfilled below in issue order, so after this migration nothing is
-- null in practice — but a null arriving later reads as "allocation failed",
-- which is honest, rather than blocking the insert of a real voucher.
--
-- Hand-written and idempotent for the same reason as 0072/0074: drizzle-kit
-- generate aborts on a pre-existing parent-snapshot collision across 0065-0070.

ALTER TABLE "main"."payment_voucher"
  ADD COLUMN IF NOT EXISTS "voucher_no" varchar(40);

-- Backfill in the order the vouchers were raised, so the sequence reads as a
-- history rather than an arbitrary shuffle.
WITH numbered AS (
  SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS seq
  FROM "main"."payment_voucher"
  WHERE "voucher_no" IS NULL
)
UPDATE "main"."payment_voucher" v
SET "voucher_no" = 'PV-' || lpad(numbered.seq::text, 6, '0')
FROM numbered
WHERE v."id" = numbered."id";

-- Unique, not primary: two vouchers must never share a number, and the index is
-- also what the allocator's retry-on-conflict loop relies on to stay correct
-- when two vouchers are raised at the same moment.
CREATE UNIQUE INDEX IF NOT EXISTS "payment_voucher_voucher_no_unique"
  ON "main"."payment_voucher" ("voucher_no");
