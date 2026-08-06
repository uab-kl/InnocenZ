-- 0107 — drop membership.sub_role; lane comes from user_role → role (portal).
--
-- agency_user / outlet_user are tenancy only (which org). Owner / Finance /
-- Ops Head is the RBAC role on user_role, not a duplicate column here.
-- org_member_invite.sub_role stays as invite metadata until accept assigns roleId.

ALTER TABLE main.agency_user DROP COLUMN IF EXISTS sub_role;
ALTER TABLE main.outlet_user DROP COLUMN IF EXISTS sub_role;

DROP TYPE IF EXISTS main.agency_user_sub_role;
DROP TYPE IF EXISTS main.outlet_user_sub_role;
