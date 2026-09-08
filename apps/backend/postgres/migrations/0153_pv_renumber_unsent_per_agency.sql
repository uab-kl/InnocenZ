-- Renumber the vouchers that have never left their agency, per agency, from 1.
--
-- 0152 stopped the bug recurring but deliberately left history alone. This is
-- the follow-up the owner asked for, and it is scoped as narrowly as the ask
-- allows: ONLY vouchers still at `pending_review` are touched.
--
-- WHY THAT LINE. A voucher number is printed on the PDF, written into the Excel
-- export, and quoted in a payment reference. Once a voucher has been SENT the
-- number is out of the building, and changing it leaves two different documents
-- answering to the same name -- the precise failure 0075's own comments describe
-- when a number is recycled. A `pending_review` voucher has never been sent to
-- the PR and appears in nothing anyone holds, so its number is still ours to
-- correct. Everything at sent / signed / paid keeps what it has, forever.
--
-- CONSEQUENCE, ACCEPTED: an agency can end up with gaps. If a sent PV-000004
-- sits between two unsent ones, the unsent pair takes 1 and 2 and the sequence
-- reads 1, 2, 4. A gap is a truthful record of a number already spent; the
-- alternative is rewriting the document that spent it.
--
-- Assignment is the SMALLEST NUMBER NOT ALREADY HELD by that agency, so this can
-- never collide with a kept number, and never with itself -- which is what lets
-- 0152's UNIQUE (agency_id, voucher_no) hold through the update.

BEGIN;

WITH taken AS (
  -- Numbers that must not move, per agency.
  SELECT
    "agency_id",
    NULLIF(regexp_replace("voucher_no", '\D', '', 'g'), '')::int AS n
  FROM "main"."payment_voucher"
  WHERE "status" <> 'pending_review'
    AND "voucher_no" IS NOT NULL
),
unsent AS (
  -- Oldest first, so the order they were raised in survives the renumber.
  SELECT
    "id",
    "agency_id",
    row_number() OVER (
      PARTITION BY "agency_id"
      ORDER BY "created_at", "id"
    ) AS rn
  FROM "main"."payment_voucher"
  WHERE "status" = 'pending_review'
),
assigned AS (
  SELECT
    u."id",
    (
      SELECT c
      FROM generate_series(
        1,
        (SELECT count(*) + 10 FROM "main"."payment_voucher")::int
      ) AS c
      WHERE NOT EXISTS (
        SELECT 1 FROM taken t
        WHERE t."agency_id" = u."agency_id" AND t."n" = c
      )
      ORDER BY c
      OFFSET u.rn - 1
      LIMIT 1
    ) AS num
  FROM unsent u
)
UPDATE "main"."payment_voucher" v
SET "voucher_no" = 'PV-' || lpad(a."num"::text, 6, '0'),
    "updated_at" = now()
FROM assigned a
WHERE v."id" = a."id"
  AND a."num" IS NOT NULL
  -- Skip rows already holding the number they would be given, so this migration
  -- is a no-op on a database that has already run it.
  AND v."voucher_no" IS DISTINCT FROM 'PV-' || lpad(a."num"::text, 6, '0');

COMMIT;
