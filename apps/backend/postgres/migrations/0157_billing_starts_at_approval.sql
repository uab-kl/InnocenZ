-- BILLING STARTS WHEN THE ADMIN APPROVES THE ORGANISATION, not when it signs up.
--
-- Owner's call, 9 Sep 2026. Until now `member_subscription.started_at` was both
-- "when did they subscribe" and "when does the meter start", and the two are not
-- the same day. A venue self-registers as `pending_review`, and while it is
-- pending the portal confines it to Settings/Profile — `isOrgProfileOnly()`
-- returns no nav items at all and `canAccessOutletPath()` allows only
-- /outlet/settings and /outlet/profile. So the old rule opened a RM 999 monthly
-- period on the day a venue gained access to an address form, and kept that day
-- as its billing anchor for the life of the account.
--
-- RENUMBERED 0154 → 0157 (9 Sep 2026) to run after the three migrations landing
-- from the other branch. See the note on re-application below: the renumber is
-- what made the guard around the backfill necessary.
--
-- ── WHY A SECOND COLUMN AND NOT A RESTAMP OF started_at ──────────────────────
-- Restamping on approval is one write and would have worked. It also would have
-- overwritten a true fact in a ledger whose whole job is to record it:
-- `member_subscription` is the "who subscribed and when" history, and "they
-- subscribed on the 3rd" stops being recoverable the moment approval rewrites it
-- to the 11th. Two different facts, two columns — the same reasoning that split
-- `subscription_invoice` out of this table in the first place.
--
-- NULL therefore means SOMETHING: this lane is enrolled but not yet billable.
-- `generateMissing` skips a lane no row of which carries an anchor, so a venue
-- that is never approved is never invoiced — rather than accruing periods
-- somebody has to cancel and credit afterwards.
--
-- ── THE BACKFILL RUNS EXACTLY ONCE, AND THE GUARD IS LOAD-BEARING ────────────
-- Every existing row is stamped with its own `started_at`, so no organisation
-- billing today changes anchor, period or amount by one day. Without it, NULL
-- would read as "not billable yet" for all 55 existing rows and the ledger would
-- simply stop.
--
-- ⚠️ But the backfill may run ONLY on the pass that creates the column, which is
-- why it sits inside the IF rather than standing alone with a
-- `WHERE billing_starts_at IS NULL` guard. That guard was correct exactly once:
-- before this migration, NULL meant "row written before the column existed".
-- AFTERWARDS, NULL means "an organisation still awaiting approval" — so a second
-- application of the standalone form would silently anchor every pending venue
-- to its SIGN-UP day and bill it for the time it spent locked out, which is the
-- entire bug this migration exists to fix. Renumbering made that reachable:
-- drizzle picks pending entries by `when > max(created_at)`, so a re-stamped
-- `when` re-applies a migration this database has already run.
--
-- Hand-written and idempotent because `drizzle-kit generate` cannot run in this
-- repo (parent-snapshot collision across 0065-0070); see 0078/0080/0129/0151.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'main'
       AND table_name   = 'member_subscription'
       AND column_name  = 'billing_starts_at'
  ) THEN
    ALTER TABLE "main"."member_subscription"
      ADD COLUMN "billing_starts_at" timestamp with time zone;

    -- Unconditional INSIDE the guard, and that is the point: it can only be
    -- reached on the pass that created the column, when every row present is by
    -- definition one written before the column existed.
    UPDATE "main"."member_subscription"
       SET "billing_starts_at" = "started_at";
  END IF;
END $$;

-- The approve handler asks "which of this org's lanes are still unstamped?" on
-- every approval, and the nightly reconciliation asks which APPROVED orgs are
-- unstamped. Partial on the NULL predicate: the rows worth finding fast are the
-- unstamped ones — the pending organisations — and there are normally very few.
CREATE INDEX IF NOT EXISTS "member_subscription_awaiting_billing_idx"
  ON "main"."member_subscription" ("subscriber_type", "subscriber_id")
  WHERE "billing_starts_at" IS NULL;
