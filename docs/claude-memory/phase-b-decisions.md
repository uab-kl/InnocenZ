---
name: phase-b-decisions
description: "Phase B is CLOSED — the three decisions and their evidence: dispute table wins, admin_mfa/platform_standards are jk's, commission_config dropped"
metadata: 
  node_type: memory
  type: project
  originSessionId: 989c3550-d0c3-4dc7-81a9-b6eec4955c1f
  modified: 2026-07-29T01:17:03.277Z
---

Decided 29 Jul 2026. Phase B of [[role-split-and-build-order]] is closed.

## Phase E is HALF BUILT — resume here (29 Jul 2026)
**Done and live-verified:**
- **Weekly payout job** (`b8e06bd`) — `scheduler/weekly-payout.job.ts`, Mondays 02:00
  Asia/Kuala_Lumpur, the first real consumer of the Phase C scheduler. Ran manually against Atlas:
  window `2026-07-20..26`, **0 created / 1 skipped (already_exists)** — idempotency proven.
  ⚠️ Running the script standalone needs the env loaded (`set -a; . ../../.env; set +a`) or it
  fails with `(unset):5432/(unset)`; the app reads discrete `POSTGRES_*`, not `DATABASE_URL`.
- **Dispute rewrite + agency resolve queue** — see [[pv-dispute-design]], fully E2E-verified
  including through the browser UI.
- The **week-boundary trap**: the payout fires Mon 02:00 KL = **Sun 18:00 UTC**, so UTC date maths
  rolls back a week too far. `payment-voucher-week.ts` owns `previousCompleteWeek()`; the manual
  script imports the same helper so they cannot drift.

**Still open in Phase E:** the **PR sign endpoint**, and the **payout Σ=0 check**.

**Handoffs waiting on jk (all Admin lane):** the `/auth/register` role-escalation hole (still
unfixed, anonymous callers can mint an admin); `commission_config` was DROPPED from the shared DB;
`platform_config` is broken in live — see [[green-signals-that-lie]].

## Phase C foundation is SHIPPED (`72fc61f`) — jobs.ts is deliberately empty
Phase C had no owner; SL took it. Both halves built, **migration 0062 NOT applied**:
- `features/notification/` — table (recipient by `user` FK, `payload` jsonb, closed `kind` enum),
  repository, and **`notify()` / `notifyMany()`** as the single entry point. **Never throws** — a
  notification must not be able to fail the voucher/dispute write it hangs off. Takes an optional
  `tx` so a rolled-back parent cannot leave a notification behind. **IN-APP ONLY** — there is still
  no mailer and no WhatsApp sender; a real transport later reads this table, changing no caller.
- `scheduler/scheduler.ts` — node-cron wrapper pinned to **Asia/Kuala_Lumpur**, with a self-overlap
  guard and a swallow-throws guard (an unhandled rejection in a tick would kill the API process).
- `scheduler/jobs.ts` — the only place jobs are named, **currently empty on purpose**. The first
  real job is the Phase E weekly payout sweep. Add jobs there, not by import side effect.

This unblocks the payout job, the PR referral "notify the PR" step, and OT approval.

## 1. `payment_voucher_dispute` wins — adopt the table
The framing "which of two tables wins" was wrong. What the code actually does:
`raiseMyDispute` (`payment-voucher.controller.ts:730`) calls
`paymentVoucherRepository.update(voucherId, {...})` — it flips a flag on the **voucher**, and
**never writes `payment_voucher_dispute`**. The table (migration 0051) has enums, types and a live
row shape, and **zero writers**.

A voucher-level flag structurally cannot express the model in [[pv-dispute-design]]: one dispute
per day **per component** with mandatory proof. So `raiseMyDispute` must be rewritten to insert
dispute rows, and the agency resolve UI reads those rows. Note the trap from that memory: never FK
a dispute to a voucher **line** (lines are wiped and re-inserted on update) — reference the day +
component, and `receipt_no` still does not exist.

## 2. `admin_mfa` + `platform_standards` are jk's — do not touch
Both have **zero** references in the whole repo; they exist only as live tables. `admin_mfa` matches
the MFA item on jk's Phase H list, so they are almost certainly his in-flight work on another
branch. **Confirm with jk before touching or dropping.** Not SL's lane.

## 3. `commission_config` — DROPPED
Verified unused before dropping, which was the user's condition: zero frontend callers, zero mobile
callers, and no backend logic reads it. Commission math does not come from it — it comes from the
workspace tier rates and `pr-rate.ts`. Consistent with [[drinks-services-split]]: commission % is
common, not per-item, so the config screen was never going to be built.
