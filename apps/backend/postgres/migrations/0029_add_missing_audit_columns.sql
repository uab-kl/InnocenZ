-- Rule 3: every table carries created_at / created_by / updated_at / updated_by.
--
-- created_by/updated_by keep DEFAULT 'system' rather than being bare NOT NULL like
-- the older tables. These tables are written by repositories that do not pass an
-- actor (outlet workspace children, voucher lines, reset tokens, audit middleware),
-- so a bare NOT NULL would break every insert. The default makes the column always
-- populated; callers that do know the actor still override it.
--
-- Excluded on purpose: admin_mfa, dispute, platform_standards — they exist in the
-- shared DB with no model and no migration in this repo, so they are not ours to alter.
-- platform_config only lacks created_by: its model already declared the column, so
-- the DB had drifted and inserts through that repository would have failed.

ALTER TABLE "main"."outlet_tier_rate" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."outlet_tier_rate" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."outlet_tier_rate" ADD COLUMN IF NOT EXISTS "created_by" varchar DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."outlet_tier_rate" ADD COLUMN IF NOT EXISTS "updated_by" varchar DEFAULT 'system' NOT NULL;--> statement-breakpoint

ALTER TABLE "main"."outlet_drink_menu" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."outlet_drink_menu" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."outlet_drink_menu" ADD COLUMN IF NOT EXISTS "created_by" varchar DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."outlet_drink_menu" ADD COLUMN IF NOT EXISTS "updated_by" varchar DEFAULT 'system' NOT NULL;--> statement-breakpoint

ALTER TABLE "main"."outlet_penalty_rule" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."outlet_penalty_rule" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."outlet_penalty_rule" ADD COLUMN IF NOT EXISTS "created_by" varchar DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."outlet_penalty_rule" ADD COLUMN IF NOT EXISTS "updated_by" varchar DEFAULT 'system' NOT NULL;--> statement-breakpoint

ALTER TABLE "main"."payment_voucher_line" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."payment_voucher_line" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."payment_voucher_line" ADD COLUMN IF NOT EXISTS "created_by" varchar DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."payment_voucher_line" ADD COLUMN IF NOT EXISTS "updated_by" varchar DEFAULT 'system' NOT NULL;--> statement-breakpoint

ALTER TABLE "main"."platform_config" ADD COLUMN IF NOT EXISTS "created_by" varchar DEFAULT 'system' NOT NULL;--> statement-breakpoint

ALTER TABLE "main"."reset_password_token" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."reset_password_token" ADD COLUMN IF NOT EXISTS "created_by" varchar DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."reset_password_token" ADD COLUMN IF NOT EXISTS "updated_by" varchar DEFAULT 'system' NOT NULL;--> statement-breakpoint

ALTER TABLE "main"."audit_logs" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."audit_logs" ADD COLUMN IF NOT EXISTS "created_by" varchar DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."audit_logs" ADD COLUMN IF NOT EXISTS "updated_by" varchar DEFAULT 'system' NOT NULL;
