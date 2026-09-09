-- Human-readable account IDs (owner, 8 Sep 2026).
--
-- Nobody could say a person's id out loud: every screen showed a uuid, and
-- support asking "which member?" got 36 characters back. The scheme the owner
-- set:
--
--   agency operator  INN + <ORG CODE> + AGY + 0001   e.g. INNATAGY0001
--   venue operator   INN + <ORG CODE> + OLT + 0001   e.g. INNEMOLT0001
--   PR               INNPR0001                       no organisation
--   admin            INNADM0001                      no organisation
--
-- TWO DIFFERENT SCOPES, deliberately, and this is the whole reason for the
-- column placement below:
--
--  * An organisation operator's id is PER MEMBERSHIP. One person can operate two
--    agencies (Ng Jun Yu holds AliMaMa and 4Gays Club today), and the owner's
--    rule is that the id names the organisation — so it cannot live on `user`,
--    where a person has exactly one of everything. It lives on agency_user /
--    outlet_user, and that person carries a different id in each organisation.
--
--  * A PR's id, and an admin's, is PER PERSON. A PR moves between agencies and
--    keeps the same id, so theirs belongs on `user`.
--
-- The ORG CODE is its own column, NOT `agency.agency_code`. That column is
-- already inconsistent in live data — AliMaMa's is `120219`, which is a
-- registration number, and Why We Met's is `AGY777` rather than the next in
-- sequence — so building ids on it would mint `INN120219AGY0001`. The new
-- column is auto-suggested from the name, editable by an admin, and frozen once
-- any member of that organisation holds an id, because changing it afterwards
-- would orphan every id already issued and printed.
--
-- Columns are NULLABLE and the unique indexes are PARTIAL. A NOT NULL default
-- would have to invent an id for every existing row inside this transaction,
-- and the numbering has to be assigned in a deterministic order that SQL cannot
-- express as cheaply as the backfill script can (owners first, then created_at,
-- then id). `_backfill-member-codes.ts` fills them; the generator fills every
-- row created afterwards.

ALTER TABLE main.agency
  ADD COLUMN IF NOT EXISTS member_code_prefix varchar(8);

ALTER TABLE main.outlet
  ADD COLUMN IF NOT EXISTS member_code_prefix varchar(8);

ALTER TABLE main.agency_user
  ADD COLUMN IF NOT EXISTS member_code varchar(32);

ALTER TABLE main.outlet_user
  ADD COLUMN IF NOT EXISTS member_code varchar(32);

-- PR and admin ids. On `user` because neither is scoped to an organisation.
ALTER TABLE main."user"
  ADD COLUMN IF NOT EXISTS member_code varchar(32);
--> statement-breakpoint

-- Uniqueness is the point of the whole scheme, so it is enforced by the
-- database rather than by the generator's own read-then-write. The generator
-- takes the next number and RETRIES on violation of these indexes; two members
-- added to one agency at the same instant therefore cannot both take 0007.
--
-- PARTIAL, because NULL means "not issued yet" and several NULLs must coexist —
-- Postgres already treats NULLs as distinct in a unique index, but stating the
-- WHERE makes that intent explicit and keeps the index small during backfill.
CREATE UNIQUE INDEX IF NOT EXISTS agency_user_member_code_unique
  ON main.agency_user (member_code)
  WHERE member_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS outlet_user_member_code_unique
  ON main.outlet_user (member_code)
  WHERE member_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_member_code_unique
  ON main."user" (member_code)
  WHERE member_code IS NOT NULL;
--> statement-breakpoint

-- Two organisations may not share a code, or their members' ids collide from
-- the first number. Agencies and venues are indexed separately on purpose: the
-- AGY/OLT segment already separates them, so "AT" may legitimately be both an
-- agency code and a venue code.
CREATE UNIQUE INDEX IF NOT EXISTS agency_member_code_prefix_unique
  ON main.agency (member_code_prefix)
  WHERE member_code_prefix IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS outlet_member_code_prefix_unique
  ON main.outlet (member_code_prefix)
  WHERE member_code_prefix IS NOT NULL;
