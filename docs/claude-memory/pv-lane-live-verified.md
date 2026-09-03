---
name: pv-lane-live-verified
description: "3 Aug 2026 — the PV lane is rendered and arithmetically proven live; HEAD 37bab63, 4 unpushed. Carries the rate-card gap the audit cannot see, and three mistakes I made reading evidence."
metadata: 
  node_type: memory
  type: project
  originSessionId: 56b306ba-5ec5-4712-ad8b-6cdb00d723e5
  modified: 2026-08-03T01:18:53.064Z
---

# PV: rendered live, arithmetic proven, ONE item left

**3 Aug 2026. HEAD `37bab63` on `SL`, tree clean, 4 unpushed — nothing is pushed and that is the
OWNER'S call.** Supersedes [[current-state-and-audit]] on HEAD and on the PV items below; that file
is still right about everything else. `pnpm install` first. Backend FIRST or portals bounce
([[web-auth-tokens-not-persisted]]).

## What is now TRUE (all browser- or machine-verified, not compiled)

- **`/agency/pv` renders on a REAL agency login** (`owner@atlas-agency.my` / `Password123!`). Real
  rows, both panels mount, **zero console errors**. First time ever seen in a browser.
- **The admin PV page renders** — `/en/admin/service/payment-voucher`, admin `innocenz@gmail.com`
  (password is `DEFAULT_ADMIN_PASSWORD` in the ROOT `.env`; do NOT type it — a script that mints a
  token from env was blocked by the permission classifier, so **have the USER log in**).
  Detail sheet showed **`ReceiptEvidence (2)`** (`RCP-000005`, `RCP-000007`) and
  **`VoucherDisputes (1)`** (Drinks, resolved·accepted, RM 3.30) — **populated, not empty states**.
- **Disputes + Overtime are now SUB-TABS** on `/agency/pv` (`37bab63`), at the owner's request:
  `Payment Vouchers (2) · Receipts (0) · Disputes (0) · Overtime (0)`. **Counts ride on the labels**
  — an undecided OT claim is *why* a week refuses to send, so a countless click would hide a blocker.
  Deliberately **NOT week-scoped** (a claim blocks its own week, not the selected one).
- **`pv_day_review_pending` is mapped at last** (`9ca1a77`). See the lesson below.

## 🔴 The audit does NOT check the wage — new script does

**`audit-live-vouchers.ts` saying "3/3 reconcile" does NOT mean the wages are right.**
`wages_amount_mismatch` compares a line to **`shift_assignment.pay_amount` — what check-out SEALED** —
and never to the outlet rate card. **A wrong rate card yields a voucher that reconciles perfectly and
still pays the wrong money.** The green is *voucher ↔ assignment*, one link short.

New read-only **`apps/backend/src/scripts/check-wage-vs-ratecard.ts`** closes it:
**agree 4 · disagree 0 · no-card 0.** Chain rate card → sealed pay → voucher line is now proven.
Re-run after ANY rate-card or tier change. Extends [[green-signals-that-lie]].

**Column facts it cost three failed runs to learn** (the usual tax, cf. [[write-never-landed-check-first]]):
- table is **`outlet_tier_rate`**, NOT `tier_rate`; per-shift override is **`shift_pay_tier`** and WINS
- **`shift_date` lives on `shift`**, not `shift_assignment`
- **`pr.tier` is the enum `tier_3`; the rate card's `tier` is the LABEL `"Tier III"`** — they never
  join raw. The app bridges via `PR_TIER_TO_OUTLET_LABEL` in `shift-assignment.controller.ts`.

## 🔴 Three mistakes I made reading evidence — all the same shape

1. **I nearly filed a false P0 on the admin PV page.** First DOM read showed an EMPTY voucher table
   while the API had returned `totalCount: 3`. I had read it **before React Query resolved**.
   Re-read → all 3 rows, parse was correct, **no bug.** ⚠️ **A screen read too early looks exactly
   like a screen that is broken. Wait for the query, then judge.**
2. **I reported "~19 files of unauthored biome churn". It was 3.** The other **16 were CRLF/LF
   line-ending noise** — working copies LF, index CRLF, which git reports as modified with no content
   difference. `git stash` + `pop` resolved 16 of 19. I had sampled **one** diff and generalised.
   ⚠️ **Count before characterising.** Every `warning: LF will be replaced by CRLF` was saying so and
   I read them as spam.
3. **A fallback can hide the very bug it was added for.** `pv_day_review_pending` (migration 0073,
   from `weekly-payout.job.ts`) was never in the web's hand-written `NotificationKind` union. jk's
   `unknown` fallback stopped the crash, so it rendered a bland **"Update"** row whose `hrefFor`
   returned `undefined` — **a notification saying "Approve each day on Payroll & PV" went NOWHERE
   when tapped.** ⚠️ **The fallback converted a loud failure into a silent one**, which is why it
   survived a merge and two sessions. A fallback needs a way to SAY it fired. See
   [[notification-producers]].

## The ONE thing left in the PV lane

**Fire the 400 (bad line date) and 409 (closed week) refusals FROM THE PR APP.** Unit-proven only;
the overtime refusals *were* fired live but these two never were. **A refusal writes nothing, so it
is free** ([[prove-guards-live-without-writing]]). PR app: `mobile-web` launch config, port 8081,
PR password is `password` ([[mobile-app-runs-on-web]]).

⚠️ **Servers orphan themselves.** Backend/web/Metro started early in a session drop out of
`preview_list` and later get cleaned up or collide on ports. The backend DIED mid-session and the PR
app reported it plainly ("Cannot reach the backend at :7777") where the web portals would have
silently bounced to `/login`. **Port 8081 genuinely needs to be 8081** (Metro convention); port 3000
does not.
