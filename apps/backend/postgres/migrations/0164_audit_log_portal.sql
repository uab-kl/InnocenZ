-- 0164 — WHICH SURFACE an audited action came from.
--
-- Owner, 12 Sep 2026: "fix the audit log tabs".
--
-- ⚠️ THE TABS FILTER ON SOMETHING THE COLUMN NEVER HELD. The admin Audit Log
-- groups by portal — Admin · PR · Outlet · Agency · Others — but `role` stores
-- the actor's CAPACITY: `admin`, `pr`, and the lane titles `Owner`, `Finance`,
-- `Ops Head`, `Director`, `Guarantor`. So 2,150 `Owner` rows and 74 other lane
-- rows fell into "Others" rather than under the organisation they belong to.
--
-- The portal cannot be recovered from the name. `Owner`, `Finance`, `Director`
-- and `Guarantor` are each seeded TWICE — once per portal — so a join from
-- `role_name` is 1:N: it either duplicates one audit row onto two tabs or picks
-- a portal by coin-flip, which is precisely the mis-attribution an audit log
-- exists to prevent. The portal is known at WRITE time and was being discarded;
-- this is where it lands instead.
--
-- ⚠️ NOT a duplicate of `role`. One says what the person WAS (their lane), the
-- other says WHERE they acted. Neither implies the other — that is exactly why
-- the join is ambiguous in the first place.
--
-- Nullable on purpose, and NOT backfilled. Every existing row had its portal
-- thrown away before it was stored; inventing one now would be a guess written
-- into the record that settles arguments. Historical rows stay in "Others",
-- which is the honest answer, and the two organisation tabs fill as new
-- activity accrues.

ALTER TABLE "main"."audit_logs"
  ADD COLUMN IF NOT EXISTS "portal" text;

-- The tab query filters on this column, so it needs its own index — the
-- existing `audit_role_idx` covers `role`, which is not what the tabs ask.
CREATE INDEX IF NOT EXISTS "audit_portal_idx"
  ON "main"."audit_logs" ("portal");
