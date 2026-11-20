---
name: pr-detach-one-year-rule
description: "Owner rule (20 Nov 2026): an agency detaches a PR itself only after a year; under a year it is a real pr_detach admin request. approved_at is trigger-stamped — never set it by hand"
metadata:
  node_type: memory
  type: project
  originSessionId: c6003e81-b0f5-4750-8010-19f3af62de78
  modified: 2026-11-20T12:23:27.207Z
---

**The rule (owner, 20 Nov 2026 — "Keep rule, real admin request"; button word stays "Detach").**
An agency may let a PR go itself (Manage PR → Detach → `DELETE /pr/:id` → `agency_pr` = `'left'`) only
once that membership is 365 days old. Under a year the server refuses 409 in words, and the agency files
`POST /pr/:id/detach-request` instead — an `admin_request` of type `pr_detach` (subscriber = agency,
`subject_user_id` = the PR's user, FK). The admin answers on **Service → PR Detach**: Approve → that
agency's membership `'left'` + agency told (`pr_detach_decided`); Decline → stays + told. Admin is exempt
from the year. Rules and sentences live in `apps/backend/src/features/pr-personnel/pr-detach-rules.ts`.

**Why:** the under-a-year path used to be a toast that reached nobody, and the year was never computable —
`agency_pr` had no approval date, the web assumed "400 days ago", so every real Detach went straight through.

**How to apply:**
- The date is `agency_pr.approved_at` (migration 0171). It is stamped by the DB trigger
  `agency_pr_stamp_approved_at` on every path that approves a membership (seven in code). **Never write it
  from code or a script**; leave_pending → approved deliberately keeps the old stamp. Fallback when null is
  `created_at` (the earliest it can be), on server and web alike.
- `approvedAt` goes to agency and admin PR rows and is OMITTED for outlet callers (`withoutTieDate`).
- A pr_detach request is never Resolved, re-typed or filed through the generic `POST /admin-request` —
  each refuses it. Plan Request's badge/bell exclude it (`PLAN_REQUEST_EXCLUDES`).
- On 20 Nov all 63 live memberships were under a year, so every agency Detach is a request until mid-2027.

Related: [[pr-is-under-an-agency-not-a-member]], [[innocenz-tier-is-per-membership]],
[[never-probe-a-gate-with-a-write]], [[warn-before-adding-a-migration]].
