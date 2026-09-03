---
name: agency-leave-approvals-tab
description: PR MC/leave requests now have an MC/Leaves tab on the agency Approvals page (was only a panel buried on the roster)
metadata: 
  node_type: memory
  type: project
  originSessionId: 0c5ccb3a-1b60-4b89-b695-e6bf764672ea
  modified: 2026-07-29T03:17:47.574Z
---

Built 29 Jul 2026 (`f581688`, CSS `763a5f8`). Where a PR's MC/leave request surfaces for the
agency, and why it looks the way it does.

**The flow, end to end (all of it already existed except the tab):** the PR taps "MC / Leave"
on a shift in the mobile app → `POST /shift-assignment/mine/:id/leave` parks that assignment at
**`leave_pending`** → the agency decides via `POST /shift-assignment/:id/leave/approve|reject`
(both live since migration 0049). Approve excuses the shift with no penalty; reject puts the PR
back on it.

**Before:** the only place to act was `LeaveRequestsPanel`, buried at the bottom of
`/agency/roster`. **Now:** a third tab on `/agency/pending` (Approvals) beside Agency-Tied and
Cutlost, same list/detail layout as the other two — sidebar lists PR · outlet · shift date, the
detail pane shows the reason typed by the PR plus Approve / Reject. The roster panel is
**still there**; both read the same query key `["roster", "leave-requests"]`, so a decision in
either place refreshes the other and the planning grid together. Do not "fix" that duplication
without checking both.

**Two design decisions worth not re-litigating:**
1. **No reason sheet on reject**, unlike the sign-up and cutlost tabs. The backend's
   leave/reject endpoint takes NO reason, so collecting one would only throw it away — the same
   silent-discard class of bug fixed elsewhere this day. Add the sheet only if the endpoint
   grows a reason column.
2. **Tabs wrap by design.** `.iz-approvals-tabs` is `repeat(3, minmax(0,1fr))` and the sidebar
   column is `minmax(330px, 360px)` in `prototype-theme.css`. Measured against the compiled CSS
   at 1024/1280/1600: one row, equal 33px heights, no clipping. `white-space: nowrap` was tried
   and REMOVED — the longest label ("Agency-Tied (0)") fit at exactly 0px slack, so at the 330px
   floor it would clip; wrapping the count is the intended degradation.

Still missing from the leave lifecycle (unchanged): the auto-offer / notify half — nothing
offers the released slot to another PR automatically. The slot does show up on the roster's
backfill worklist. See [[outlet-agency-gaps]].
