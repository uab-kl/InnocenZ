---
name: collections-two-directions
description: "The demo agencyCollections slice hides TWO opposite directions of money behind one name, split by a kind field — which made the audit's repoint instruction wrong. What shipped 30 Jul, both ends, plus lib/collections.ts"
metadata: 
  node_type: memory
  type: project
  originSessionId: c8d8947f-3a09-4756-9fc7-2fb0c514a0e5
  modified: 2026-07-30T06:22:59.373Z
---

## The trap

The web demo store's `agencyCollections` slice carries **two opposite directions of money** under one
name, split by a `kind` field:

- **`kind: "outlet"`** = what outlets owe the agency → this is `main.collection_invoice`. Had **zero
  UI consumers**, which is why the whole feature was invisible.
- **`kind: "agency"`** = what the agency owes **InnocenZ** → NOT `collection_invoice`. That is
  `member_subscription`, see [[subscription-record-not-invoice]].

The agency Subscription screen's only use of the slice was the **`kind: "agency"`** half. So the
audit's instruction — *"repoint the Subscription screen at `GET /collection-invoice`"* — would have
rendered outlet receivables as the agency's own invoices. It was a section to **build**, not a source
to swap. See [[audit-entries-are-leads]].

## What shipped 30 Jul 2026 (frontend only — the backend landed 29 Jul in `deb7335`)

- `0dd7164` **agency side** — `services/collection-invoice` (list/issue/settle) +
  `use-agency-collections` + a section on agency Subscription. Actions gate on
  **`confirmReconciliation`, NOT `editSettings`** — finance is read-only for the payment card but is
  exactly the role that chases receivables.
- `1929a22` **outlet side** — `use-outlet-collections` + a section on outlet Subscription, gated on
  **`viewBilling`** (owner + finance, not ops). **Read-only by design:** `issue`/`settle` are
  `requireRole('admin','agency')` because the outlet is the one party with an interest in claiming it
  paid. Buttons there would only 403.
- `7baf1ec` the outlet Today **reconciliation banner**, rebased — see [[dont-back-outlet-sales-vs-pv]].

`viewCollections` had been an agency permission with no screen behind it.

## Domain rules worth keeping

- It is a **statement of account, not a payment rail.** InnocenZ never moves this money; the two
  parties settle between themselves. `settledAt` records that the agency *says* it was paid — the
  server's own `settle` message says so, and the UI surfaces that message rather than composing a
  friendlier one.
- Amounts derive from **shift assignments, not vouchers**: a voucher snapshots ONE outlet name, so a
  PR who worked two venues would bill whichever came first.
- `aging` is derived on read, never stored, and is null unless the invoice is `issued`.
- **Overdue is part of outstanding, not on top of it** — both screens say so.
- **No `agency_name` column** on the table (it snapshots `outlet_name` only), so an outlet billed by
  two agencies cannot be told which one raised a statement. The outlet hook exposes
  `hasMultipleAgencies` and the UI says so rather than guessing from `agency_id`.

## Use the shared module

`apps/web/src/agency-portal/lib/collections.ts` — `sumCollectionRm` (**integer cents**, not float
addition — the same arithmetic the voucher Σ=0 check exists to catch), `collectionAmountRm`,
`collectionWeekLabel`, `collectionStampLabel`, `COLLECTION_AGING_PILL`. Both ends read it; do not add
a third copy.
