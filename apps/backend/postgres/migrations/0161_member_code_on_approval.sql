-- An organisation's member id is issued when somebody JOINS, not when they ask.
--
-- Owner, 11 Sep 2026, after the first real member sign-up put a stranger's
-- request into Atlas Agency's queue already carrying `INNATAGY0005`: "fix the
-- member code, use the migration 0161".
--
-- WHAT WAS WRONG. `nextOrgMemberCode` runs inside the two membership `add()`
-- functions, so it fired on INSERT — and a public sign-up inserts a row at
-- `status: 'pending'`, which grants nothing and may never be approved. So the
-- moment a stranger asked to join, three things happened that should not have:
--
--   * they were handed that organisation's next id, before anybody had read
--     the request;
--   * `0005` was consumed, and consumed permanently — decline the request and
--     the number is not reissued, because ids are never reused;
--   * `ensureAccountCode` mirrored it onto `main."user"`, where it is a FINAL
--     id: `isFallbackCode` only ever upgrades an `INNUSR` placeholder, so a
--     declined applicant would carry an Atlas Agency id for the life of the
--     account, at an agency that had refused them.
--
-- Three real rows were in exactly that state when this was written.
--
-- WHY A DEFAULT, AND NOT A NULLABLE COLUMN. The column is NOT NULL by the
-- owner's rule (0159, "not null all must have thier member id"), and making it
-- nullable would also break every `isNotNull` filter that reads these tables.
-- A pending row still needs SOME id, so it gets a placeholder that is visibly
-- not an organisation id — `INNPND0001` — from a DEFAULT, which is the only
-- thing every insert passes through, whoever writes the next one.
--
-- The real id is minted on APPROVAL, in `updateMember`, which is the single
-- write that turns a request into a membership.
--
-- A sequence, not a random value: it cannot collide, so it cannot fight the
-- unique index on this column.
CREATE SEQUENCE IF NOT EXISTS "main"."pending_member_code_seq";
--> statement-breakpoint

ALTER TABLE "main"."agency_user"
  ALTER COLUMN "member_code"
  SET DEFAULT ('INNPND' || lpad(nextval('"main"."pending_member_code_seq"')::text, 4, '0'));
--> statement-breakpoint

ALTER TABLE "main"."outlet_user"
  ALTER COLUMN "member_code"
  SET DEFAULT ('INNPND' || lpad(nextval('"main"."pending_member_code_seq"')::text, 4, '0'));
--> statement-breakpoint

-- THE ACCOUNT ROWS FIRST, while they can still be matched by the code they
-- copied. Reversing these two statements would rewrite the membership codes and
-- leave every mirrored `user.member_code` orphaned and unfindable.
--
-- ⚠️ Only accounts with NO active membership anywhere. Somebody who works at
-- one organisation and has asked to join a second legitimately holds an id from
-- the first, and resetting them to the floor would take a real id away over
-- somebody else's unanswered request.
UPDATE "main"."user" u
SET "member_code" = 'INNUSR' || lpad(nextval('"main"."user_member_code_seq"')::text, 4, '0')
WHERE u."member_code" IN (
    SELECT au."member_code" FROM "main"."agency_user" au WHERE au."status" = 'pending'
    UNION ALL
    SELECT ou."member_code" FROM "main"."outlet_user" ou WHERE ou."status" = 'pending'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "main"."agency_user" a
    WHERE a."user_id" = u."id" AND a."status" = 'active'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "main"."outlet_user" o
    WHERE o."user_id" = u."id" AND o."status" = 'active'
  );
--> statement-breakpoint

-- ⚠️ `status = 'pending'` ONLY, never `<> 'active'`.
--
-- A declined applicant and a removed member both end up `inactive`, and the
-- column does not say which. A removed member WAS active, and their id is real
-- history — it may sit on a payment voucher, in an email, or in somebody's
-- notes. Reclaiming that number would rewrite the past to save an integer.
-- `pending` is the only status that provably never granted anything, so it is
-- the only one safe to reclaim. Numbers burned by requests already declined
-- stay burned: there is no way to tell those apart, and guessing wrong is worse
-- than a gap in the sequence.
UPDATE "main"."agency_user"
SET "member_code" = 'INNPND' || lpad(nextval('"main"."pending_member_code_seq"')::text, 4, '0')
WHERE "status" = 'pending' AND "member_code" NOT LIKE 'INNPND%';
--> statement-breakpoint

UPDATE "main"."outlet_user"
SET "member_code" = 'INNPND' || lpad(nextval('"main"."pending_member_code_seq"')::text, 4, '0')
WHERE "status" = 'pending' AND "member_code" NOT LIKE 'INNPND%';
