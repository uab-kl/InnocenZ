---
name: pv-detail-merge-convergent-fix
description: "The one merge conflict with main (PR #36): jk and I fixed the same mobile PV receipts bug independently. Why the resolution kept jk's structure but overrode its ref/matched, and the rule that generalises the four claims-more-than-its-data bugs"
metadata: 
  node_type: memory
  type: project
  originSessionId: e6a0525f-ec3a-44a2-bf33-e24471117ad8
  modified: 2026-07-30T08:53:49.768Z
---

**Merge `eae3099` (main `11652f8` → SL). One conflict:
`apps/mobile/src/screens/PvDetailScreen.tsx`. Both branches had fixed the SAME bug independently** —
the PV detail receipts panel showing four hardcoded drinks beside a real net figure the PR signs.
Mine was `48d5da6`; jk's landed on main in PR #36.

**Resolution: took jk's version as the base** (`git checkout --theirs`), because it restructures more
of the screen — signature pad, async `confirmSign` with `sigInk`, shared `week-pay-grid`. Then ported
across only the two points where jk's mapping states what the data cannot support:

- **`ref`** was `` `LN-${l.id.slice(0,6).toUpperCase()}` `` — a shortened primary key formatted to look
  like a receipt number. **There is no `receipt_no` on `payment_voucher_line`**; it lives on
  `payment_voucher_receipt`, which `/mine` does not join. Now `SOURCE_LABEL[l.source]` →
  Scanned / Self-logged / Auto-sealed.
- **`matched`** was hardcoded `true`, asserting every row was receipt-backed — including self-logs,
  which by definition are not. Now `!l.pending` (`pending` is set only for a manual self-log).

**Kept from jk on purpose:** the `commission > 0` filter and the hide-when-empty render. **jk removed
the demo fallback** (`DEMO_RECEIPTS` is gone), so the list is always real — which is why the heading is
now unconditionally **"DRINK & TIP RECORDS"** rather than switching on `receiptsAreReal`. My
`receiptsAreReal` / `formatReceiptDay` / demo-fallback code did NOT survive; do not look for it.

**Why:** two working fixes can both compile and both read live data while one still lies. No conflict
marker shows that — git flagged the overlap, not the misstatement.

**How to apply:** the durable rule these four bugs share —
**when a display field has no column behind it, the failure mode is not a blank, it is a
plausible-looking value invented to fill the space.** A row id becomes a receipt number
(`eae3099`); a missing payment state becomes "Paid" ([[subscription-record-not-invoice]]); an absent
position becomes a live location; absent lines become four drinks. **When a UI field looks
authoritative, find its column before believing it.**

Also from this merge: **`pnpm install` is required** — jk added `pdfkit` + `exceljs`, and the backend
does not typecheck without them. Post-merge baselines: backend 0, mobile 0, web 121 (unchanged).
Journal auto-merged clean, 72 entries / 72 `.sql`, `0071` above the watermark — see
[[migration-journal-corrupt]].

**Everything jk merged in is unaudited** — export routes (PDF/Excel + ticket), signature pad,
weekly-payout runner, `0071`. Gates on the export routes are the first thing to check; see
[[ungated-router-sweep]]. Full state in [[current-state-and-audit]].
