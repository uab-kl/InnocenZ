-- Drop bare agency / outlet portal identity roles.
-- Portal access is Owner / Finance / Ops Head under each portal.

DO $$
DECLARE
  null_portal uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  CREATE TEMP TABLE _drop_portal_identity ON COMMIT DROP AS
  SELECT r."id" AS drop_id,
         r."portal_id",
         p."code" AS portal_code
  FROM "main"."role" r
  LEFT JOIN "main"."portal" p ON p."id" = r."portal_id"
  WHERE lower(r."role_name") IN ('agency', 'outlet');

  IF NOT EXISTS (SELECT 1 FROM _drop_portal_identity) THEN
    RAISE NOTICE '0105: no agency/outlet identity roles';
    RETURN;
  END IF;

  -- Remap user_role → Owner on the same portal (or create Owner if missing).
  CREATE TEMP TABLE _remap ON COMMIT DROP AS
  SELECT d.drop_id,
         d.portal_id,
         d.portal_code,
         (
           SELECT o."id"
           FROM "main"."role" o
           WHERE lower(o."role_name") = 'owner'
             AND COALESCE(o."portal_id", null_portal) = COALESCE(d.portal_id, null_portal)
           ORDER BY o."created_at" ASC
           LIMIT 1
         ) AS owner_id
  FROM _drop_portal_identity d;

  -- Ensure Owner exists for each portal we're remapping into
  INSERT INTO "main"."role" (
    "role_name", "portal_id", "status", "created_by", "updated_by"
  )
  SELECT 'Owner', m.portal_id, 'active', 'system', 'system'
  FROM (SELECT DISTINCT portal_id FROM _remap WHERE owner_id IS NULL AND portal_id IS NOT NULL) m;

  UPDATE _remap r
  SET owner_id = o."id"
  FROM "main"."role" o
  WHERE r.owner_id IS NULL
    AND lower(o."role_name") = 'owner'
    AND COALESCE(o."portal_id", null_portal) = COALESCE(r.portal_id, null_portal);

  UPDATE "main"."user_role" ur
  SET "role_id" = m.owner_id,
      "updated_at" = now(),
      "updated_by" = 'system'
  FROM _remap m
  WHERE ur."role_id" = m.drop_id
    AND m.owner_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "main"."user_role" e
      WHERE e."user_id" = ur."user_id" AND e."role_id" = m.owner_id
    );

  DELETE FROM "main"."user_role" ur
  USING _remap m
  WHERE ur."role_id" = m.drop_id;

  -- Merge permissions onto Owner then drop
  UPDATE "main"."role_permission" rp
  SET "role_id" = m.owner_id,
      "updated_at" = now(),
      "updated_by" = 'system'
  FROM _remap m
  WHERE rp."role_id" = m.drop_id
    AND m.owner_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "main"."role_permission" e
      WHERE e."role_id" = m.owner_id AND e."permission_id" = rp."permission_id"
    );

  DELETE FROM "main"."role_permission" rp
  USING _remap m
  WHERE rp."role_id" = m.drop_id;

  IF to_regclass('main.org_member_invite') IS NOT NULL THEN
    UPDATE "main"."org_member_invite" i
    SET "role_id" = m.owner_id,
        "updated_at" = now(),
        "updated_by" = 'system'
    FROM _remap m
    WHERE i."role_id" = m.drop_id
      AND m.owner_id IS NOT NULL;
  END IF;

  IF to_regclass('main.subscription') IS NOT NULL THEN
    UPDATE "main"."subscription" s
    SET "role_id" = m.owner_id
    FROM _remap m
    WHERE s."role_id" = m.drop_id
      AND m.owner_id IS NOT NULL;
  END IF;

  DELETE FROM "main"."role" r
  USING _drop_portal_identity d
  WHERE r."id" = d.drop_id;

  RAISE NOTICE '0105: removed agency/outlet identity roles';
END $$;
