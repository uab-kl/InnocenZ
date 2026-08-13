---
name: innocenz-dispute-rule
description: InnocenZ dispute rule — drinks/tips only and only after agency approval; wages + OT are outlet-fixed and never disputable (reverses the 30 Jul wages exemption)
metadata: 
  node_type: memory
  type: project
  originSessionId: 2518481e-d8d4-4ce6-87bc-8a3e7c965b3a
  modified: 2026-08-04T06:39:14.959Z
---

Owner's rule, stated 4 Aug 2026 and repeated for emphasis: **a PR may dispute only DRINKS and TIPS,
and only after the agency has APPROVED the receipt.** Daily wages and Others (overtime, deductions)
are **never** disputable — "fixed by the outlet" — the PR can only **view the proof** on those rows.

**Why this is worth remembering rather than reading off the code:** it REVERSES the 30 Jul 2026 rule
that wages were the one thing always disputable (reasoning then: wages are sealed at check-out with
no receipt to approve, so gating them on approval would make a wage error uncontestable). Anyone
reading the older notes finds the opposite rule stated confidently. The accepted cost is that a wrong
wage or OT figure now has **no in-app route to contest** — it is fixed by correcting the attendance
record instead.

Implemented as ONE function, `lineDisputable(kind, receiptStatus)` in
`apps/backend/src/features/payment-voucher/payment-voucher-component.ts`, feeding both the
`disputable` flag the phone reads and the 400 in `raiseMyDispute` — a client copy of a rule is never
the rule. Mobile mirrors it in `cellDisputable`.

Two edges decided alongside it:
- `others` covers OT **and deductions**, so a deduction is not disputable either. If that ever needs
  contesting it gets its own bucket, never a re-opened OT.
- A drinks/tips line with **no receipt at all** (agency typed the figure directly) is left
  disputable — there is nothing pending to wait for and the number is the agency's own. NOT confirmed
  with the owner; tighten only if they say so, since blocking it would make agency-typed drinks money
  uncontestable.

Related: [[innocenz-pv-pipeline]] · the receipt-lifecycle mirror at
`docs/claude-memory/innocenz-receipt-lifecycle.md` · [[verify-against-test-script]]
