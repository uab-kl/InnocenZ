-- agency_pr: add the departure states to the membership lifecycle.
--
-- (Numbered 0125 at the owner's instruction — the 0122-0124 slots are left
-- for migrations arriving on the teammate branch.) Reuses the existing
-- agency_pr table / agency_pr_approve_status enum (no new table, no new
-- column — the same shape 0049 gave shift_assignment its MC/leave states):
--
--   leave_pending -> an APPROVED PR asked to leave this agency and is waiting
--                    for the agency to approve the departure. The request is
--                    only accepted once everything between the two is settled
--                    (vouchers paid, disputes closed, no upcoming or
--                    unfinished shifts) — checked server-side on the request
--                    AND re-checked on the agency's approve.
--   left          -> the agency approved the departure. The row is KEPT,
--                    never deleted: the approvals page reads it as history,
--                    and UNIQUE(agency_id, user_id) means a re-join flips this
--                    same row back to 'pending' instead of inserting.
--
-- A rejected departure simply returns the row to 'approved' with
-- reject_reason prefixed '[Leave rejected] ...', so no third value exists.
--
-- The new values are only ADDED here, never used in this migration, which is
-- what makes ALTER TYPE ... ADD VALUE safe inside the migration transaction
-- on Postgres 12+ (0049 documents the same rule).

ALTER TYPE "main"."agency_pr_approve_status" ADD VALUE IF NOT EXISTS 'leave_pending';--> statement-breakpoint

ALTER TYPE "main"."agency_pr_approve_status" ADD VALUE IF NOT EXISTS 'left';
