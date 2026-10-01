-- 0168_notification_user_created_idx
--
-- EVERY NOTIFICATION READ IS "THIS USER'S, NEWEST FIRST" — and the table had
-- no index but its primary key (read-only check, 29 Sep 2026: `pg_indexes`
-- listed `notification_pkey` alone). The inbox, the unread count, read-all and
-- the two-minute repeat guard added on 29 Sep (`repeat-delivery.ts`, which
-- runs on EVERY delivery) all filter on `user_id` and order or bound by
-- `created_at`, so each was a full scan. 550 rows today; the guard makes the
-- scan a cost on every write, so it is indexed now rather than when it hurts.
-- Owner OK'd on 29 Sep 2026: "also handle these migrations".
--
-- DESC matches the reads' ORDER BY; Postgres can walk it backwards too.
-- Not CONCURRENTLY: migrations run inside a transaction, and at this size the
-- lock is momentary. Idempotent.

CREATE INDEX IF NOT EXISTS "notification_user_created_idx"
  ON "main"."notification" ("user_id", "created_at" DESC);
