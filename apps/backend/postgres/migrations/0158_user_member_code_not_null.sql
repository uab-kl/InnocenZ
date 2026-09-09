-- Every account carries an id, enforced by the database rather than by care.
--
-- Owner, 9 Sep 2026, looking at a null in pgAdmin: "still have one null make
-- auto will have this member id always", then "not null for member_code".
--
-- Application code alone cannot make that true. There are ELEVEN inserts into
-- `main."user"` — one runtime path and ten seed scripts — and the next one
-- somebody writes will not remember. A DEFAULT is the only thing every insert
-- passes through, so the guarantee goes here.
--
-- The default is the FLOOR id, not the final one. `INNUSR0001` says "an
-- account" and nothing more; `ensureAccountCode()` upgrades it the moment the
-- account becomes something specific — an organisation membership, the admin
-- role, or the PR role — and never rewrites an id that is already specific.
-- Sequence gaps are expected and harmless: a PR created today takes a USR
-- number at insert and an INNPR number a statement later.
--
-- A sequence, not a random value: it cannot collide, so it cannot fight the
-- partial unique index on this column (0154).
CREATE SEQUENCE IF NOT EXISTS "main"."user_member_code_seq";
--> statement-breakpoint

-- Fill whatever is still null BEFORE the constraint, or adding it fails. Today
-- that is one row: a 16 Jul test account holding no role and no membership,
-- which is exactly the case the floor family exists for.
UPDATE "main"."user"
SET "member_code" = 'INNUSR' || lpad(nextval('"main"."user_member_code_seq"')::text, 4, '0')
WHERE "member_code" IS NULL;
--> statement-breakpoint

ALTER TABLE "main"."user"
  ALTER COLUMN "member_code"
  SET DEFAULT ('INNUSR' || lpad(nextval('"main"."user_member_code_seq"')::text, 4, '0'));
--> statement-breakpoint

ALTER TABLE "main"."user" ALTER COLUMN "member_code" SET NOT NULL;
