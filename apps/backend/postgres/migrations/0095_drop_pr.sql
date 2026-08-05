-- Cut over off `main.pr`:
-- 1) Final user_id backfill from pr.
-- 2) Drop every FK that pointed at `main.pr` (must happen BEFORE remapping
--    pr_id → user_id, because user_id is not a row in pr).
-- 3) Remap ops `pr_id` / `posting_pr_id` / rating.pr_id to the linked user_id
--    so synthetic identity id===userId keeps working with existing uniques.
-- 4) DROP TABLE main.pr.
-- Columns named pr_id stay for now (orphan uuids that equal user_id after remap).

-- ── Final user_id backfill from pr (idempotent) ─────────────────────────────
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

-- Refuse cutover if any ops row still needs pr but has no user_id.
DO $$
DECLARE
  bad int;
BEGIN
  SELECT COUNT(*)::int INTO bad FROM "main"."pr" WHERE "user_id" IS NULL;
  IF bad > 0 THEN
    RAISE EXCEPTION '0089_drop_pr: % pr row(s) have no user_id — refuse drop', bad;
  END IF;

  SELECT COUNT(*)::int INTO bad
  FROM "main"."shift_assignment" WHERE "pr_id" IS NOT NULL AND "user_id" IS NULL;
  IF bad > 0 THEN
    RAISE EXCEPTION '0089_drop_pr: % shift_assignment row(s) lack user_id', bad;
  END IF;

  SELECT COUNT(*)::int INTO bad
  FROM "main"."payment_voucher" WHERE "pr_id" IS NOT NULL AND "user_id" IS NULL;
  IF bad > 0 THEN
    RAISE EXCEPTION '0089_drop_pr: % payment_voucher row(s) lack user_id', bad;
  END IF;

  SELECT COUNT(*)::int INTO bad
  FROM "main"."shift_sale" WHERE "pr_id" IS NOT NULL AND "user_id" IS NULL;
  IF bad > 0 THEN
    RAISE EXCEPTION '0089_drop_pr: % shift_sale row(s) lack user_id', bad;
  END IF;
END $$;--> statement-breakpoint

-- ── Drop FKs pointing at main.pr (BEFORE remap) ─────────────────────────────
ALTER TABLE "main"."payment_voucher"
  DROP CONSTRAINT IF EXISTS "payment_voucher_pr_id_pr_id_fk";--> statement-breakpoint
ALTER TABLE "main"."shift_assignment"
  DROP CONSTRAINT IF EXISTS "shift_assignment_pr_id_pr_id_fk";--> statement-breakpoint
ALTER TABLE "main"."shift_sale"
  DROP CONSTRAINT IF EXISTS "shift_sale_pr_id_pr_id_fk";--> statement-breakpoint
ALTER TABLE "main"."special_service"
  DROP CONSTRAINT IF EXISTS "special_service_posting_pr_id_pr_id_fk";--> statement-breakpoint

-- ── Remap pr_id → user_id (values only; columns stay) ───────────────────────
UPDATE "main"."shift_assignment"
SET "pr_id" = "user_id"
WHERE "user_id" IS NOT NULL
  AND "pr_id" IS DISTINCT FROM "user_id";--> statement-breakpoint

UPDATE "main"."shift_sale"
SET "pr_id" = "user_id"
WHERE "user_id" IS NOT NULL
  AND "pr_id" IS DISTINCT FROM "user_id";--> statement-breakpoint

UPDATE "main"."payment_voucher"
SET "pr_id" = "user_id"
WHERE "user_id" IS NOT NULL
  AND "pr_id" IS DISTINCT FROM "user_id";--> statement-breakpoint

UPDATE "main"."special_service"
SET "posting_pr_id" = "posting_user_id"
WHERE "posting_user_id" IS NOT NULL
  AND "posting_pr_id" IS DISTINCT FROM "posting_user_id";--> statement-breakpoint

-- rating.pr_id is varchar (no FK). Remap old pr.id text → user_id text.
UPDATE "main"."rating" r
SET "pr_id" = p."user_id"::text
FROM "main"."pr" p
WHERE r."pr_id" = p."id"::text
  AND p."user_id" IS NOT NULL
  AND r."pr_id" IS DISTINCT FROM p."user_id"::text;--> statement-breakpoint

-- Collapse duplicate ratings if two pr rows for one user remapped onto one key.
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY outlet_id, pr_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
    ) AS rn
  FROM "main"."rating"
)
DELETE FROM "main"."rating" r
USING ranked x
WHERE r.id = x.id AND x.rn > 1;--> statement-breakpoint

-- ── Drop the table ──────────────────────────────────────────────────────────
DROP TABLE IF EXISTS "main"."pr";
