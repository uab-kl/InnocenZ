-- Drop the plan/limit tables. subscription_feature references limit_type, role and
-- subscription, so it goes first. Plan-to-role linkage is dropped entirely; the
-- audience is now derived from subscription.billing_cycle (monthly = outlet,
-- weekly = agency) and will be reintroduced on a different table later.
DROP TABLE IF EXISTS "main"."subscription_feature";
--> statement-breakpoint
DROP TABLE IF EXISTS "main"."subscription_role";
--> statement-breakpoint
DROP TABLE IF EXISTS "main"."limit_type";
