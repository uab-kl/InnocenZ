-- Two related corrections to the outlet rate card + its child tables.
--
-- (1) Daily-wage semantics. outlet_tier_rate.wage_per_hour was always meant to
--     hold the PR's DAILY wage (e.g. Tier I = 500) and ot_after_hours the number
--     of STANDARD shift hours (6). The columns were misnamed and the seed stored
--     hourly-equivalents instead (83.33 / OT-per-hour 125). Rename the columns to
--     their true meaning and repair the seeded rows. shift_pay_tier mirrors the
--     same shape (per-shift override, currently empty) so it is renamed in step.
--
-- (2) Direct outlet_id. One outlet owns exactly one rate card and one drink/
--     service menu, so both child tables get a direct outlet_id (backfilled from
--     the parent workspace, NOT NULL, cascade) alongside the existing
--     workspace_id — a convenience FK for outlet-scoped queries.
--
-- Every step is guarded (IF EXISTS / DO blocks) so a re-run after a partial
-- failure is safe.

-- (1a) outlet_tier_rate: rename wage_per_hour -> daily_wage
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='main' AND table_name='outlet_tier_rate' AND column_name='wage_per_hour') THEN
    ALTER TABLE "main"."outlet_tier_rate" RENAME COLUMN "wage_per_hour" TO "daily_wage";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='main' AND table_name='outlet_tier_rate' AND column_name='ot_after_hours') THEN
    ALTER TABLE "main"."outlet_tier_rate" RENAME COLUMN "ot_after_hours" TO "standard_shift_hours";
  END IF;
END $$;
--> statement-breakpoint
-- (1b) shift_pay_tier: same rename (empty table, keeps the shared resolver shape)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='main' AND table_name='shift_pay_tier' AND column_name='wage_per_hour') THEN
    ALTER TABLE "main"."shift_pay_tier" RENAME COLUMN "wage_per_hour" TO "daily_wage";
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='main' AND table_name='shift_pay_tier' AND column_name='ot_after_hours') THEN
    ALTER TABLE "main"."shift_pay_tier" RENAME COLUMN "ot_after_hours" TO "standard_shift_hours";
  END IF;
END $$;
--> statement-breakpoint
-- (1c) Repair stale hourly-equivalent rows. A real standard shift is <= 24h, so
-- any tier row whose standard_shift_hours still holds the old OT-per-hour value
-- (> 24) is stale: reconstruct the daily wage (hourly x 6 standard hours) and
-- pin the standard shift to 6. Correctly-entered rows (hours <= 24) are skipped;
-- commission_only rows have NULL wage/hours and are excluded by the predicate.
UPDATE "main"."outlet_tier_rate"
  SET "daily_wage" = ROUND("daily_wage" * 6),
      "standard_shift_hours" = 6
  WHERE "kind" = 'tier' AND "standard_shift_hours" > 24;
--> statement-breakpoint
-- (2a) outlet_tier_rate.outlet_id
ALTER TABLE "main"."outlet_tier_rate" ADD COLUMN IF NOT EXISTS "outlet_id" uuid;
--> statement-breakpoint
UPDATE "main"."outlet_tier_rate" t
  SET "outlet_id" = w."outlet_id"
  FROM "main"."outlet_workspace" w
  WHERE w."id" = t."workspace_id" AND t."outlet_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "main"."outlet_tier_rate" ALTER COLUMN "outlet_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "main"."outlet_tier_rate" ADD CONSTRAINT "outlet_tier_rate_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "main"."outlet"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- (2b) outlet_drink_menu.outlet_id
ALTER TABLE "main"."outlet_drink_menu" ADD COLUMN IF NOT EXISTS "outlet_id" uuid;
--> statement-breakpoint
UPDATE "main"."outlet_drink_menu" d
  SET "outlet_id" = w."outlet_id"
  FROM "main"."outlet_workspace" w
  WHERE w."id" = d."workspace_id" AND d."outlet_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "main"."outlet_drink_menu" ALTER COLUMN "outlet_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "main"."outlet_drink_menu" ADD CONSTRAINT "outlet_drink_menu_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "main"."outlet"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
