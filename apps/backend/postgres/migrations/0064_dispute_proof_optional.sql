-- Proof becomes optional, matching the PR app's dispute sheet, which has always
-- said "Proof images are optional — attach a receipt photo if you have one".
--
-- 0051 made it mandatory via payment_voucher_dispute_needs_proof (a NOT VALID
-- CHECK requiring a non-empty proof_photos array). That is wrong in exactly the
-- case that matters most: a PR disputing a MISSING record has no receipt to
-- photograph — the absence IS the complaint — so mandatory evidence made the
-- most legitimate claim the only one that could not be filed.
--
-- Evidence has not stopped mattering; it moved. Strength of proof is now
-- something the agency weighs when resolving, and disputes with photos are
-- simply easier to accept. The column, its shape and its immutability are
-- unchanged — only the precondition is gone.
--
-- IF EXISTS because the constraint is absent on any database built after this
-- point, and this is the shared DB.
ALTER TABLE "main"."payment_voucher_dispute"
  DROP CONSTRAINT IF EXISTS "payment_voucher_dispute_needs_proof";
