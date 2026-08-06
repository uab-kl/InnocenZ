-- 0106 — ensure agency locality columns exist (repair for 0098).
--
-- Agency list/signup select city/postcode/state/country. 0098 is in the
-- journal but live `innocenz-test` still lacked those four columns (42703),
-- while logo_image + address lines were present. Re-apply idempotently.

ALTER TABLE main.agency
  ADD COLUMN IF NOT EXISTS city varchar(100),
  ADD COLUMN IF NOT EXISTS postcode varchar(20),
  ADD COLUMN IF NOT EXISTS state varchar(100),
  ADD COLUMN IF NOT EXISTS country varchar(100);

COMMENT ON COLUMN main.agency.city IS
  'Locality for the agency company address (signup / PV letterhead).';
COMMENT ON COLUMN main.agency.postcode IS
  'Postcode for the agency company address.';
COMMENT ON COLUMN main.agency.state IS
  'State / province for the agency company address.';
COMMENT ON COLUMN main.agency.country IS
  'Country for the agency company address.';
