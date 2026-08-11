-- Record the agency's MC / leave decision as DATA, not as a note prefix.
--
-- Until now a rejection was stored by setting `status` back to 'assigned' and
-- prefixing `notes` with '[Leave rejected]', and the approver was read from the
-- generic `updated_by` audit column. That made history unprovable: the reason
-- text is PR-editable, and any later edit to the row silently reassigned who
-- approved the MC.
--
-- Mirrors the overtime decision triple already on this table (migration 0077):
--   overtime_status / overtime_decided_at / overtime_decided_by
-- so the two decisions on one assignment are shaped and read the same way.

ALTER TABLE main.shift_assignment
  ADD COLUMN IF NOT EXISTS leave_status varchar(20),
  ADD COLUMN IF NOT EXISTS leave_decided_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS leave_decided_by varchar;

COMMENT ON COLUMN main.shift_assignment.leave_status IS
  'pending | approved | rejected. NULL on rows that never filed leave.';

-- ---------------------------------------------------------------------------
-- Backfill from the encoding this replaces. Only rows that actually filed
-- leave are touched: leave_proof_photos IS NOT NULL, or a leave_* status.
-- updated_at / updated_by are the best evidence available for the decision
-- moment; from here on the dedicated columns carry it.
-- ---------------------------------------------------------------------------

UPDATE main.shift_assignment
   SET leave_status = 'approved',
       leave_decided_at = updated_at,
       leave_decided_by = updated_by
 WHERE leave_status IS NULL
   AND status::text = 'leave_approved';

-- Rejections reverted `status`, so they are only identifiable by the note
-- prefix the old code wrote. This is the one and only chance to recover them.
UPDATE main.shift_assignment
   SET leave_status = 'rejected',
       leave_decided_at = updated_at,
       leave_decided_by = updated_by
 WHERE leave_status IS NULL
   AND leave_proof_photos IS NOT NULL
   AND notes LIKE '[Leave rejected]%';

-- Still awaiting a decision: no decided_at/by, because nobody has decided.
UPDATE main.shift_assignment
   SET leave_status = 'pending'
 WHERE leave_status IS NULL
   AND status::text = 'leave_pending';

-- Filed leave, no recoverable decision: treat as pending rather than invent one.
UPDATE main.shift_assignment
   SET leave_status = 'pending'
 WHERE leave_status IS NULL
   AND leave_proof_photos IS NOT NULL;

-- The MC/Leaves queue and its history both filter on this column.
CREATE INDEX IF NOT EXISTS shift_assignment_leave_status_idx
  ON main.shift_assignment (leave_status, agency_id);
