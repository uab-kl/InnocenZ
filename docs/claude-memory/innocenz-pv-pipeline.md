---
name: innocenz-pv-pipeline
description: "Weekly payment-voucher pipeline — lifecycle, issue job, PR sign with drawn ink, and the one-bundle Excel/PDF/print export system with phone-safe ticket links"
metadata:
  node_type: memory
  type: project
  originSessionId: 4aa4a5ea-6778-4671-add3-d3da9d125db4
  modified: 2026-07-30T07:08:12.365Z
---

The PV money pipeline (built 2026-07-29/30, branch `jk`) is REAL end-to-end. One week (Mon–Sun) = one PV per PR.

**Lifecycle** (`payment_voucher.status`): `pending_review` (live draft the PR's scans/wages write into) → `sent` (issued at week close) → `signed` (PR signs, server-first) → `paid`. `disputed` sits beside sent. Rule: success UI only after the server-confirmed commit.

**Week close / issue:** `apps/backend/src/scheduler/weekly-payout.job.ts` — after generation, an issue pass runs `listForWeek(weekStart, ['pending_review'])`, `checkVoucherBalance` each; balanced → `status='sent'` + `issuedDate` (KL date), unbalanced held + logged; then notifies PRs (prId null-guarded). Manual trigger: `pnpm tsx --tsconfig tsconfig.json src/scripts/run-weekly-payout.ts` from apps/backend.

**Export system — ONE data bundle, three renderers (they must never diverge):**
- Repo `getExportBundle(voucherId)` → `{voucher(+lines), agency:{name,ssmNo,contactPhone,contactEmail}, pr:{name,nickname,icNo,phone}}` via FK leftJoins (Rule 3 — no copied names).
- `payment-voucher-excel.ts` — `buildVoucherWorkbook` reproduces the prototype workbook cell-for-cell (PV-2026-W20-L example); `buildVoucherPrintHtml` (print view w/ Download-PDF + Print buttons); shared helpers `KIND_LABELS` (wages→'Daily Wages', drinks→'Commission – Drinks', tips→'Commission – Tips', others→'Others'), `DASH`, `dayMonth`, `slashDate`, `klStamp`, `voucherRef` (PV-YYYYMMDD from weekEnd), `pvLogoPath`.
- `payment-voucher-pdf.ts` — pdfkit BOXED voucher form (letterhead, payable-to grid, shaded line table, payment-details + tall Total, signature block). Column edges XA=40/XB=+83/XC=+191/XD=+64/XE=+89 (scaled from Excel widths 13/30/10/14/14), ROW_H 16, fill #ececec, border #777. GOTCHA: pdfkit wraps whenever `width` is set (lineBreak:false does NOT stop it) — single-line cells auto-shrink font until text fits.
- Logo: `apps/backend/public/img/agencies/atmosphere-logo.png` (copy of apps/web asset) — Excel A1:A6 gutter `addImage`, PDF `doc.image(..., {fit:[72,72]})`. User rule: this logo appears ONLY on the PV exports, nowhere else.

**Phone-safe links (ticket pattern — session tokens must NEVER be in URLs):** authenticated `POST /payment-voucher/mine/:voucherId/export-ticket` mints a 128-bit voucher-scoped ticket (in-memory Map, 5-min TTL, NON-consuming — Android browsers probe-request). Public routes `GET /payment-voucher/export/:ticket/voucher.xlsx | voucher.pdf | print` are mounted in `router/v1.ts` BEFORE `authenticateJWT`. PR-scoped authed twins: `/mine/:voucherId/export.xlsx` + `/export.pdf`. Mobile `PaymentHistoryPanel`: native = ticket URL via `Linking.openURL` (direct download/open); web = authenticated blob → objectURL. PDF button shows for every voucher (not paid-only).

**Drawn signature (commits 3c9f32d + 37056fb):** `payment_voucher.pr_signature` text column (migration `0071_pv_pr_signature.sql`, applied). Mobile `components/SignaturePad.tsx` (PanResponder + react-native-svg — already in the APK, no rebuild) emits vector ink `{w,h,strokes:[[[x,y],…],…]}` (~2px thinning). PvDetail sign sheet REQUIRES ink before Confirm; `signMyVoucher` posts `{signature}`; controller validates with `PrSignVoucherSchema` (400 on malformed — never silently dropped) and stores the JSON. PDF re-draws strokes as small fitted ink (110×26 box, #22345f, round joins); signed-without-ink falls back to Times-Italic name; unsigned prints blank.

**PvDetailScreen is fully backend-wired:** grid from `buildWeekGridFromLines` (shared `lib/week-pay-grid.ts`) over the real voucher (`/mine/last-week` or `/mine/history`), linked receipts from real drink/tip lines, `isSealed` = signed, dispute + sign sheets use `useKeyboardInset`.

**Open queue:** (1) agency Payroll RECEIPT SCANS panel → wire to `GET /payment-voucher/receipts`, approve/edit price+qty, untouched APPROVED → VERIFIED at week close; (2) DB lacks agency address, PR code, PR bank name/account — exports print "—"; add columns + profile UI when asked; (3) DECISION PENDING: Vicky's duplicate current-week voucher `34364790-…` (agency owner manually set it `sent` mid-week) breaks one-week-one-PV at next close — merge/delete + block early agency sends; NOT deleted, awaiting user. Related: [[pr-mobile-backend-wiring]], [[innocenz-database-rules]].
