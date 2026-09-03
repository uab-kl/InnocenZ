---
name: wage-is-flat-cutloss-unbuilt
description: "Wages are now PRO-RATED by minutes worked (0097, shipped 6 Aug) — the flat seal that overpaid an early check-out is fixed; penalty + cut-loss remain unbuilt"
metadata: 
  node_type: memory
  type: project
  modified: 2026-08-06T06:19:14.347Z
  originSessionId: 1c412050-e917-4906-a713-b274754d453f
---

**6 Aug 2026 — the wage half is BUILT. The penalty half was deliberately skipped** (owner:
"do the wage fix but ignore the penalty thing").

## What shipped — migration 0097

`payAmount` used to seal FLAT at the tier rate and never once read `checkInAt`/`checkOutAt`,
so a PR who left three hours early was paid in full **on the ordinary check-out path**, no
feature involved. Now `checkOutMine` seals what the shift EARNED:

`day rate × minutes worked ÷ minutes scheduled`, by the minute, capped at the day rate,
with a **5-minute grace on the TOTAL shortfall** (not per end — 3 late + 3 early = 6 short).

- **`apps/backend/src/features/shift-assignment/wage.ts`** — pure `earnedWage()`, 5 rules:
  `full_day | grace | pro_rata | no_schedule | never_present`. `wage.test.ts`, 20 cases.
- **0097 columns** on `shift_assignment`: `day_rate_amount`, `worked_minutes`,
  `scheduled_minutes`, `pay_rule`. All nullable, **no backfill** — NULL means "sealed before
  the rule". Applied to the shared DB.
- A late arrival costs exactly what an early departure costs — one rule, "hours you were
  actually on the shift". Time outside the window is never wages.

## Three traps that would have broken it silently

1. 🔴 **The divisor is the SHIFT WINDOW, not `STANDARD_SHIFT_HOURS` (6).** An 8-hour booking
   divided by 6 bills a full shift at 133%, and a PR leaving after 6 of 8 hours would still
   collect the full day. The window is already where the clamp stops and where OT begins.
## Overtime divides by the same window (6 Aug, owner-approved)

`overtimeAmountCents` divided by the flat `STANDARD_SHIFT_HOURS = 6`; it now divides by
`scheduled_minutes`, falling back to 6 when null. **This is not a rounding difference — it
inverts on short shifts.** At RM700: a 2h booking makes an ordinary hour RM350 while `700/6 ×
1.5` priced overtime at RM175, i.e. **an overtime hour paid HALF an ordinary one**; at 4h the
premium silently vanished to 1.0×; only at exactly 6h did the intended 1.5× hold. Invisible
until pro-rata gave the day rate a divisor to disagree with. Emhub's shifts run 1h/2h/4h/6h, so
this was live.

🔴 **`maxOvertimeCents` now prefers the FROZEN `overtime_amount`** and only derives when the
decision stored none. Without that, changing the divisor restates every past approval on a
non-6h shift and it reads as money nothing justifies. The model comment always demanded this;
nothing enforced it. Unit-tested; **not live-exercised** — no live row has both an approved
claim and a 0097 window. Consumers updated: `overtime-line.ts`, both controller call sites,
the pending-OT projection, the generator's audit sources, `audit-live-vouchers.ts`, and mobile
`pr-rate.ts` (+`CheckInScreen`) so the phone cannot quote a rate the agency will not approve.

2. 🔴 **`payAmount` IS overwritten — so overtime needed a new basis.** `day_rate_amount` holds
   the full rate and `overtimeBasisAmount()` (payment-voucher-audit.ts) is the ONE place that
   choice is made. Pro-rata and OT are not mutually exclusive: **a PR who arrives late AND
   stays late fires both**, and pricing OT off the reduced `payAmount` would cut their OT rate
   by exactly the minutes they were short at the start. Nobody would think to test that shift.
3. 🔴 **The window was being built in the SERVER's timezone.** `scheduledShiftEnd` used
   `new Date(y,m,d,hh,mm)`. On a UTC host a 20:00–02:00 KL shift lands 8h late and every stamp
   falls outside its own window — a fully-worked shift would seal **RM0.00** and look
   deliberate. Now `shiftWindowInstants()` in `util/slot-window.ts`, KL fixed offset (+8, no
   DST). This also fixes the forgot-to-check-out clamp, which shared the fault.

The controller's private slot parser was folded into `slotMinutes` (embedded HH:MM regex still
runs FIRST and unchanged; the lenient "8pm - 2am" pass is only a fallback) — additive, so every
slot that parsed before parses identically.

## The phone displayed the RATE CARD, not the sealed amount — fixed 6 Aug

Five sites in `CheckInScreen.tsx` read `Number(active.rate?.wagePerHour) || Number(active.payAmount)`.
That `||` was harmless while the two were the same number **by definition**; pro-rata made them
diverge and the app showed **RM700 for a shift the voucher pays RM385**. One display-only local,
`shiftWagesRm`, now serves all of them. **Live-proven: "Final payout RM 385.00 · 2h 12m".**

🔴 **`||` is the WRONG operator here.** A sealed **0.00 is a real answer** (`never_present`), and
an `||` chain silently restores the full day rate on exactly the shift that earned nothing. Test
`payRule != null` — the seal — explicitly. Same trap in the check-out handler's `wagesRm`.
🔴 **Never recompute pro-rata on the phone.** Render what the server sealed, or release-early and
every later rule needs a second implementation that can drift from the money.
⚠️ **`AgencySchedulePanel.tsx:86` is NOT a display site — do not "fix" it.** It is `cancelPenalty()`,
a % of the DAILY WAGE. A cancellation precedes the shift, so nothing is earned; pointing it at a
pro-rated `payAmount` would break it. I listed it as a display site once and was wrong.

## Verify with (both read-only)

- `npx tsx --tsconfig tsconfig.json src/scripts/probe-pro-rata-wages.ts --since=2026-07-01`
  — replays the LIVE stamps through the real `earnedWage`, printing stamps + window in **venue
  clock** so a zero can be told apart from a timezone fault. On 6 Aug: **7 of 8 live rows would
  have been reduced, RM3,886.94** — but these are demo click-throughs, not real payroll, and
  four of them stamped entirely outside their own window (correctly → RM0.00).
- `check-wage-vs-ratecard.ts` — **was hard-erroring**: it still joined `main.pr`, dropped in
  0095, so it was reporting nothing rather than passing. Repaired to `user`+`user_profile`+
  `agency_pr`, tier map widened to 7, and taught pro-rata — it now checks **card vs
  `day_rate_amount`**, then the pro-rata arithmetic against the row's own minutes. 8/8 agree.

⚠️ **Demo click-throughs now seal RM0.00** where they used to seal a full day. Correct, but
surprising — stamping check-in/check-out at arbitrary times no longer pays.
⚠️ `f5a1f227` sits in the DB checked out **five days late, unclamped**. Either it predates the
clamp or the clamp never fired — not established, do not assert either.

## Still NOT built (deliberately)

- **Penalty of any kind.** Blocked on the owner's data, not on code: amounts are undefined for
  every venue except Velvet 23, and late/no-show/cancel are stored but never enforced.
  Released-early and left-early produce an identical stamp, so the **reason code must be
  captured at stamp time** — it cannot be inferred later.
## Cut-loss — BUILT on the backend, 6 Aug (migration 0098)

Outlet raises → agency decides → **approval is the only thing that releases anyone**. Three
kinds (`release_prs` / `cut_slots` / `best_effort`), `POST|GET /cutlost`,
`POST /cutlost/:id/decision`. Owner's call: a released PR is paid **pro-rata**, so release is
purely a reason code and there is no second money rule.

🔴 **`seal-checkout.ts` is the reason this was safe.** The clamp + overtime + wage were inline
in `checkOutMine`; they are now one shared `sealCheckOut()` that BOTH the PR's own check-out and
the release call. `resolveTierWages` was extracted for the same reason. Written twice they drift
— that was the warning this whole feature carried, and extracting first is what honoured it.
- Releasing a PR with **no check-in → `cancelled`, not a 0.00 `completed`** row. They never
  started; a completed row sealing nothing would claim they worked and earned nothing.
- **Overlap guard now skips closed rows** (`completed` + any `checkOutAt`) — without it the
  released row's original window blocks the re-assignment the release exists to enable.
- `released_by` / `release_reason` on `shift_assignment`: a released stamp is otherwise
  **indistinguishable** from one the PR tapped, and it has no geofence fix behind it.
- Decision is CLAIMED with a conditional UPDATE before any release runs — releasing is not
  idempotent, so losing that race must mean doing nothing.
- 3 new `notification_kind` enum values (DDL, not data). `ALTER TYPE ADD VALUE` works inside
  drizzle's transaction **only if the value is not used in the same migration**.

**Live-proven 6 Aug:** 09:00–15:00 shift, check-in 09:00, released 13:07:46 → **4h08m of 6h00m
= RM482.22** (700 × 248/360). Gate matrix 6/6: outlet approving its own ask **403**, agency
raising **403**, PR listing **403**, re-approve **409**, both lists 200.

**Web UI WIRED** (same day): `services/cutlost/index.ts`, `hooks/use-cutlost-requests.ts`,
`toPendingCutlostRequest()` in `outlet-cutlost-requests.ts`, plus `OutletCutLossActions.tsx`
(raise) and `routes/agency/pending.tsx` (approve/reject). Gated on `backed` — a real session
hits the API, demo logins keep the Zustand store — the same split `useOutletShiftActions` and
the signups list already use. Mapping to the store's shape keeps ONE rendering path.
🔴 The endpoint accepts **`prIds`** (user ids) as well as assignment ids, because the UI holds
PR ids; the server resolves them against the shift's own roster, which doubles as the scope
proof. Safe only because `shift_assignment_shift_pr_unique` makes PR+shift exactly one row.
⚠️ Migration renumbered **0098 → 0101** (leaving 0098-0100 for another branch) AFTER it had been
applied. Safe only because every statement is `IF NOT EXISTS`; drizzle re-ran it as a no-op and
the stale 0098 row in `__drizzle_migrations` is harmless.

🔴 **`shift.filled` IS NOT MAINTAINED — it reads 0 on shifts that demonstrably have staff.**
Found because the slot-cut floor I wrote used it, so that guard would have quietly never fired.
It now counts live assignment rows. Proven: cutting 2 of 2 with 1 PR on the shift leaves
`quantity=1`, not 0. **Do not trust `filled` for anything.**
⚠️ Penalty still unbuilt, deliberately — amounts undefined for every venue but Velvet 23.

See [[agency-read-paths-ungated]] for the P0 that outranks all of this, and
[[line-rewrite-drops-columns]] before adding any `payment_voucher_line` column.
