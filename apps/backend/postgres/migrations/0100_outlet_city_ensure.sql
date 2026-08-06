-- 0100 — ensure outlet.city exists (repair for 0098).
--
-- Signup insert references outlet.city. 0098 should have added it, but live
-- register hit 42703 (undefined_column) on city — re-apply idempotently.

ALTER TABLE main.outlet
  ADD COLUMN IF NOT EXISTS city varchar(100);

COMMENT ON COLUMN main.outlet.city IS
  'Locality for the outlet venue address (signup / check-in card).';
