-- 0148 · Retire the payment_method rows saved on rails the app no longer offers.
--
-- Owner's rule (2 Sep 2026): a saved payment method is OPTIONAL and means
-- AUTO-DEBIT. Only two rails can be saved from now on — card and the FPX
-- direct-debit mandate (`fpx_mandate`). The e-wallet rail and the one-off
-- `fpx` link rail were withdrawn from the picker the same day; neither can pull
-- money, so a row on either one is not a payment method in the new sense — it
-- is a leftover that still printed "E-wallet · Touch 'n Go eWallet" as the
-- venue's instrument after the rail had gone (the owner's own screenshot).
--
-- Retired the way the app's own Remove does (`payment-method.repository`
-- `remove`): status flipped to 'removed', is_default cleared in the SAME write
-- so the partial "one default per org" index frees up for the replacement, and
-- the audit pair stamped. Nothing is deleted — what these rows were is still
-- readable on the admin side, and `subscription_payment.method_type` (a rail
-- ON AN ATTEMPT, not an instrument) is untouched: every manual pay-now is still
-- recorded as `fpx`, which is exactly what the checkout stamps.
--
-- The CHECK constraints keep admitting both values on purpose. `fpx` stays the
-- honest label for a manual payment, and a row that already exists must remain
-- describable; what closes the door is the save schema, which now accepts only
-- the two savable rails.

UPDATE "main"."payment_method"
SET
  "status"     = 'removed',
  "is_default" = false,
  "updated_at" = now(),
  "updated_by" = 'migration:0148'
WHERE "type" IN ('ewallet', 'fpx')
  AND "status" <> 'removed';
