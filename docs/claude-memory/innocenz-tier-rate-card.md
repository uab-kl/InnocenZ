---
name: innocenz-tier-rate-card
description: "InnocenZ payroll rate model — 7 PR tiers, per-outlet default rate cards, per-shift overrides, and the outlet/agency/PR role boundaries (from outlet-portal screenshots)"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 970919ee-d228-4f90-bf54-11e10bc3aa06
  modified: 2026-07-22T02:54:27.713Z
---

InnocenZ pay is driven by a **per-tier rate card**. Every OUTLET has its own default card (rates differ per outlet); when the outlet POSTS a shift it can override the card for that shift. See [[pr-mobile-backend-wiring]].

**7 PR tiers** (the DB `pr_tier` enum currently only has tier_1/2/3 — needs expanding): Tier 1, 2, 3, 4, 5, **Servant**, **Commission only**.

**Rate card fields per tier:** Daily wage (base), RM/HR, Target sales (optional, per shift), HH-drinks % (happy-hour), NH-drinks % (normal-hour), Tips %, OT/HR.

**Velvet 23 default card (the example shown):**
| Tier | Daily | RM/HR | HH Drinks % | NH Drinks % | Tips % | OT/HR |
|---|---|---|---|---|---|---|
| Tier 1 | 500 | 83.33 | 5 | 10 | 15 | 125 |
| Tier 2 | 600 | 100 | 6 | 11 | 16 | 150 |
| Tier 3 | 700 | 116.67 | 7 | 12 | 17 | 175 |
| Tier 4 | 825 | 137.5 | 8 | 13 | 18 | 206.25 |
| Tier 5 | 1000 | 166.67 | 9 | 14 | 19 | 250 |
| Servant | 200 | 33.33 | 3 | 8 | 12 | 50 |
| Commission only | 0 (no base) | — | 75 | 80 | 85 | — |

**Derived identities (hold across all rows):** RM/HR = Daily ÷ 6 (a standard shift = 6h); OT/HR = RM/HR × 1.5 (matches "beyond 6h × 1.5"). Commission-only has no base and no OT, just high commission %. The simplified "shift-post" screen shows one Drinks % = the **NH** column; HH is a separate lower happy-hour rate.

**Role boundaries (important):**
- **Outlet** — owns its default rate card; POSTS shifts and may override rates per shift; can ONLY see who is working its shift. Does NOT assign PRs.
- **Agency** — ASSIGNS the shift to PRs.
- **PR (mobile)** — earns per the shift's rate card for the PR's own tier: base daily wage + drink commission (HH/NH %) + tips % + OT (hrs beyond 6 × OT/HR).

**ALREADY MODELLED in the backend — REUSE, do NOT build new (`outlet-workspace` feature):**
- `outlet_workspace` (1:1 per outlet, `outlet_id` unique): `base_pay_per_hour`, `drink_pct`, `tip_pct`, `table_pct`, `ot_after_hours`, `per_drink_rm`, `per_table_rm`, **`happy_hour_start` / `happy_hour_end`** (the HH time window), `happy_hour_drink_discount_pct`.
- `outlet_tier_rate` (FK `workspace_id`, one row per tier): `kind` (`tier`|`commission_only`), `tier` (varchar — holds all 7 labels), `wage_per_hour`, **`drink_pct`** (NH), **`happy_hour_drink_pct`** (HH), `tip_pct`, `table_pct`, `ot_after_hours`, **`target_sales_rm`**, `sort_order`.
- `outlet_drink_menu` (FK `workspace_id`): real per-outlet drinks (`slug`, `name`, `price_rm`) → replaces mobile's hardcoded `lib/outlet-drink-menu.ts`.
- `outlet_penalty_rule` (attendance/discipline fines).

**Progress (2026-07-21):** (1) DONE — `pr_tier` enum expanded to all 7 (`tier_1..tier_5`, `servant`, `commission_only`) in `pr.model.ts` + migration `0038_pr_tier_7_tiers.sql`. (1b) DONE — `GET /shift-assignment/mine` resolves the PR's-tier rate per outlet via `resolveTierRatesForOutlets` (FK join to `outlet_workspace`/`outlet_tier_rate`; `pr.tier`→label map `tier_1→'Tier I'`…`servant→'Servant'`, `commission_only`→kind row). (2) DONE — per-shift rate OVERRIDE now modelled: new child table `shift_pay_tier` (migration `0039_shift_pay_tier.sql`; mirrors `outlet_tier_rate` + `pr_count`, reuses `outlet_tier_rate_kind` enum, FK `shift_id`→`shift`, all 4 audit cols). Write path: shift Zod `payTiers[]` → `ShiftControllerClass.create`/`update` strip it out of the shift insert and persist via `createWithPayTiers`/`updateWithPayTiers` (transactional delete+insert); `GET /shift/:id` reads them back via `listPayTiersForShift`. Read/resolve: `/shift-assignment/mine` calls `resolveShiftTierOverrides({shiftIds,tierLabel,commissionOnly})` and `mergeRate(ws, override)` — override wins field-by-field, HH window always from workspace, adds `overridden:boolean`. (3) DONE — Mobile consumption wired to real rates. Backend: `/shift-assignment/mine` now also folds `drinkMenu` per outlet (new `resolveDrinkMenusForOutlets` FK-joins `outlet_workspace`→`outlet_drink_menu`); each row carries `tier` + `rate` (merged ws/override, `overridden`) + `drinkMenu`. Mobile: `api.ts` `ShiftAssignmentRecord` gains `tier`/`rate`(`ShiftAssignmentRate`)/`drinkMenu`(`OutletDrinkItem[]`); new `lib/active-shift.tsx` `ActiveShiftProvider` (owns `/mine` fetch + active pick + phase, shared by CheckIn & Scan, mounted in App.tsx); new `lib/pr-rate.ts` (HH-aware `drinkCommissionPct`/`tipCommissionPct`/`commissionFor`, `isHappyHourNow` handles midnight-cross, `overtimePay` uses tier `otAfterHours` else payPerHour×1.5, `drinkMenuFromAssignment`; fallback drinks 15%/tips 10% ONLY when no rate card). ScanScreen now uses `active.outletName`/`active.drinkMenu`/`active.rate` (dropped demo `useShiftSession`+`outlet-drink-menu.ts`); CheckInScreen uses provider + real OT rate; ShiftStatusPanel renders real `targetSalesRm` progress bar. Both projects typecheck clean (only pre-existing TS2742 route-router + pr.repository portfolioPhotos baseline). **Requires user to run `pnpm migrate` (0038+0039) + restart backend, and outlets to have configured their Workspace rate card/drink menu for real rates to show (else clean fallback).** (4) DONE — Web Post Job composer now POSTs `payTiers`. `services/shift/index.ts`: new `ShiftPayTierInput` type + `payTiers?` on `CreateShiftInput` (so `createShift` POST body carries it; `UpdateShiftInput` inherits via Partial). `agency-portal/lib/backend-shift-map.ts`: `OutletShiftPostItem` gains `payTierRows?: PostJobPayTierRow[]`; new `shiftPayTiersFromRows` maps composer rows (prCount>0 only) → backend shape (`kind` tier|commission_only, `tier`=outlet label via `outletTierForPostJobPayTier`, `wagePerHour` null for commission-only, `drinkPct`/`tipPct`/`targetSalesRm`/`prCount`/`sortOrder`; `happyHourDrinkPct`+`otAfterHours` sent null → PR resolver falls back to workspace HH/OT since composer doesn't collect them); `createShiftInputFromPost` folds `payTiers` in when rows present. `routes/outlet/bookings.tsx` already passes `payTierRows` on postItems (line ~457) → now persisted. Web tsc clean for the 3 changed files (project has large pre-existing baseline of legacy /host route-param + unused-import errors). Requires migrations 0038+0039 applied. **Remaining:** outlet EDIT path (updateShift) doesn't build payTiers yet (create path only); `apps/mobile/src/lib/outlet-drink-menu.ts` is now fully dead (spawn_task chip filed to delete).

**LIVE DB STATE (innocenz-test @ 103.224.93.109:6543, checked 2026-07-22):** ALL `outlet_workspace`/`outlet_tier_rate`/`outlet_drink_menu` were EMPTY for every outlet (Velvet 23, Onyx KL, Mermate, Bear Lounge, Urban Soul) — so the PR app's rate resolver returned null everywhere (fell back 15%/10%) and every drink menu was empty. `shift` + `shift_assignment` rows exist but are ALL seed data (`created_by='seed-sample-shifts'`/`'seed-sample-shift-assignments'`). Today's Onyx KL shift (2026-07-22, Atlas Agency, Vicky=**Victoria Tan Mei Lin** pr.tier=`tier_3`, confirmed+checked-in) is real-but-seeded (user OK'd "acceptable for now"). **Seeded Onyx KL workspace 2026-07-22** from the Velvet-23 proto example (dummy, `created_by='dummy-velvet-23-example'`): 1 workspace (HH 21:00-23:00), 7 tier rates (Tier I-V/Servant/commission_only per the card above; only Tier V has target 2000), 7 drinks (Booking commission 100, Cosmo/Heradura/Ladies 150, Dom Perignon/Donjulio 200, Havoc 1000). **NO schema drift (verified):** `table_pct` (outlet_workspace+outlet_tier_rate) and `per_table_rm` (outlet_workspace) were intentionally DROPPED by migrations `0043_outlet_drop_table_pct` + `0044_outlet_drop_per_table_rm` ("tables don't generate sales"); `apps/backend/src` has ZERO references to them (model already matches DB). INSERTs must omit them. Journal runs to idx 44. Onyx has no outlet user account. DB conn in ROOT `.env` (POSTGRES_* vars), pg resolves at `<root>/node_modules/pg`.

**Mobile wiring path:** extend `/shift-assignment/mine` to resolve, per row, the PR's-tier rate at the shift's outlet (join `shift.outlet_id`→`outlet_workspace`→`outlet_tier_rate` on `pr.tier`), returning `{ wagePerHour, drinkPct(NH), happyHourDrinkPct(HH), tipPct, otAfterHours, targetSalesRm, happyHourStart, happyHourEnd }`. Then ScanScreen uses HH/NH by time window, tips %, real menu; ShiftStatusPanel restores the real target; OT uses the tier's rate.
