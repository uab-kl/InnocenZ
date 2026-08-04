-- City on the person address (PR sign-up Step 2).
--
-- `user_profile` already holds address_line_1/2, postcode, state, country — city
-- belongs on the same row (rule 1), not a new table. Nullable + IF NOT EXISTS so
-- existing profiles stay valid and the migration is safe mid-request on the
-- shared DB.
ALTER TABLE main.user_profile
  ADD COLUMN IF NOT EXISTS city varchar(100);

COMMENT ON COLUMN main.user_profile.city IS
  'City / locality for the PR home address. Blanked for outlet callers with the rest of the address.';
