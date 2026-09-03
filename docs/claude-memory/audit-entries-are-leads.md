---
name: audit-entries-are-leads
description: "RE-DERIVE every audit entry from the code before acting — including entries that claim something is FINE. Wrong 5 for 5 on 30 Jul 2026: 3 what's-left entries, plus a 'false alarm' verdict and a 'Live' chip that were both reassuring and both wrong. Its tables and phase columns also go stale independently"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c8d8947f-3a09-4756-9fc7-2fb0c514a0e5
  modified: 2026-07-30T16:12:10.488Z
---

**Treat the wiring audit's "what's left", per-screen tables and phase Open columns as leads, not work
orders. Re-derive each from the code before starting.** This applies to **`TEST_SCRIPT.md` §9 too** —
that backlog is written by the same hand and fails the same way.

**#6 (31 Jul 2026), and it was in §9, not the audit:** *"Replicate the Actions column to the other 4
user-management tabs… Mechanical."* Two of the four — `agency.tsx`, `outlet.tsx` — **list
organisations, not accounts** (`fetchAgencies`/`fetchOutlets`), so `row.id` is an agency/outlet id and
`PATCH /user/:id/status` would address a row that is not there. Shipped on the two that really are
accounts (`f365537`). **The tell all six share: each one read as obvious.** "Mechanical" and "false
alarm" are the two words on this project that most reliably precede a wrong entry.

**Why:** on 30 Jul 2026 the audit's own description of remaining work was wrong **three times out of
three**, and two of those would have shipped a bug:

1. *"Repoint the agency Subscription screen at `GET /collection-invoice`"* → **wrong table and wrong
   direction of money.** That screen's slice use is the agency's own InnocenZ bills; repointing it
   would have rendered outlet receivables as the agency's own invoices. It was a section to *build*.
   → [[collections-two-directions]]
2. *"The reconciliation banner duplicates a figure that is now real"* → it was **not** collections at
   all, but a comparison against **payroll an outlet must not be shown**. The pair had to change, not
   the source. → [[dont-back-outlet-sales-vs-pv]]
3. *"Needs receipts added to the `/mine` responses"* → **no backend change existed to make.** The
   lines already carried every field (`decodeRef()` recovers kind/source/sales off `line.ref`). That
   note was written the same morning, by me, and was still wrong by afternoon.

**The worse half, found later the same day: entries that say something is FINE lie too, and nothing
prompts you to check them.** A "what's left" entry at least gets re-derived because you are about to
act on it. A reassuring entry just closes the question. Two did exactly that:

4. Phase H, *"the `getByUserId` multi-agency bug was a false alarm; a unique constraint makes the
   second row impossible"* → **the constraint is `agency_pr_agency_id_pr_id_unique`, on
   `agency_pr`, over `(agency_id, pr_id)`.** `pr.user_id` is a plain nullable FK with **no unique
   index in the model or in any migration** — grep the migrations, there is none. The bug was real
   and shipped as `8cf26f3`.
5. The roster screen table chipped *"Roster · GPS panel — **Live** — reads the server's own stored
   distance"* → **`AgencyGpsPanel` imports `agency-demo` and a hardcoded `OUTLET_GPS` table.** The
   real `check_in_lat/lng` columns had never been read by anything until `20dbcad`.

Both were caught only because adjacent work happened to touch them. **When an audit entry says a
concern is closed, verify the artifact it names** — the table the constraint is actually on, the
import list of the component actually chipped Live.

**How to apply:** open the named file and the named endpoint first. Confirm the claimed gap exists,
and confirm the direction of the data, before writing anything. When the audit and the code disagree,
the code wins and the audit gets corrected — a closed finding stays on the page struck through, so the
page shows what moved.

**Second failure mode, same day:** the findings list and the phase board drift apart, because closing
a finding does not touch the board. Phases A and G were still listing the ungated routers
(`41386b9`), the register gate (`da4657b`) and the PV signature (`70ec785`) as open while all three
were struck through as closed further up the same page. When you close a finding, sweep the phase
columns and the per-role screen tables too.

Full commit history and the artifact URL live in [[current-state-and-audit]].
