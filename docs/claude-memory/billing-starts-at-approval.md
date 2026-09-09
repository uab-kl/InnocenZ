---
name: billing-starts-at-approval
description: "An org is billed from the day an admin APPROVES it, never from sign-up; the anchor lives in member_subscription.billing_starts_at and NULL means not-yet-billable"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1aa476a4-34a1-466f-8576-6d407d68ad86
  modified: 2026-09-09T03:07:56.615Z
---

**Owner's call, 9 Sep 2026.** An outlet or agency is billed from the day an admin
approves it — not the day it registers. Migration **0157** added
`member_subscription.billing_starts_at` (nullable timestamptz) for exactly this.

**Why it had to change.** A self-registered org is created `pending_review`, and
the portal then confines it to Settings/Profile (`isOrgProfileOnly` → zero nav
items). Billing from `started_at` opened a RM 999 monthly period on the day a
venue gained access to an *address form* — and since the anchor is permanent, a
venue signing up on the 3rd and approved on the 11th was anchored to the 3rd for
the life of the account.

**The rules, all of them:**
- `enrolOrgOnPlan` writes `billingStartsAt: null`. **NULL means enrolled but not
  yet billable**, and `generateMissing` skips a lane where no row has an anchor —
  so an org nobody approves accrues nothing, rather than a backlog to cancel and
  credit.
- A lane's anchor is the **earliest non-null** value on it, so a plan switch never
  re-dates the calendar. A switch also inherits the closed row's value.
- `startBillingOnApproval` (leaf, shared by both `/approve` handlers) stamps it
  and **opens the first period immediately** rather than waiting for the 03:00 job.
- Stamping is guarded on `IS NULL` because `/approve` is ALSO the reactivation
  path for a suspended org — re-anchoring would move a paying customer's billing
  day on every suspend/restore.
- `create()` defaults the column, so add-ons, switches and seeds bill as before.

⚠️ **The booby trap:** deleting the explicit `billingStartsAt: null` in
`enrolOrgOnPlan` fails no build and no test — it silently restores
bill-from-sign-up, because `create()` defaults an absent key to `started_at`.

⚠️ Nothing can CHANGE an anchor afterwards — the member-subscription PUT does not
accept the column and no screen shows it. Logged in TEST_SCRIPT.md §9.

Shipped alongside a server-side fix: `POST /shift` never read `outlet.status`
(the pending/suspended lock was `canAccessOutletPath` in apps/web only), so the
API accepted posts from a venue the UI had locked out. Per
[[absent-evidence-is-about-the-instrument]] the live DB was checked FIRST (8/8
outlets `active`) before adding a gate that could have taken venues offline.

Related: [[innocenz-receipt-lifecycle]], [[innocenz-database-rules]],
[[warn-before-adding-a-migration]].
