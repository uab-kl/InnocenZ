---
name: innocenz-payee-name-format
description: "InnocenZ naming rule — a PR is always shown as \"(Nickname) Legal Name\", e.g. \"(Vicky) Victoria Tan Mei Lin\"; brackets round the nickname, nickname first"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2518481e-d8d4-4ce6-87bc-8a3e7c965b3a
  modified: 2026-08-06T02:20:43.743Z
---

Owner's standing rule, 5 Aug 2026: *"this pr nickname is vicky right, remember always in front her
real name need put (Vicky) Victoria Tan Mei Lin"*.

**The exact format: `(Vicky) Victoria Tan Mei Lin`.** Brackets round the NICKNAME, nickname FIRST,
legal name after it, unbracketed.

**Why both halves.** The floor, the roster and the PR herself use "Vicky"; the IC, the bank transfer
and the payment voucher are all in the legal name. A screen showing only one of them forces the
agency to hold that mapping in their head while reconciling money.

**I got this backwards once** — read the first instruction as "nickname in front, legal name in
brackets" and shipped `Vicky (Victoria Tan Mei Lin)`. If in doubt, the brackets belong to the
nickname.

**How to apply:**
- Use `formatPayeeLabel(nickname, legalName)` from
  `apps/web/src/agency-portal/lib/agency-payroll.ts`. ONE formatter — the voucher card and the
  dispute row each formatted their own and drifted, which is why the nickname appeared on one screen
  and not the other.
- The nickname is read through the `pr_id` FK (`pr.nickname`), never copied onto the voucher beside
  `pr_name` — see [[innocenz-database-rules]] rule 3.
- No nickname, or one that merely repeats the legal name, prints the legal name alone.
- Applies everywhere a payee is named: PV cards, dispute rows, receipts, exports, the PDF.

Related: [[innocenz-confirm-every-action]] · [[innocenz-database-rules]]
