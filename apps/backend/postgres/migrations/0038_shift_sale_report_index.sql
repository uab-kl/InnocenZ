-- shift_sale report index: the outlet Reports byDay aggregate scopes a caller to
-- its outlet(s) and filters/groups by sold_on. Cover (outlet_id, sold_on) so the
-- scan stays index-backed as the table grows. IF NOT EXISTS keeps it idempotent.
CREATE INDEX IF NOT EXISTS "shift_sale_outlet_sold_on_idx" ON "main"."shift_sale" ("outlet_id","sold_on");
