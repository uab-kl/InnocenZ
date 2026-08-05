-- payment_voucher_line.outlet_id — the FK the outlet name should always have been.
--
-- WHY (owner's decision, 4 Aug 2026). Verifying an agency-added drink against
-- "that outlet's price list" needs to know WHICH OUTLET the receipt belongs to.
-- Today the only answer on the row is `payment_voucher_line.outlet`, a
-- varchar(255) holding a NAME copied in at write time — so the check would have
-- to match on text. Rename an outlet in Manage Outlet and every add on its
-- receipts starts refusing, for a reason no screen would explain; two outlets
-- sharing a name are simply ambiguous.
--
-- It is also a standing rule of this project (CLAUDE.md #3): read other tables
-- through FOREIGN KEYS, never a duplicated `name` column. This closes one of the
-- weak edges that rule was written about.
--
-- ON THE LINE, NOT THE VOUCHER, and that is deliberate: a PR can work two venues
-- in one payroll week, so the voucher's own `outlet` is a summary while the LINE
-- is where a single night's money actually sits. `payment_voucher_receipt` has
-- no outlet column at all — it inherits the outlet of its lines, which is why
-- the receipt editor resolves the outlet through them.
--
-- ON DELETE SET NULL, never CASCADE: deleting an outlet must not delete the
-- payroll lines recording what somebody was paid. A NULL here means "outlet no
-- longer resolvable", which the catalogue check refuses honestly rather than
-- silently skipping.
ALTER TABLE "main"."payment_voucher_line"
  ADD COLUMN IF NOT EXISTS "outlet_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_voucher_line_outlet_id_fk'
  ) THEN
    ALTER TABLE "main"."payment_voucher_line"
      ADD CONSTRAINT "payment_voucher_line_outlet_id_fk"
      FOREIGN KEY ("outlet_id") REFERENCES "main"."outlet"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- The check reads this column per receipt, so it is worth an index.
CREATE INDEX IF NOT EXISTS "payment_voucher_line_outlet_id_idx"
  ON "main"."payment_voucher_line" ("outlet_id");

-- BACKFILL — only where the name resolves to EXACTLY ONE outlet.
--
-- An ambiguous name is left NULL on purpose. Guessing which of two identically
-- named outlets a line belongs to would attach real money to the wrong venue's
-- price list, and a NULL is a question the code can answer out loud; a wrong
-- uuid is one nobody would ever think to ask. Matching is trimmed and
-- case-insensitive because these names were typed, not chosen.
UPDATE "main"."payment_voucher_line" AS l
SET "outlet_id" = m.id
FROM (
  -- min(o.id::text)::uuid, NOT min(o.id): PostgreSQL has no min() aggregate for
  -- uuid, and that is what made `pnpm migrate:deploy` die with
  -- "function min(uuid) does not exist" (SQLSTATE 42883) before applying
  -- anything at all. The cast is safe here rather than merely expedient — the
  -- row is only used when `m.n = 1`, so the group holds exactly ONE outlet and
  -- the aggregate is picking the single value, not choosing between candidates.
  SELECT lower(btrim(o."name")) AS key, min(o.id::text)::uuid AS id, count(*) AS n
  FROM "main"."outlet" o
  GROUP BY lower(btrim(o."name"))
) AS m
WHERE l."outlet_id" IS NULL
  AND l."outlet" IS NOT NULL
  AND lower(btrim(l."outlet")) = m.key
  AND m.n = 1;
