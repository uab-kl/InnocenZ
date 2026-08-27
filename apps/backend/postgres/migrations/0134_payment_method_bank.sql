-- WHICH BANK an FPX direct debit is authorised at — and pointedly NOT the
-- account number.
--
-- An FPX mandate is created BY THE BANK, not by us: the payer picks their bank,
-- is redirected to that bank's own login, authorises there, and the gateway
-- hands back a mandate token. The account number never passes through this
-- application, and there must never be a column for it — it is data we cannot
-- use (the token is what debits, not the number) and holding it would put this
-- database in scope for something it has no reason to carry. Exactly the
-- argument that keeps the card PAN out of `payment_method`.
--
-- What we DO need is which bank to send them to, and what to print beside the
-- saved mandate afterwards so a venue recognises its own arrangement.
--
-- `bank_code` is the gateway/PayNet identifier used to build the redirect
-- (Maybank2u is `MB2U0227`, CIMB Clicks `BCBB0235`, and so on). `bank_name` is
-- the display copy, snapshotted beside it deliberately: a bank that leaves the
-- FPX roster, or is renamed, must not blank the label on a mandate a venue
-- already holds.
ALTER TABLE "main"."payment_method"
  ADD COLUMN IF NOT EXISTS "bank_code" varchar(50);
--> statement-breakpoint
ALTER TABLE "main"."payment_method"
  ADD COLUMN IF NOT EXISTS "bank_name" varchar(120);
--> statement-breakpoint

-- A mandate rail with no bank is a redirect with nowhere to go. Enforced only
-- for `fpx_mandate`, the same conditional shape `payment_method_card_fields`
-- uses, so the other rails stay unaffected.
ALTER TABLE "main"."payment_method"
  ADD CONSTRAINT "payment_method_mandate_bank"
  CHECK ("type" <> 'fpx_mandate' OR "bank_code" IS NOT NULL);
