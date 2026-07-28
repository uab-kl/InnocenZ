-- Snapshot catch-up, not new schema. `languages` reached the shared DB through
-- 0055_user_profile_languages on the other branch, but the snapshot this branch
-- generates against predated it, so drizzle re-proposed the column on the merge.
-- IF NOT EXISTS because the column is already live: this migration's `when`
-- (1785226573408) is above the live ledger max, so it WILL run, and an unguarded
-- ADD COLUMN would abort the whole migrate with "column already exists".
ALTER TABLE "main"."user_profile" ADD COLUMN IF NOT EXISTS "languages" jsonb;