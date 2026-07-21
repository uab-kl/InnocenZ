-- special_service: outlet_name / assigned_agency_id / assigned_agency_name go.
--
-- assigned_agency_name turned out NOT to be dual-purpose after all. Probing the
-- live table shows assigned_agency_id is NULL on all 10 rows — it has never
-- once been populated — so the name column only ever held external vendors:
-- MetroRide Transport, RapidCover Staffing, Glow & Co Makeup Studio and
-- Atelier Threads (seeded via a `thirdParty` field).
--
-- So this is a rename, not a data migration: assigned_agency_name becomes
-- vendor_name and the four vendors keep their names exactly where they are.
-- assigned_agency_id is dropped as the dead column it is.
--
-- outlet_name is a denormalized copy of outlet.name. outlet_id is non-null on
-- all 10 rows, so the read paths join to main.outlet instead and every API
-- response keeps its outletName field.
--
-- posting_agency_id / posting_agency_name are untouched — not in this spec.

ALTER TABLE "main"."special_service" RENAME COLUMN "assigned_agency_name" TO "vendor_name";--> statement-breakpoint

ALTER TABLE "main"."special_service" DROP COLUMN IF EXISTS "assigned_agency_id";--> statement-breakpoint

ALTER TABLE "main"."special_service" DROP COLUMN IF EXISTS "outlet_name";
