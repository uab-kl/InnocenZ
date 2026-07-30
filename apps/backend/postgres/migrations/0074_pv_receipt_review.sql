-- The receipt review lifecycle: PENDING -> APPROVED -> VERIFIED.
--
-- A self-logged receipt is the PR telling the agency what they sold. Until now
-- it was money the moment it was written: the line fed the voucher net and
-- nobody had to look at the photo. This adds the state that makes the review a
-- real step, and the state the PR reads before they are allowed to contest a
-- figure.
--
-- Only source='manual' starts PENDING (owner's decision, 30 Jul 2026). An OCR
-- 'scan' and an auto-sealed 'checkin' go straight to APPROVED — nobody
-- self-declared them, and the PR can still dispute once the week is issued.
--
-- BACKFILL, and it matters: defaulting existing rows to 'pending' would
-- retroactively hold vouchers whose money has already moved, because a pending
-- receipt blocks the send. Rows on an issued week become 'verified'; rows on a
-- week still under review become 'approved'. Either way, nothing existing lands
-- in the blocking state.
--
-- reviewed_at / reviewed_by stay NULL on those backfilled rows on purpose: no
-- person reviewed them. A NULL reviewed_at beside status='approved' therefore
-- reads as "pre-dates the review flow", the same way a NULL
-- payment_voucher_line.component means "pre-dates classification".
--
-- Hand-written and idempotent for the same reason as 0072: drizzle-kit generate
-- aborts on a pre-existing parent-snapshot collision across 0065-0070, and
-- letting it rewrite the journal is a bigger risk than three ALTERs.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'payment_voucher_receipt_status' AND n.nspname = 'main'
  ) THEN
    CREATE TYPE "main"."payment_voucher_receipt_status" AS ENUM('pending', 'approved', 'verified');
  END IF;
END $$;

ALTER TABLE "main"."payment_voucher_receipt"
  ADD COLUMN IF NOT EXISTS "status" "main"."payment_voucher_receipt_status"
    DEFAULT 'pending' NOT NULL;

ALTER TABLE "main"."payment_voucher_receipt"
  ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;

ALTER TABLE "main"."payment_voucher_receipt"
  ADD COLUMN IF NOT EXISTS "reviewed_by" varchar;

-- Existing rows: never 'pending'. An issued/settled week is closed evidence
-- (verified); a week still at pending_review is evidence the agency may still
-- look at, but must not be blocked by (approved).
UPDATE "main"."payment_voucher_receipt" r
SET "status" = 'verified'
WHERE r."status" = 'pending'
  AND r."reviewed_at" IS NULL
  AND EXISTS (
    SELECT 1 FROM "main"."payment_voucher" v
    WHERE v."id" = r."voucher_id"
      AND v."status" IN ('sent', 'signed', 'paid', 'disputed')
  );

UPDATE "main"."payment_voucher_receipt" r
SET "status" = 'approved'
WHERE r."status" = 'pending'
  AND r."reviewed_at" IS NULL
  AND EXISTS (
    SELECT 1 FROM "main"."payment_voucher" v
    WHERE v."id" = r."voucher_id"
      AND v."status" = 'pending_review'
  );

-- The agency's review queue: what is still waiting, oldest first. Partial, so
-- it stays small no matter how many receipts the table accumulates.
CREATE INDEX IF NOT EXISTS "payment_voucher_receipt_pending_idx"
  ON "main"."payment_voucher_receipt" ("created_at")
  WHERE "status" = 'pending';
