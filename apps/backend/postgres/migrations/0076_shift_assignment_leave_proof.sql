-- MC / medical-certificate proof for a PR leave request.
--
-- Lives on the EXISTING shift_assignment row (the table that already models the
-- whole MC/leave flow: status leave_pending -> leave_approved, reason on
-- `notes`) rather than a new table — the proof only ever means anything for
-- this one assignment's request, and the audit quartet is already on the row.
-- Same array-of-images shape as payment_voucher_line.proof_photos, so the
-- agency review UI reads it the same way. Null on every row that never filed
-- leave; kept after approve/reject so the decision stays auditable.
ALTER TABLE "main"."shift_assignment" ADD COLUMN IF NOT EXISTS "leave_proof_photos" jsonb;
