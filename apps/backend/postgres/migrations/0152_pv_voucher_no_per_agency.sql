-- A voucher number belongs to ONE AGENCY's books, not to the platform.
--
-- 0075 numbered vouchers globally and made `voucher_no` unique across the whole
-- table. That was right while effectively one agency was issuing them, and it
-- broke the moment a second started: "Why We Met" raised its very first payment
-- voucher and it came out `PV-000013`, because the allocator took
-- MAX(voucher_no) over every row in the system and handed a new company Atlas
-- Agency's running total. A voucher number is what an agency files a payment
-- under; inheriting another company's count makes its own books unreadable and
-- leaks the platform's volume to anyone holding the document.
--
-- The allocator is now scoped to the agency (see `nextVoucherNo`), so two
-- agencies each holding a `PV-000001` is the CORRECT state. The old index would
-- reject the second one, so uniqueness moves to the pair.
--
-- EXISTING NUMBERS ARE NOT REWRITTEN. Every voucher keeps the number it was
-- issued under, including "Why We Met"'s `PV-000013`. A voucher number appears
-- in exports a PR has already downloaded and in the PDF a payment was made
-- against, so renumbering silently would leave two different documents
-- answering to the same name -- the exact failure 0075's own comments warn about
-- when a number is recycled. Renumbering is a separate, deliberate decision;
-- this migration only stops the bug from happening again.

BEGIN;

-- Drop FIRST: while it exists, two agencies cannot both hold PV-000001, and the
-- allocator's retry loop would spin through its attempts and fail the insert.
DROP INDEX IF EXISTS "main"."payment_voucher_voucher_no_unique";

-- Drizzle's `.unique()` on the column may have created a table CONSTRAINT rather
-- than a bare index, depending on which path created this database. Dropping the
-- index alone would leave that constraint still enforcing the old rule.
ALTER TABLE "main"."payment_voucher"
  DROP CONSTRAINT IF EXISTS "payment_voucher_voucher_no_unique";

-- Unique on the PAIR. Still the thing the allocator's retry-on-conflict loop
-- relies on to stay correct when two vouchers are raised for the same agency at
-- the same moment -- it just no longer makes one agency's numbering depend on
-- another's.
--
-- A NULL voucher_no stays unconstrained under Postgres' usual NULL semantics,
-- which is what lets a row exist briefly before a number is allocated.
CREATE UNIQUE INDEX IF NOT EXISTS "payment_voucher_agency_voucher_no_unique"
  ON "main"."payment_voucher" ("agency_id", "voucher_no");

COMMIT;
