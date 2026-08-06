-- Team invite lives in its own table (email + token + expires + role_id).
-- outlet_user / agency_user rows are created only when the invite is accepted.
-- If an earlier draft of 0102 added token columns on membership tables, drop them.

DROP INDEX IF EXISTS "main"."outlet_user_invite_token_uidx";
DROP INDEX IF EXISTS "main"."agency_user_invite_token_uidx";

ALTER TABLE "main"."outlet_user"
  DROP COLUMN IF EXISTS "invite_token",
  DROP COLUMN IF EXISTS "invite_expires_at";

ALTER TABLE "main"."agency_user"
  DROP COLUMN IF EXISTS "invite_token",
  DROP COLUMN IF EXISTS "invite_expires_at";

DROP TABLE IF EXISTS "main"."org_member_invite";

CREATE TABLE "main"."org_member_invite" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) NOT NULL,
  "token" varchar(64) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "outlet_id" uuid REFERENCES "main"."outlet"("id") ON DELETE CASCADE,
  "agency_id" uuid REFERENCES "main"."agency"("id") ON DELETE CASCADE,
  -- Portal role (`outlet` / `agency`) — FK, never a duplicated role name.
  "role_id" uuid NOT NULL REFERENCES "main"."role"("id"),
  -- Membership lane on outlet_user / agency_user (owner | finance | operations_head).
  "sub_role" varchar(50) NOT NULL,
  "status" varchar(50) NOT NULL DEFAULT 'pending',
  "accepted_user_id" uuid REFERENCES "main"."user"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" varchar NOT NULL,
  "updated_by" varchar NOT NULL,
  CONSTRAINT "org_member_invite_org_chk" CHECK (
    ("outlet_id" IS NOT NULL AND "agency_id" IS NULL)
    OR ("outlet_id" IS NULL AND "agency_id" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_member_invite_token_uidx"
  ON "main"."org_member_invite" ("token");

CREATE INDEX IF NOT EXISTS "org_member_invite_outlet_pending_idx"
  ON "main"."org_member_invite" ("outlet_id", "email")
  WHERE "status" = 'pending';

CREATE INDEX IF NOT EXISTS "org_member_invite_agency_pending_idx"
  ON "main"."org_member_invite" ("agency_id", "email")
  WHERE "status" = 'pending';
