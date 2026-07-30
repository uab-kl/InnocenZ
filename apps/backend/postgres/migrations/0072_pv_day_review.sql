-- The agency's day-by-day sign-off on a payment voucher, before it reaches
-- the PR. A week is rarely wrong all at once, so review is per shift DAY:
-- one bad Tuesday should not hold the other six days.
--
-- Keyed to review_date, NOT to a payment_voucher_line id — lines are deleted
-- and re-inserted wholesale on every voucher update, so a line-keyed review
-- would be destroyed by the next regeneration. Same reasoning as
-- payment_voucher_dispute (0051).
--
-- Hand-written rather than generated: drizzle-kit generate currently aborts on
-- a pre-existing parent-snapshot collision across 0065-0070, and letting it
-- rewrite the journal to fix that is a far bigger risk than one CREATE TABLE.
-- Additive and idempotent throughout; nothing existing is altered.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'payment_voucher_day_review_status' AND n.nspname = 'main'
  ) THEN
    CREATE TYPE "main"."payment_voucher_day_review_status" AS ENUM('approved', 'held');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "main"."payment_voucher_day_review" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "voucher_id" uuid NOT NULL,
  "review_date" date NOT NULL,
  "status" "main"."payment_voucher_day_review_status" NOT NULL,
  -- The day's total in integer CENTS at the moment it was approved. An
  -- approval without it is a claim about nothing: a day signed off at RM 300
  -- that later regenerates to RM 420 would still read "approved". Readers
  -- recompute the day and treat a mismatch as STALE.
  "approved_total_cents" integer,
  "note" varchar(1000),
  -- Cleared by "approve all" rather than opened individually.
  "bulk" boolean DEFAULT false NOT NULL,
  "reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_by" varchar NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" varchar DEFAULT 'system' NOT NULL,
  "updated_by" varchar DEFAULT 'system' NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_voucher_day_review_voucher_id_fk'
  ) THEN
    ALTER TABLE "main"."payment_voucher_day_review"
      ADD CONSTRAINT "payment_voucher_day_review_voucher_id_fk"
      FOREIGN KEY ("voucher_id") REFERENCES "main"."payment_voucher"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- One review per day; re-approving updates the row rather than stacking.
CREATE UNIQUE INDEX IF NOT EXISTS "payment_voucher_day_review_one_per_day"
  ON "main"."payment_voucher_day_review" ("voucher_id", "review_date");
