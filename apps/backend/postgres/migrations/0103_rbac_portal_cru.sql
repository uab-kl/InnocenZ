-- RBAC redesign: portal → role → module C/R/U
-- 1) Master portals  2) role.portal_id / m_module.portal_id + module_key
-- 3) Drop delete permission  4) user_role FKs

CREATE TABLE IF NOT EXISTS "main"."portal" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(50) NOT NULL,
  "name" varchar(100) NOT NULL,
  "status" varchar NOT NULL DEFAULT 'active',
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" varchar NOT NULL,
  "updated_by" varchar NOT NULL,
  CONSTRAINT "portal_code_uidx" UNIQUE ("code")
);

INSERT INTO "main"."portal" ("id", "code", "name", "status", "created_by", "updated_by")
VALUES
  (gen_random_uuid(), 'admin', 'Admin', 'active', 'system', 'system'),
  (gen_random_uuid(), 'agency', 'Agency', 'active', 'system', 'system'),
  (gen_random_uuid(), 'outlet', 'Outlet', 'active', 'system', 'system')
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "main"."role"
  ADD COLUMN IF NOT EXISTS "portal_id" uuid;

ALTER TABLE "main"."m_module"
  ADD COLUMN IF NOT EXISTS "portal_id" uuid,
  ADD COLUMN IF NOT EXISTS "module_key" varchar(100);

-- Backfill portal on seeded platform roles (pr stays null — mobile, not a web portal).
UPDATE "main"."role" r
SET "portal_id" = p."id",
    "updated_at" = now(),
    "updated_by" = 'system'
FROM "main"."portal" p
WHERE r."portal_id" IS NULL
  AND (
    (lower(r."role_name") = 'admin' AND p."code" = 'admin')
    OR (lower(r."role_name") IN ('agency', 'agency_owner', 'agency_finance') AND p."code" = 'agency')
    OR (lower(r."role_name") IN ('outlet', 'outlet_owner', 'outlet_finance', 'outlet_ops') AND p."code" = 'outlet')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'role_portal_id_fk'
  ) THEN
    ALTER TABLE "main"."role"
      ADD CONSTRAINT "role_portal_id_fk"
      FOREIGN KEY ("portal_id") REFERENCES "main"."portal"("id");
  END IF;
END $$;

-- Module keys from names; assign portal by known admin/agency/outlet sets.
UPDATE "main"."m_module"
SET "module_key" = lower(regexp_replace(trim("module_name"), '[^a-zA-Z0-9]+', '_', 'g'))
WHERE "module_key" IS NULL OR "module_key" = '';

UPDATE "main"."m_module" m
SET "portal_id" = p."id",
    "updated_at" = now(),
    "updated_by" = 'system'
FROM "main"."portal" p
WHERE m."portal_id" IS NULL
  AND p."code" = 'admin'
  AND lower(m."module_name") IN (
    'dashboard', 'user management', 'access control', 'plan', 'subscription',
    'special service', 'audit log', 'billing'
  );

UPDATE "main"."m_module" m
SET "portal_id" = p."id",
    "updated_at" = now(),
    "updated_by" = 'system'
FROM "main"."portal" p
WHERE m."portal_id" IS NULL
  AND p."code" = 'agency'
  AND lower(m."module_name") IN (
    'roster', 'payment voucher', 'approvals', 'workforce', 'collections'
  );

UPDATE "main"."m_module" m
SET "portal_id" = p."id",
    "updated_at" = now(),
    "updated_by" = 'system'
FROM "main"."portal" p
WHERE m."portal_id" IS NULL
  AND p."code" = 'outlet'
  AND lower(m."module_name") IN (
    'booking', 'rating', 'sales', 'workspace'
  );

-- Remaining unscoped modules → admin portal (legacy catalogue default).
UPDATE "main"."m_module" m
SET "portal_id" = p."id",
    "updated_at" = now(),
    "updated_by" = 'system'
FROM "main"."portal" p
WHERE m."portal_id" IS NULL
  AND p."code" = 'admin';

ALTER TABLE "main"."m_module"
  ALTER COLUMN "module_key" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'm_module_portal_id_fk'
  ) THEN
    ALTER TABLE "main"."m_module"
      ADD CONSTRAINT "m_module_portal_id_fk"
      FOREIGN KEY ("portal_id") REFERENCES "main"."portal"("id");
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "m_module_portal_key_uidx"
  ON "main"."m_module" ("portal_id", "module_key");

-- Drop delete permissions (C/R/U only going forward).
DELETE FROM "main"."role_permission" rp
USING "main"."m_permission" p
WHERE rp."permission_id" = p."id"
  AND p."permission_type"::text = 'delete';

DELETE FROM "main"."m_permission"
WHERE "permission_type"::text = 'delete';

-- Rebuild permission_type enum without 'delete'.
ALTER TYPE "main"."permission_type" RENAME TO "permission_type_old";
CREATE TYPE "main"."permission_type" AS ENUM ('read', 'create', 'update');

ALTER TABLE "main"."m_permission"
  ALTER COLUMN "permission_type" DROP DEFAULT;

ALTER TABLE "main"."m_permission"
  ALTER COLUMN "permission_type" TYPE "main"."permission_type"
  USING ("permission_type"::text::"main"."permission_type");

DROP TYPE "main"."permission_type_old";

-- user_role FKs (known gap).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_role_user_id_fk'
  ) THEN
    ALTER TABLE "main"."user_role"
      ADD CONSTRAINT "user_role_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "main"."user"("id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_role_role_id_fk'
  ) THEN
    ALTER TABLE "main"."user_role"
      ADD CONSTRAINT "user_role_role_id_fk"
      FOREIGN KEY ("role_id") REFERENCES "main"."role"("id");
  END IF;
END $$;

-- org_member_invite: role_id becomes the specialized portal role; keep sub_role
-- populated for back-compat until a later drop migration.
