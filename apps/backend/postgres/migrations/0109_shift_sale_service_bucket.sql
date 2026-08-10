-- 0109 — give shift_sale its own SERVICE revenue bucket.
--
-- Floor sales on the outlet Reports page counts drinks + tips + services, but
-- shift_sale only had drink/tip pairs. Services are ~97% of the gross a PR
-- logs, so folding them into tip_sales_rm would report service entitlements to
-- the outlet as "tips" — a misstatement on a money screen, and unsplittable
-- afterwards without a backfill. They get their own column instead.
--
-- Mirrors the existing units + RM pairing so all three buckets read alike.
-- total_sales_rm is now drink + tip + service; existing rows are unaffected
-- because the new column defaults to 0 (and there are none today — this table
-- has never had a writer).

ALTER TABLE main.shift_sale
  ADD COLUMN IF NOT EXISTS service_units integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_sales_rm numeric(12, 2) NOT NULL DEFAULT '0';

COMMENT ON COLUMN main.shift_sale.service_units IS
  'Service-entitlement items sold on this (shift, PR) — raw count, for display.';
COMMENT ON COLUMN main.shift_sale.service_sales_rm IS
  'Gross service-entitlement revenue in RM. Third floor-sales bucket beside drinks and tips; counted in total_sales_rm.';
