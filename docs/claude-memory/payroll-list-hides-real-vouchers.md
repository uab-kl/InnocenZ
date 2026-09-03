---
name: payroll-list-hides-real-vouchers
description: "FIXED 30 Jul 2026 (9966b4f) — the agency Payroll list showed 0 of 4 real vouchers because demo week tabs start Sunday and the backend's week_start is Monday. Owner kept Sunday tabs + added This Week; matching is by CONTAINMENT, and each row prints its own week."
metadata: 
  node_type: memory
  type: project
  originSessionId: 049ec23c-4a13-4d43-8871-f60655701048
  modified: 2026-07-30T12:38:17.916Z
---

**The agency Payroll & PV list cannot display a single backend voucher.** Atlas has 4 (2
`pending_review`, 2 `sent`); both week tabs render **"Payment Vouchers (0)"**. Proven live 30 Jul 2026
on `owner@atlas-agency.my` — the API returns the 4, the screen shows none.

## Cause — two faults meeting at one line

`pvBelongsToPayrollWeek` (`apps/web/src/routes/agency/pv.tsx:152`) matches a backend voucher with
`pv.weekStartIso === <the tab's week start>`.

1. **Sunday vs Monday.** Tab weeks come from `demoPayrollWeekBoundsForWeeksAgo`, which runs
   **Sun→Sat** (19 Jul, 12 Jul). The backend's `week_start` is **Mon** (20 Jul, 27 Jul). The strings
   can never be equal.
2. **No current-week tab.** The two tabs are *last week* and *two weeks ago*; `pending_review`
   vouchers sit in the **current** week, so even with matching conventions they would have no tab.

## ✅ FIXED `9966b4f` — and why NOT by overlap

**Owner's call: keep the tabs Sunday-start, add a "This Week" tab.** Matching is now
**containment** — `pv.weekStartIso >= tabStart && <= tabEnd`.

**Containment, never overlap.** Overlap surfaces the 20–26 Jul voucher but can match **one voucher to
two tabs** (20–26 Jul overlaps both 19–25 and 26 Jul–1 Aug). A single date belongs to exactly one
Sun–Sat week, so containment is unambiguous. Don't "improve" it into a range overlap.

**The one-day gap is PRINTED, not hidden.** Each row shows `Week worked: 27 Jul – 2 Aug 2026` under
the tab's `26 Jul – 01 Aug 2026`, via `pvOwnWeekLabel()`. This is not decoration: the backend's
`cycle` column holds a **cadence** (`"Weekly"`), not a range, so before this a real voucher displayed
**no dates at all** and the tab heading spoke for it — the label-bug class in
[[pv-detail-merge-convergent-fix]].

`demoPayrollWeekBoundsForWeeksAgo(-1)` already returns the current Sunday week; no new helper was
needed. The new tab reuses `LAST_WEEK_REVIEW_STATUSES` (a week being open does not stop an agency
reviewing what has accrued) and drops the `TO_PAY` filter, which needs a signature.

**Live after:** This Week = 3 (2 pending agency review + 1 pending PR review), Last Week = 1, all 4
reachable, day review opens by **clicking a row**, zero console errors.

## The second half, found while verifying the first (`34bacbc`)

The agency home links to `/agency/pv?status=PENDING_REVIEW` (`AgencyHomeHubTabs`), and the effect
behind that param **hardcoded `last_week`**. A real `pending_review` voucher lives in the week still
running, so the link landed on *"Pending Agency Review (0) · No vouchers match these filters"* with 2
waiting one tab away.

**It was undetectable before the list fix** — until then no real voucher listed on any tab, so the
empty list looked correct. **Twice in one day, making real data visible immediately exposed a bug the
empty state had hidden.**

Fixed by deriving the tab: `tabHoldingStatus(status)` returns the newest week actually holding a
voucher of that status, `last_week` as fallback. **A named tab is what went stale; a derived one
cannot.** Two things not to "simplify":

- **The week lists ARE dependencies of that effect on purpose.** On first paint the vouchers have not
  arrived, so a single-shot pick falls back to `last_week` and sticks.
- **`selectPayrollWeekTab` clears `?status`/`?pv`.** Without it the effect re-applies the URL's
  instruction on the next refetch and drags the user off the tab they just clicked.

`?status=TO_PAY` → Payment Week is unchanged, and a status with no rows anywhere falls back cleanly.

## The deep link is still the fastest way to a specific voucher

`detail` is looked up over the *unfiltered* list, so this always works regardless of tab:

`http://localhost:3000/en/agency/pv?pv=<voucher-uuid>`

That is how the day-review panel was first verified, before the list was fixed.

**How it was found:** clicking finished work through a browser on a real login — see
[[portal-clickthrough-30jul]]. It survived every reading-based pass of the audit.
