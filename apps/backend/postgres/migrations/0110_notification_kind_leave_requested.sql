-- A PR files an MC / leave request and the agency is told.
--
-- Every other PR->agency event on shift_assignment already had a producer:
-- cancelMine notifies, approveLeave notifies. requestLeaveMine — the one that
-- ASKS the agency for a decision — notified nobody, so the request sat on the
-- Approvals -> MC/Leaves tab until someone thought to look. The endpoint has
-- been answering "Leave request sent - your agency will review it" the whole
-- time, which is the same false promise cancelMine used to make.
--
-- Deliberately NOT shift_cover_needed: nobody is off yet. A filed request is a
-- decision waiting to be made, not a staffing gap — reusing the cover kind
-- would point the agency at the roster's backfill list for a shift that is
-- still fully staffed. Cover is raised later, by approveLeave, if it approves.
--
-- Additive and idempotent; ALTER TYPE ... ADD VALUE cannot be rolled back
-- inside a transaction, so a re-run must be a no-op.
ALTER TYPE "main"."notification_kind" ADD VALUE IF NOT EXISTS 'leave_requested';

-- ...and the answer coming back. The PR filed an MC and then heard nothing:
-- approveLeave notified the AGENCY (cover needed) and rejectLeave notified
-- nobody at all, so the person waiting to know whether they had to show up for
-- the shift was the one party never told. Both directions now close the loop.
--
-- One kind for both outcomes, like cutlost_decided: the body says which, and
-- splitting approve/reject into two kinds buys nothing a payload cannot.
ALTER TYPE "main"."notification_kind" ADD VALUE IF NOT EXISTS 'leave_decided';
