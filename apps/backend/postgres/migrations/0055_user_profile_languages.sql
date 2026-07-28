-- PR spoken languages live on the existing user_profile row (no new table),
-- mirroring the portfolio_photos jsonb pattern. Editable from the PR profile
-- page; agency/admin read it back through the same profile response.
ALTER TABLE "main"."user_profile" ADD COLUMN IF NOT EXISTS "languages" jsonb;
