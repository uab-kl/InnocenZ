-- The e-wallet rail: which wallet a subscriber intends to pay from.
--
-- `ewallet` has been a legal value of `payment_method.type` since 0082 and
-- nothing has ever written one — no column named the provider, no picker offered
-- it. This adds the missing half so Touch 'n Go, GrabPay, ShopeePay and Boost can
-- be recorded the way a bank transfer already is.
--
-- ITS OWN COLUMN, not `bank_code`. Those hold PayNet FPX codes and are read back
-- through `fpxBankByCode()`; Touch 'n Go is not a bank, so putting 'TNG' there
-- would make the column name lie about its contents and would silently fail
-- every roster lookup that column exists to serve. One fact, one place.
--
-- ⚠️ WHAT THIS DOES NOT MEAN. An e-wallet is a PUSH rail — the payer approves
-- each payment in their own app — so it is deliberately absent from
-- `autoChargeableTypes` and the controller forces `auto_pay` false on it. This
-- column records HOW a venue intends to pay, exactly like the bank-transfer
-- rail; it is not, and must never be read as, standing authority to debit them.
--
-- The CHECK mirrors `payment_method_mandate_bank` from 0134: a wallet rail with
-- no provider is a payment instruction with no destination.
ALTER TABLE "main"."payment_method"
  ADD COLUMN IF NOT EXISTS "wallet_provider" varchar(50);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_method_wallet_provider'
  ) THEN
    ALTER TABLE "main"."payment_method"
      ADD CONSTRAINT "payment_method_wallet_provider"
      CHECK ("type" <> 'ewallet' OR "wallet_provider" IS NOT NULL);
  END IF;
END $$;
