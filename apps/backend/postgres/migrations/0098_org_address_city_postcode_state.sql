-- 0098 — structured organisation address (agency + outlet).
--
-- Web outlet/agency signup collects line1/line2/city/postcode/state/country.
-- `outlet` already has postcode/state/country; it was missing `city`.
-- `agency` only had two address lines (0077) — add the same locality columns
-- so company address lives on the ORG, not on the portal user's `user_profile`
-- (rule 1: one fact, one table; PR home address stays on user_profile only).
--
-- All nullable + IF NOT EXISTS: additive, safe on the shared DB, no backfill.

ALTER TABLE main.agency
  ADD COLUMN IF NOT EXISTS city varchar(100),
  ADD COLUMN IF NOT EXISTS postcode varchar(20),
  ADD COLUMN IF NOT EXISTS state varchar(100),
  ADD COLUMN IF NOT EXISTS country varchar(100);

ALTER TABLE main.outlet
  ADD COLUMN IF NOT EXISTS city varchar(100);

COMMENT ON COLUMN main.agency.city IS
  'Locality for the agency company address (signup / PV letterhead).';
COMMENT ON COLUMN main.agency.postcode IS
  'Postcode for the agency company address.';
COMMENT ON COLUMN main.agency.state IS
  'State / province for the agency company address.';
COMMENT ON COLUMN main.agency.country IS
  'Country for the agency company address.';
COMMENT ON COLUMN main.outlet.city IS
  'Locality for the outlet venue address (signup / check-in card).';
