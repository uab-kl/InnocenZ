---
name: subscription-record-not-invoice
description: "member_subscription has NO payment state — it is a who-subscribed-and-when ledger, so no screen may badge a row Paid. Both portals were doing it; shared lib/subscription-record.ts now stops them drifting"
metadata: 
  node_type: memory
  type: project
  originSessionId: c8d8947f-3a09-4756-9fc7-2fb0c514a0e5
  modified: 2026-07-30T06:22:18.890Z
---

**`main.member_subscription` cannot answer "was this paid?".** It is a *who subscribed and when*
ledger: **one row per subscription**, carrying `startedAt`, `endedAt`, `amount`, `billingCycle`,
`status`. There is **no payment state, no per-charge row, no capture reference**. Any UI reporting
payment from it makes a claim the data cannot carry.

`MemberSubscriptionStatus` = `active | cancelled | expired | past_due`.

## The bug this caused (fixed 30 Jul 2026, `7f72fbc` + `4ab4da2`)

Both Subscription screens collapsed those four states into an invoice card's `SETTLED | PENDING`:

```ts
status: sub.status === 'past_due' ? 'PENDING' : 'SETTLED'   // ← the outlet's version
```

So `cancelled` and `expired` both became SETTLED → a **green "Paid" pill**. A venue whose
subscription had been cancelled was shown its own record as paid. `active` → "Paid" is *also* wrong:
active means the subscription is running, a different claim.

## The rule now

- Backed sessions say **"Subscription record"**, not "Billing history", with a line stating it is one
  row per subscription rather than per charge.
- All four states get their own label/tone: Active/green · Past due/amber · Cancelled/ink · Ended/ink.
- An **unrecognised** status prints the raw value rather than guessing a tone — a new enum value
  silently rendering as paid is exactly how this bug read.
- **Demo rows keep "Paid", correctly** — they genuinely are invoice-shaped with a settled/pending
  state. Only the backend rows stop borrowing the wording.

## Use the shared module

`apps/web/src/agency-portal/lib/subscription-record.ts` — `SubscriptionRecordRow`, `MEMBER_STATUS`,
`subscriptionRecordFromMember(sub, orgLabel)`, `sortMemberSubscriptions`. Both screens read it.
**Do not write a third status mapping** — the two ends disagreeing about what `expired` looks like is
the failure it exists to prevent.

The agency history query is deliberately **separate** from the existing `memberQuery`, which filters
`status:"active"` and is read as `data[0]` to answer "which plan is this agency on". Widening that one
would let a cancelled row become the current plan.

Not to be confused with [[collections-two-directions]] — that is what OUTLETS owe the AGENCY: a
different table, the opposite direction of money. Schema-level notes on this table live in
[[db-table-conventions]] and [[schema-reshape-backlog]].
