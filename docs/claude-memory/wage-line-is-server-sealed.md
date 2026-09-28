---
name: wage-line-is-server-sealed
description: "Since 28 Sep 2026 the SERVER writes the wages line (check-out, cut-loss release, Sunday net) on the SHIFT's date and week — the phone no longer sends it; a paid voucher needs BOTH signatures; a signed voucher is locked"
metadata:
  node_type: memory
  type: project
  originSessionId: 9b91b63a-a374-4bab-8706-1adf2e265fbb
  modified: 2026-09-28T07:49:07.543Z
---

**Wage line (fixed 28 Sep 2026).** The phone's second call after check-out (`POST
/payment-voucher/mine/lines`, kind wages, `lineDate: todayKey`) was the ONLY writer of the wages
line. It lost the night's pay on any dropped connection, on a cut-loss release (the PR never checks
out), and on EVERY check-out after midnight — the line was dated "today" while the shift is dated
yesterday, and `assertLinesAgreeWithShifts` refuses that. Now `features/payment-voucher/wage-line.ts`
`sealWageLine()` writes it from `checkOutMine`, from cut-loss `applyApproval`, and from the Sunday
generator (`fillMissingWages`, open drafts only) — shift's own date + `weekOfDate(shiftDate)`,
once-only under a row lock (`addLineOnce`), voiding a finance signature it would falsify. The
phone (CheckInScreen) now just refreshes the week.

**Voucher rules (payment-voucher-lock.ts, unit-tested):** a signed/paid voucher's figures are
LOCKED (only status/bankRef/disputeNote pass); the Override (`signed|paid → pending_review`, reason
required) is the only way back and clears BOTH signatures; recording payment needs the agency's
finance signature too (PV-000002 and PV-000006 were paid without it — history, left as is);
signed/paid vouchers cannot be deleted; a voucher that left review unsigned may take a late
finance signature (never over an existing one, never once paid); payout runs only list and
settle dual-signed vouchers. Check-out also refuses (409) while a logged drink/tip has no picture
(`checkout-proof.ts`, never stricter than the phone).

**What the fix does NOT do (found 28 Sep afternoon):** repair past weeks. A read-only sweep found
7 completed shifts with a sealed wage > 0 that no wage line names — RM 3,335.55, all one PR at
Atlas, under PV-000006 (paid by a click-test) and PV-000009 (signed); the agency must correct them
(TEST_SCRIPT §9). And a ZERO seal (`never_present`) is now skipped, where the phone used to file a
visible RM 0.00 line — an open decision, also §9. To find unfiled wages, match a line's assignment
in BOTH ref shapes: packed `wages|checkin|amt|<id>|` and the generator's bare `<id>` +
`component = 'wages'`.

**How to apply:** never reintroduce a client-written wage line; never let a line/amount write
skip the lock. Related: [[innocenz-pv-pipeline]], [[line-rewrite-drops-columns]].
