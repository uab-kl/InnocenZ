-- 0121 — pr_availability: the days a PR has declared themselves not available.
--
-- Keyed on the PERSON (user_id), not on the agency_pr membership: "I cannot work
-- on the 15th" is a fact about someone's life, so a PR on two rosters is
-- unavailable to both and the fact lives in exactly one place.
--
-- Fully idempotent — the shared innocenz-test DB has a second writer, so every
-- statement here must be safe to re-run.

CREATE TABLE IF NOT EXISTS "main"."pr_availability" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "unavailable_date" date NOT NULL,
  "reason" varchar(200),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" varchar DEFAULT 'system' NOT NULL,
  "updated_by" varchar DEFAULT 'system' NOT NULL
);

-- The block IS the row, so a second block of the same day is a double-tap.
-- This constraint is what lets the write be an idempotent upsert rather than a
-- read-then-insert race.
DO $$ BEGIN
  ALTER TABLE "main"."pr_availability"
    ADD CONSTRAINT "pr_availability_user_id_date_unique"
    UNIQUE ("user_id", "unavailable_date");
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "main"."pr_availability"
    ADD CONSTRAINT "pr_availability_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "main"."user"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- The agency's week grid asks "who is blocked between these two dates", and the
-- assign guard asks "is this person blocked on this date". Date first serves
-- both; the unique constraint above already covers the user-first direction.
CREATE INDEX IF NOT EXISTS "pr_availability_date_user_idx"
  ON "main"."pr_availability" ("unavailable_date", "user_id");
