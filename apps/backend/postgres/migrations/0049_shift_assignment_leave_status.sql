-- shift-assignment: add the MC/Leave states to the assignment lifecycle.
--
-- Reuses the existing shift_assignment table / shift_assignment_status enum
-- (no new table, no new column — the leave reason lives on the existing
-- `notes` varchar(500), same as a cancellation reason):
--   leave_pending  -> the PR submitted an MC/leave request for the shift and
--                     is waiting for the agency to approve or reject it
--   leave_approved -> the agency approved the request; the PR is excused from
--                     the shift with no penalty (treated like `cancelled` by
--                     staffing/cost rollups). A rejected request simply
--                     returns the row to `assigned`, so no third value.
--
-- These new values are only added here, not used in this migration, so they
-- are safe to add inside the migration transaction (Postgres 12+).

ALTER TYPE "main"."shift_assignment_status" ADD VALUE IF NOT EXISTS 'leave_pending';--> statement-breakpoint

ALTER TYPE "main"."shift_assignment_status" ADD VALUE IF NOT EXISTS 'leave_approved';
