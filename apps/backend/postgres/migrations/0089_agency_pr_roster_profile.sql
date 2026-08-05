-- The agency Manage-PR editor has always offered Place, Years experience, KPI
-- tier and Pay class, but no column existed anywhere in `main` to hold them
-- (probe-pr-columns.ts, 5 Aug 2026: NOT FOUND across all 43 tables), so every
-- edit was discarded and the form silently reverted.
--
-- They belong on `agency_pr`, not on `pr`: each is a fact about a PR UNDER THAT
-- AGENCY — the tier this agency grades them at, the pay class this agency
-- employs them on — not about the person. A PR on two rosters can hold two
-- different values, which a column on `pr` could not represent. `pr` is also
-- slated for removal, so it is the wrong place to add anything new.
--
-- kpi_tier / pay_class stay varchar rather than pg enums deliberately: the two
-- live enum drifts this project has hit (payment_voucher_dispute.component,
-- platform_config) were both type mismatches invisible to tsc, and these two
-- vocabularies are still moving. Values are validated in UpdatePrSchema.
ALTER TABLE "main"."agency_pr" ADD COLUMN IF NOT EXISTS "place" varchar(120);
ALTER TABLE "main"."agency_pr" ADD COLUMN IF NOT EXISTS "years_exp" integer;
ALTER TABLE "main"."agency_pr" ADD COLUMN IF NOT EXISTS "kpi_tier" varchar(8);
ALTER TABLE "main"."agency_pr" ADD COLUMN IF NOT EXISTS "pay_class" varchar(32);
