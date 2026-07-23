-- Proof photo(s) the PR snaps when self-logging a drink (one or many). Stored
-- on the existing payment_voucher_line row (reused table, not a new one) as a
-- jsonb array of image refs — same pattern as user_profile.portfolio_photos.
ALTER TABLE "main"."payment_voucher_line" ADD COLUMN IF NOT EXISTS "proof_photos" jsonb;
