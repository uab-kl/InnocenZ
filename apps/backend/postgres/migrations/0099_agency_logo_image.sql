-- 0099 — agency logo_image (parity with outlet).
--
-- Outlet already stores `logo_image` (0021). Agency signup now uploads a logo
-- to R2 (`user/agency/logo/{id}_{name}/…`) and needs the same column to hold
-- the object key. Nullable + IF NOT EXISTS — additive, safe on shared DB.

ALTER TABLE main.agency
  ADD COLUMN IF NOT EXISTS logo_image varchar;

COMMENT ON COLUMN main.agency.logo_image IS
  'R2 object key (or legacy path) for the agency logo. Same role as outlet.logo_image.';
