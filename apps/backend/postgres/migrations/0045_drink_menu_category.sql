-- Split the outlet's service-entitlement list into "Drinks Price" vs "Services".
-- A per-item category drives which list an entry shows under. Existing rows
-- default to 'service' (the section's prior meaning); drinks are recategorized
-- in the UI. NOT NULL + default keeps the backfill trivial.
ALTER TABLE "main"."outlet_drink_menu"
  ADD COLUMN IF NOT EXISTS "category" varchar(20) NOT NULL DEFAULT 'service';
