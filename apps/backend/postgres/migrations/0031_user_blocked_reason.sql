-- user reshape.
--
-- 1. is_locked / locked_at / locked_by are dropped. They exist in the shared DB
--    but were never declared on UserTable and are referenced nowhere in the
--    codebase, so nothing reads or writes them. Lock state is being folded into
--    the status column instead.
--
-- 2. lock_reason is renamed to blocked_reason, matching the new 'blocked'
--    status. The column stays free-text and nullable.
--
-- 3. status gains 'inactive' and 'blocked'. The column is a plain varchar (no
--    Postgres enum), so the allowed set is declared in code as
--    userStatusValues; all 15 live rows are 'active' and are untouched.

ALTER TABLE "main"."user" DROP COLUMN IF EXISTS "is_locked";--> statement-breakpoint
ALTER TABLE "main"."user" DROP COLUMN IF EXISTS "locked_at";--> statement-breakpoint
ALTER TABLE "main"."user" DROP COLUMN IF EXISTS "locked_by";--> statement-breakpoint

ALTER TABLE "main"."user" RENAME COLUMN "lock_reason" TO "blocked_reason";
