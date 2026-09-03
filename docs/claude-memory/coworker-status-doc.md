---
name: coworker-status-doc
description: "External coworker handoff doc (Done/Next/ToDo/Final) for Outlet+Agency backend wiring — kept in memory, not in the repo"
metadata: 
  node_type: memory
  type: project
  originSessionId: d7c27bdc-1edb-44f4-bcd9-ca4aa5735901
  modified: 2026-07-23T00:05:56.891Z
---

The user maintains an **external** status document (NOT in the repo — do not create STATUS.md) to hand off Outlet + Agency progress to a coworker. Structure = four lists: Done / Next Step / To Do / Final Checking. Last updated with me 2026-07-23 (branch SL).

**Current snapshot (verified against git + schema 2026-07-23):**
- **Done — Outlet:** Today, Subscription, Settings, Workspace (now `outlet_id` unique FK 1:1, drinks/service split live), Ratings, History (real shift/assignment/venue-PR reads), Post Job (outlet direct shift-write + Confirm staffing — see [[outlet-post-job-next]], committed 87f1573/af9c945).
- **Done — Agency:** Today, Approval, Job Posting, Manage PR, Subscription, Settings, Roster read+assign/unassign (via `agency_pr` join, migration 0032), Home KPIs, Outlet demand, History. See [[agency-portal-backend-wiring]] + [[roster-backend-wiring]].
- **Fixed since the doc's prior version:** Workspace outlet_id ✅; **PR_Tiering expanded 3→7 tiers** ✅ (migration 0038 adds tier_4/tier_5/servant/commission_only to `pr_tier` enum + 0039 shift_pay_tier — resolves the old "only tier 1-3 used" note); shift assigning linked to agency+PR ✅.
- **Next Step:** verify Payment Voucher ↔ PR wage-calc logic (PVs auto-generated weekly, see [[pv-auto-generated-weekly]]; history endpoint + wage calc merged 9c65f7e/6b19100); Payroll page needs "this week" data to approve/reject scanned receipts; confirm Post Job end-to-end across roles.
- **To Do / Final:** finish remaining backends + connect; delete unused DB tables; verify every link pulls correct table/data; confirm role-gating actually blocks wrong roles (open concern in [[admin-pages-not-role-gated]]).
