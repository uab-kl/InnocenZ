-- pr: expand the pr_tier enum from 3 tiers to the full 7-tier rate model.
--
-- Reuses the existing pr.tier column / pr_tier enum (no new table, no new column).
-- Adds four values so a PR can be assigned any tier the outlet rate card supports:
--   tier_4, tier_5  -> the upper ranked tiers ('Tier IV' / 'Tier V' in the outlet
--                      workspace label space)
--   servant         -> lower base + lower commission ('Servant')
--   commission_only -> no base wage, high commission (outlet_tier_rate kind
--                      'commission_only')
--
-- These new values are only added here, not used in this migration, so they are
-- safe to add inside the migration transaction (Postgres 12+).

ALTER TYPE "main"."pr_tier" ADD VALUE IF NOT EXISTS 'tier_4';--> statement-breakpoint

ALTER TYPE "main"."pr_tier" ADD VALUE IF NOT EXISTS 'tier_5';--> statement-breakpoint

ALTER TYPE "main"."pr_tier" ADD VALUE IF NOT EXISTS 'servant';--> statement-breakpoint

ALTER TYPE "main"."pr_tier" ADD VALUE IF NOT EXISTS 'commission_only';
