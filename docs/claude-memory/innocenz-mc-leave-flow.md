---
name: innocenz-mc-leave-flow
description: MC/leave has no table of its own — it rides shift_assignment (status enum + notes + leave_proof_photos jsonb)
metadata: 
  node_type: memory
  type: project
  originSessionId: 695d9379-b35c-4f71-a8b6-b56e3d161a31
  modified: 2026-07-31T05:05:16.117Z
---

InnocenZ MC / leave requests have **no dedicated table**. The whole flow lives on the
existing `main.shift_assignment` row:

- `status` enum: `assigned` → `leave_pending` → `leave_approved` (agency reject returns it
  to `assigned`, with the reason prefixed `[Leave rejected]`).
- reason: the reused `notes` varchar(500) column.
- MC proof: `leave_proof_photos` jsonb (added 31 Jul 2026, migration 0076) — array of
  downscaled data-URL images, same contract as `payment_voucher_line.proof_photos`.
  Required by both the PR app and `requestLeaveMine` on the server.

Endpoints: `POST /shift-assignment/mine/:id/leave` (PR files), `/:id/leave/approve` and
`/:id/leave/reject` (agency). Agency reads it on Approvals → MC/Leaves and the Roster's
LeaveRequestsPanel; both get the column free because the repository selects the whole
`ShiftAssignmentTable` and spreads it.

**Migration trap (hit 31 Jul 2026):** `pnpm migrate:deploy` can print "migrations applied
successfully" and insert the row into `drizzle.__drizzle_migrations` *without executing the
DDL*. Always confirm a new column with an `information_schema.columns` query before assuming
it landed; re-running migrate will NOT retry it (the ledger already claims it applied), so
apply the statement directly. Related: [[innocenz-database-rules]], [[innocenz-pr-mobile-app]].
