-- Payment-voucher disputes: one per SHIFT DAY per COMPONENT, proof required.
--
-- Three problems with the current shape:
--
-- 1. The agency's decision has nowhere to live. payment_voucher carries the
--    PR's side (dispute_reason, dispute_note, disputed_at) but no outcome, so
--    "resolve" can only flip status back to 'sent' and the decision is lost.
--
-- 2. A dispute is not a property of the week. A PR disputes a specific day and
--    a specific part of it — "my drinks commission for 23/7 is short" — and may
--    still dispute their wages that same day, or other days that month.
--
-- 3. Nothing carries proof, so the agency has no basis to judge a claim.
--
-- Hence: one row per (voucher, day, component), with mandatory evidence.
--
-- Why components differ, for whoever reads this next: the outlet pays the
-- agency on ALL PR sales, but a PR earns drinks/tips commission only on
-- receipts they actually scanned or self-logged. A wages dispute contests a
-- value the agency controls; a drinks/tips dispute contests the PR's own
-- receipt log. The agency owns and can resolve all three — no outlet
-- escalation is involved.
--
-- DELIBERATELY DOES NOT TOUCH payment_voucher_line. A line's kind/source/
-- gross-sale/dedupe are packed into `ref` (encodeRef/decodeRef in
-- payment-voucher.controller.ts) and that encoding is being worked on
-- elsewhere for the OCR scan path. Adding a parallel `component` column there
-- would duplicate `kind` and collide with that work. Disputes therefore mirror
-- the existing kind vocabulary instead of redefining it.
--
-- EXPAND ONLY. The old payment_voucher.dispute_* columns are NOT dropped: the
-- running controller still reads them. Drop them in a follow-up once nothing
-- does.

CREATE TYPE "main"."payment_voucher_dispute_outcome" AS ENUM('accepted', 'rejected', 'withdrawn');--> statement-breakpoint

-- MUST stay in step with prReceiptKindValues in
-- src/schema/payment-voucher.schema.ts:54 — the same vocabulary a voucher line
-- already uses inside `ref`. Typed here so disputes can be filtered in SQL,
-- which a packed string cannot do.
CREATE TYPE "main"."payment_voucher_dispute_component" AS ENUM('wages', 'drinks', 'tips', 'others');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "main"."payment_voucher_dispute" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "voucher_id" uuid NOT NULL REFERENCES "main"."payment_voucher"("id") ON DELETE CASCADE,

  -- The shift day being disputed. Matches payment_voucher_line.line_date and
  -- must fall inside the voucher's week.
  "dispute_date" date NOT NULL,

  -- Which part of that day. Together with dispute_date this is the dispute's
  -- identity — deliberately NOT a FK to payment_voucher_line.id, because lines
  -- are deleted and re-inserted wholesale on every voucher update
  -- (payment-voucher.repository.ts:61). That rewrite is exactly what happens
  -- when the agency ACCEPTS, so a line-keyed dispute would destroy the row it
  -- points at at the moment it succeeded.
  "component" "main"."payment_voucher_dispute_component" NOT NULL,

  -- The PR's side.
  "reason" varchar(1000),
  "note" varchar(1000),
  "raised_at" timestamp with time zone DEFAULT now() NOT NULL,

  -- What the voucher said when the dispute was raised, and what the PR says it
  -- should be. The snapshot matters because resolving rewrites the lines — the
  -- original figure would otherwise be unrecoverable. Compute disputed_amount
  -- server-side from the lines; never trust it from the client, it is the
  -- baseline of a money claim.
  "disputed_amount" numeric(12, 2),
  "claimed_amount" numeric(12, 2),

  -- Evidence. Same jsonb array-of-paths pattern as
  -- payment_voucher_line.proof_photos (migration 0048). Required on new rows,
  -- enforced by the NOT VALID check added after the backfill below.
  "proof_photos" jsonb,

  -- Receipts the PR is pointing at, by the dedupe/receipt reference carried in
  -- payment_voucher_line.ref rather than by line id — same reason component is
  -- not a line FK.
  "receipt_refs" jsonb,

  -- The agency's decision. accepted = they agree, the voucher is corrected.
  -- rejected = it stands as issued. withdrawn = the PR retracted it (the
  -- existing /dispute/withdraw route). NULL = still awaiting agency review.
  "outcome" "main"."payment_voucher_dispute_outcome",
  "resolved_at" timestamp with time zone,
  "resolved_by" varchar,
  "resolution_note" varchar(1000),

  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" varchar DEFAULT 'system' NOT NULL,
  "updated_by" varchar DEFAULT 'system' NOT NULL
);--> statement-breakpoint

-- One dispute per day per component. The whole rule, enforced by the database
-- rather than controller convention, so a double-tap or a retried request
-- cannot create a second. Wages and drinks on the same day stay separate.
CREATE UNIQUE INDEX IF NOT EXISTS "payment_voucher_dispute_one_per_day_component"
  ON "main"."payment_voucher_dispute" ("voucher_id", "dispute_date", "component");--> statement-breakpoint

-- The agency queue reads "everything still awaiting review, oldest first".
CREATE INDEX IF NOT EXISTS "payment_voucher_dispute_open_idx"
  ON "main"."payment_voucher_dispute" ("raised_at")
  WHERE "outcome" IS NULL;--> statement-breakpoint

-- Backfill: one row per voucher that has ever been disputed. Runs BEFORE the
-- proof constraint is added, because these legacy rows have no evidence.
--
-- Legacy disputes were raised against the whole WEEK with no component, so
-- neither a day nor a part is truthful. They are pinned to week_start and
-- typed 'others', and labelled as such, rather than silently attributed to a
-- day and a component the PR never picked.
--
-- Vouchers still at status='disputed' stay open (outcome NULL, resolved_at
-- NULL). Anything else was closed at some point but the outcome was never
-- stored anywhere — that is the data loss this migration exists to stop. Those
-- are marked resolved with a NULL outcome and an explicit note, rather than
-- guessing accepted/rejected and inventing history.
INSERT INTO "main"."payment_voucher_dispute"
  ("voucher_id", "dispute_date", "component", "reason", "note", "raised_at",
   "outcome", "resolved_at", "resolution_note", "created_by", "updated_by")
SELECT
  v."id",
  COALESCE(v."week_start", (v."disputed_at")::date, (v."updated_at")::date),
  'others',
  v."dispute_reason",
  v."dispute_note",
  COALESCE(v."disputed_at", v."updated_at"),
  NULL,
  CASE WHEN v."status" = 'disputed' THEN NULL ELSE v."updated_at" END,
  CASE WHEN v."status" = 'disputed'
       THEN 'Backfilled by migration 0051: raised against the whole week, before disputes were per-day and per-component.'
       ELSE 'Backfilled by migration 0051: whole-week dispute, closed before outcomes were recorded.'
  END,
  'migration_0051',
  'migration_0051'
FROM "main"."payment_voucher" v
WHERE v."disputed_at" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "main"."payment_voucher_dispute" d WHERE d."voucher_id" = v."id"
  );--> statement-breakpoint

-- No dispute without proof. NOT VALID exempts the backfilled rows above (which
-- genuinely have none) while enforcing it on every row inserted or updated
-- from here on. Deliberately a database guarantee, not just a UI gate: an app
-- check is bypassed by a retried request or a second client.
ALTER TABLE "main"."payment_voucher_dispute"
  ADD CONSTRAINT "payment_voucher_dispute_needs_proof"
  CHECK (
    "proof_photos" IS NOT NULL
    AND jsonb_typeof("proof_photos") = 'array'
    AND jsonb_array_length("proof_photos") >= 1
  ) NOT VALID;
