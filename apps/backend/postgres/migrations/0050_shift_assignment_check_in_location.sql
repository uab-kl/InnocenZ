-- shift-assignment: record WHERE the PR stood when they stamped attendance,
-- so the 50 m geo-fence is verified by the server instead of trusted from the
-- phone, and the agency roster can plot the PR's real position on the outlet.
--
-- Reuses the existing shift_assignment table (no new table). No name, outlet or
-- PR detail is copied here — the outlet's own pin is reached by FK
-- (shift_assignment.shift_id -> shift.outlet_id -> outlet.lat/lng/
-- geo_fence_radius), so moving an outlet's pin instantly re-fences every future
-- check-in. The table already carries created_at / updated_at / created_by /
-- updated_by, so no audit columns are added or needed.
--
-- distance_m is the server's OWN recomputed metres from that outlet pin, never
-- a distance the phone claimed — the phone is the thing being checked, so it
-- does not get to grade itself. accuracy_m is the device's reported confidence
-- radius, kept for audit only.
--
-- All columns are nullable on purpose: rows written before this migration, and
-- outlets that have not dropped a map pin yet, simply carry no fix. This is a
-- SNAPSHOT at the two attendance moments, not continuous location tracking.

ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "check_in_lat" numeric(10, 8);--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "check_in_lng" numeric(11, 8);--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "check_in_distance_m" integer;--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "check_in_accuracy_m" integer;--> statement-breakpoint

ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "check_out_lat" numeric(10, 8);--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "check_out_lng" numeric(11, 8);--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "check_out_distance_m" integer;--> statement-breakpoint
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "check_out_accuracy_m" integer;
