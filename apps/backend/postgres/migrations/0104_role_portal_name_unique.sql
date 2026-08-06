-- Role name unique per portal (same name allowed across portals).
-- Null portal_id treated as one bucket (mobile / unassigned, e.g. pr).

-- 1) Merge duplicate rows: keep oldest by created_at, id.
DO $$
DECLARE
  null_portal uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  CREATE TEMP TABLE _role_dupes ON COMMIT DROP AS
  WITH keepers AS (
    SELECT DISTINCT ON (
      lower(r."role_name"),
      COALESCE(r."portal_id", null_portal)
    )
      r."id" AS keep_id,
      lower(r."role_name") AS name_key,
      COALESCE(r."portal_id", null_portal) AS portal_key
    FROM "main"."role" r
    ORDER BY
      lower(r."role_name"),
      COALESCE(r."portal_id", null_portal),
      r."created_at" ASC,
      r."id" ASC
  )
  SELECT r."id" AS dupe_id, k.keep_id
  FROM "main"."role" r
  INNER JOIN keepers k
    ON lower(r."role_name") = k.name_key
   AND COALESCE(r."portal_id", null_portal) = k.portal_key
  WHERE r."id" <> k.keep_id;

  IF NOT EXISTS (SELECT 1 FROM _role_dupes) THEN
    RAISE NOTICE '0104: no duplicate roles';
  ELSE
    -- user_role: prefer keeper; drop dupe grant if user already has keeper
    UPDATE "main"."user_role" ur
    SET "role_id" = d.keep_id,
        "updated_at" = now(),
        "updated_by" = 'system'
    FROM _role_dupes d
    WHERE ur."role_id" = d.dupe_id
      AND NOT EXISTS (
        SELECT 1
        FROM "main"."user_role" existing
        WHERE existing."user_id" = ur."user_id"
          AND existing."role_id" = d.keep_id
      );

    DELETE FROM "main"."user_role" ur
    USING _role_dupes d
    WHERE ur."role_id" = d.dupe_id;

    -- role_permission
    UPDATE "main"."role_permission" rp
    SET "role_id" = d.keep_id,
        "updated_at" = now(),
        "updated_by" = 'system'
    FROM _role_dupes d
    WHERE rp."role_id" = d.dupe_id
      AND NOT EXISTS (
        SELECT 1
        FROM "main"."role_permission" existing
        WHERE existing."role_id" = d.keep_id
          AND existing."permission_id" = rp."permission_id"
      );

    DELETE FROM "main"."role_permission" rp
    USING _role_dupes d
    WHERE rp."role_id" = d.dupe_id;

    -- Optional tables (may be absent on some environments)
    IF to_regclass('main.subscription') IS NOT NULL THEN
      UPDATE "main"."subscription" s
      SET "role_id" = d.keep_id
      FROM _role_dupes d
      WHERE s."role_id" = d.dupe_id;
    END IF;

    IF to_regclass('main.subscription_role') IS NOT NULL THEN
      UPDATE "main"."subscription_role" sr
      SET "role_id" = d.keep_id
      FROM _role_dupes d
      WHERE sr."role_id" = d.dupe_id
        AND NOT EXISTS (
          SELECT 1
          FROM "main"."subscription_role" existing
          WHERE existing."subscription_id" = sr."subscription_id"
            AND existing."role_id" = d.keep_id
        );

      DELETE FROM "main"."subscription_role" sr
      USING _role_dupes d
      WHERE sr."role_id" = d.dupe_id;
    END IF;

    IF to_regclass('main.subscription_feature') IS NOT NULL THEN
      UPDATE "main"."subscription_feature" sf
      SET "role_id" = d.keep_id
      FROM _role_dupes d
      WHERE sf."role_id" = d.dupe_id
        AND NOT EXISTS (
          SELECT 1
          FROM "main"."subscription_feature" existing
          WHERE existing."subscription_id" = sf."subscription_id"
            AND existing."role_id" = d.keep_id
            AND existing."limit_type_id" IS NOT DISTINCT FROM sf."limit_type_id"
        );

      DELETE FROM "main"."subscription_feature" sf
      USING _role_dupes d
      WHERE sf."role_id" = d.dupe_id;
    END IF;

    IF to_regclass('main.org_member_invite') IS NOT NULL THEN
      UPDATE "main"."org_member_invite" i
      SET "role_id" = d.keep_id,
          "updated_at" = now(),
          "updated_by" = 'system'
      FROM _role_dupes d
      WHERE i."role_id" = d.dupe_id;
    END IF;

    DELETE FROM "main"."role" r
    USING _role_dupes d
    WHERE r."id" = d.dupe_id;

    RAISE NOTICE '0104: merged duplicate roles';
  END IF;
END $$;

-- 2) Enforce uniqueness going forward (case-insensitive name + portal).
CREATE UNIQUE INDEX IF NOT EXISTS "role_portal_name_uidx"
  ON "main"."role" (
    lower("role_name"),
    COALESCE("portal_id", '00000000-0000-0000-0000-000000000000'::uuid)
  );
