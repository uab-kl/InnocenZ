ALTER TABLE main.agency
  ADD COLUMN IF NOT EXISTS logo_image varchar;

COMMENT ON COLUMN main.agency.logo_image IS
  'R2 object key (or legacy path) for the agency logo. Same role as outlet.logo_image.';
