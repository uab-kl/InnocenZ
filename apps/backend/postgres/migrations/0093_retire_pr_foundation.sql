-- Foundation for retiring `main.pr`:
-- 1) Membership (`agency_pr`) owns tier + reject_reason (person facts stay on user/user_profile).
-- 2) Ops tables gain `user_id` so they can stop depending on `pr.id`.
-- 3) Backfill from existing `pr` rows. Do NOT drop `pr` here — that is a later cutover
--    after dual-write and /mine paths key only on user_id.

-- ── agency_pr commercial fields ─────────────────────────────────────────────
ALTER TABLE "main"."agency_pr"
  ADD COLUMN IF NOT EXISTS "tier" "main"."pr_tier" NOT NULL DEFAULT 'tier_1';--> statement-breakpoint
ALTER TABLE "main"."agency_pr"
  ADD COLUMN IF NOT EXISTS "reject_reason" varchar(500);--> statement-breakpoint

-- Ensure every pr-with-account has a membership row, then copy tier / reject.
INSERT INTO "main"."agency_pr" (
  "id", "agency_id", "user_id", "approve_status", "tier", "reject_reason",
  "created_at", "updated_at", "created_by", "updated_by"
)
SELECT
  gen_random_uuid(),
  p."agency_id",
  p."user_id",
  CASE
    WHEN p."status" = 'pending' THEN 'pending'::"main"."agency_pr_approve_status"
    WHEN p."status" = 'inactive' AND p."reject_reason" IS NOT NULL
      THEN 'rejected'::"main"."agency_pr_approve_status"
    WHEN p."status" IN ('active', 'suspended') THEN 'approved'::"main"."agency_pr_approve_status"
    ELSE 'approved'::"main"."agency_pr_approve_status"
  END,
  p."tier",
  p."reject_reason",
  p."created_at",
  p."updated_at",
  p."created_by",
  p."updated_by"
FROM "main"."pr" p
WHERE p."user_id" IS NOT NULL
ON CONFLICT ("agency_id", "user_id") DO UPDATE SET
  "tier" = EXCLUDED."tier",
  "reject_reason" = COALESCE("main"."agency_pr"."reject_reason", EXCLUDED."reject_reason"),
  "updated_at" = now();--> statement-breakpoint

UPDATE "main"."agency_pr" ap
SET
  "tier" = p."tier",
  "reject_reason" = COALESCE(ap."reject_reason", p."reject_reason"),
  "updated_at" = now()
FROM "main"."pr" p
WHERE p."user_id" = ap."user_id"
  AND p."agency_id" = ap."agency_id";--> statement-breakpoint

-- ── Ops tables: dual-key with user_id ───────────────────────────────────────
ALTER TABLE "main"."shift_assignment"
  ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
ALTER TABLE "main"."shift_sale"
  ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
ALTER TABLE "main"."payment_voucher"
  ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
ALTER TABLE "main"."special_service"
  ADD COLUMN IF NOT EXISTS "posting_user_id" uuid;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "main"."shift_assignment"
    ADD CONSTRAINT "shift_assignment_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "main"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "main"."shift_sale"
    ADD CONSTRAINT "shift_sale_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "main"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "main"."payment_voucher"
    ADD CONSTRAINT "payment_voucher_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "main"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "main"."special_service"
    ADD CONSTRAINT "special_service_posting_user_id_user_id_fk"
    FOREIGN KEY ("posting_user_id") REFERENCES "main"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

UPDATE "main"."shift_assignment" sa
SET "user_id" = p."user_id"
FROM "main"."pr" p
WHERE sa."pr_id" = p."id"
  AND p."user_id" IS NOT NULL
  AND sa."user_id" IS NULL;--> statement-breakpoint

UPDATE "main"."shift_sale" ss
SET "user_id" = p."user_id"
FROM "main"."pr" p
WHERE ss."pr_id" = p."id"
  AND p."user_id" IS NOT NULL
  AND ss."user_id" IS NULL;--> statement-breakpoint

UPDATE "main"."payment_voucher" pv
SET "user_id" = p."user_id"
FROM "main"."pr" p
WHERE pv."pr_id" = p."id"
  AND p."user_id" IS NOT NULL
  AND pv."user_id" IS NULL;--> statement-breakpoint

UPDATE "main"."special_service" s
SET "posting_user_id" = p."user_id"
FROM "main"."pr" p
WHERE s."posting_pr_id" = p."id"
  AND p."user_id" IS NOT NULL
  AND s."posting_user_id" IS NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "shift_assignment_user_id_idx"
  ON "main"."shift_assignment" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shift_sale_user_id_idx"
  ON "main"."shift_sale" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_voucher_user_id_idx"
  ON "main"."payment_voucher" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "special_service_posting_user_id_idx"
  ON "main"."special_service" ("posting_user_id");
