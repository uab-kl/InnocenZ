-- user reshape.
--
-- 1. is_locked / locked_at / locked_by are dropped. They exist in the shared DB
--    but were never declared on UserTable and are referenced nowhere in the
--    codebase, so nothing reads or writes them. Lock state is being folded into
--    the status column instead.
--
-- 2. lock_reason → blocked_reason. On the shared DB the column was lock_reason;
--    on a fresh migrate chain it was never added (0000 user has neither). Guard
--    the rename and ADD when missing so both paths land on blocked_reason.
--
-- 3. status gains 'inactive' and 'blocked'. The column is a plain varchar (no
--    Postgres enum), so the allowed set is declared in code as
--    userStatusValues; all 15 live rows are 'active' and are untouched.

ALTER TABLE "main"."user" DROP COLUMN IF EXISTS "is_locked";--> statement-breakpoint
ALTER TABLE "main"."user" DROP COLUMN IF EXISTS "locked_at";--> statement-breakpoint
ALTER TABLE "main"."user" DROP COLUMN IF EXISTS "locked_by";--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'main' AND table_name = 'user' AND column_name = 'lock_reason'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'main' AND table_name = 'user' AND column_name = 'blocked_reason'
  ) THEN
    ALTER TABLE "main"."user" RENAME COLUMN "lock_reason" TO "blocked_reason";
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'main' AND table_name = 'user' AND column_name = 'blocked_reason'
  ) THEN
    ALTER TABLE "main"."user" ADD COLUMN "blocked_reason" text;
  END IF;
END $$;
