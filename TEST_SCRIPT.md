# InnocenZ — Daily Run-Through Test Script (4 Roles)

**Owners:** jk (PR-mobile + Admin oversight) · SL (Outlet + Agency web)
**Purpose:** One clean checklist to run **every day**. Test the **connected** workflows first — the ones where both of us have to be wired up before either can see a result.
**Source of truth:** This file (`TEST_SCRIPT.md`) is the single source of truth. Add a §10 Changelog row on every merge to `main`. A Google Doc copy is regenerated from this file on request (a fresh Doc each time — no in-place Drive edit).
**Last synced from code:** 2026-07-23 (branch `jk`)

---

## 0. The one rule for priority

> **Test the shared spine first. Solo screens later.**

A screen that only touches **one role** (e.g. PR → Admin profile view) is easy — one side owns it, so it's already mostly done.
A workflow that has to pass through **many roles** (Outlet → Agency → PR → Payroll → back to Agency) can only be proven when **all links are wired**. That's the hard part, and that's what we do first — because neither jk nor SL can "see the result" until the whole chain connects.

**Daily order:** ① run the cross-role spine (§3) end-to-end → ② run each role's solo checklist (§4) → ③ update Done/To-Do + log it (§7–§10).

---

## 1. Where each role lives

| Role | App | Entry | Owner |
|------|-----|-------|-------|
| **PR** | Mobile (`apps/mobile`) | tabs: Shifts · Check-In · Payment · History · Profile (+ Scan, PV Detail) | jk |
| **Outlet** | Web (`apps/web/routes/outlet`) | Dashboard · Workspace · Bookings · Ratings · History · Subscription · Special-Service | SL |
| **Agency** | Web (`apps/web/routes/agency`) | Dashboard · Roster · Pending · PRs · PV · History · Live · Outlets · Special-Service | SL |
| **Admin** | Web (`apps/web/routes/admin`) | Dashboard · User-Mgmt · RBAC · Service (PV/requests) · Business · Audit-Log | jk |

---

## 2. The connection map — who touches whom

```
        (1) POST JOB              (2) ASSIGN PR            (3) WORK + PROOF
 OUTLET ───────────────►  AGENCY ───────────────►  PR ───────────────► receipt/PV
   ▲   creates a shift    roster picks PR         check-in + pic          │
   │                          ▲                    scan / self-log        │
   │                          │                                           │
   │                    (6) VERIFY / APPROVE  ◄──── (5) this-week wages ───┘
   │                     payroll (PV page)          auto-synced from
   │                          │                     outlet rate card
   │                          ▼
   └──────────  (7) ADMIN sees everything after DB combined  ──────────► ADMIN
```

**Connection points (this is "where is our connect"):**

| # | Link | From → To | Status | Priority |
|---|------|-----------|--------|----------|
| A | Post Job → Shift row | Outlet → (DB) | ✅ done (SL) | — |
| B | Shift → Roster assign | Agency → PR | ⚠️ **next** (agency assigns PR) | 🔴 **P1** |
| C | Assigned shift shows in PR Shifts | (DB) → PR | ✅ done (jk) | — |
| D | Check-in + pic proof | PR → Agency/Admin receives pic | ⚠️ pic receive side | 🟠 P2 |
| E | Wages/tips/commission auto-sync | Outlet rate card → PR | ⚠️ **mobile wired** (needs `pnpm migrate` + backend restart to go live) | 🔴 **P1** |
| F | This-week dispute → verify | PR → Agency payroll | ⚠️ **PR side wired** (persists to `payment_voucher`; agency-verify UI = SL next) | 🔴 **P1** |
| G | History PV → sign PDF | PR ↔ (PV pdf) | ❌ pdf per PV | 🟠 P2 |
| H | Everything → Admin portal | all → Admin | ❌ after DB combined | 🟡 P3 |

> **The three 🔴 P1 links (B, E, F) are the spine.** jk + SL are both on them. Do these first — nothing downstream is provable until they connect.

---

## 3. PRIORITY TEST — the cross-role spine (run this FIRST, together)

Run top-to-bottom in one sitting. jk drives mobile, SL drives web. Each step must pass before the next.

| Step | Who | Action | Expected result | Pass? |
|------|-----|--------|-----------------|-------|
| S1 | Outlet (SL) | Post Job → set date, role, rate | Shift row created, staffing cap respected | ☐ |
| S2 | Agency (SL) | Roster → open that shift → **assign PR** | PR appears on shift via `agency_pr` join | ☐ |
| S3 | PR (jk) | Shifts tab → see the **future** assigned shift | Shift shows with outlet name + address | ☐ |
| S4 | PR (jk) | Check-In tab (on the day) → check in → **take pic proof** | Check-in recorded, pic uploaded | ☐ |
| S5 | Agency/Admin | Receive/see the **check-in pic** | Pic visible on their side | ☐ |
| S6 | PR (jk) | Scan / self-log a receipt | Receipt number generated; single non-repeat = OCR, repeat = self-log | ☐ |
| S7 | System | **Wages auto-sync** from outlet rate card for that shift | PR commission + tips + total computed correctly | ☐ |
| S8 | PR (jk) | Payment tab → this-week → see commission/total | Correct figures; **check privacy** (see note ↓) | ☐ |
| S9 | PR (jk) | Check out → shift moves to **History** → **raise dispute** (this week) | Shift in history; dispute flag set | ☐ |
| S10 | Agency (SL) | Payroll / PV page → this-week → **verify or reject** | Approve/reject reflects back; dispute resolved | ☐ |
| S11 | PR (jk) | History → last-week → **sign PV** → **view PDF** | PDF renders, signature captured | ☐ |
| S12 | Admin (jk) | Portal → confirm the whole chain is visible | All rows reconcile after DB combine | ☐ |

**🔒 Privacy check at S8:** Confirm the PR **cannot** see how much the **outlet** or **agency** earns — PR sees only their own commission/tips/total. Flag if the total exposes upstream margins.

---

## 4. Solo daily checklists (run after the spine)

### 4a. PR (mobile) — jk
- ☐ **Register / Login** works (fresh account + returning)
- ☐ **Shifts** — future shifts list; today's work visible; no *tomorrow* attendance leaking in
- ☐ **Cancel / MC-Leave (Today tab timetable)** — Cancel shows the penalty bracket `(−RM x)` + reason sheet (24h+ free / 2–24h −25% / <2h −50%); **MC / Leave** beside it files a **no-penalty** request → pill flips to *Leave pending*, buttons swap to an "awaiting agency review" note; a rejected request shows the red "still on this shift" note; **both sheets must open INSIDE the phone frame** (not over the browser page)
- ☐ **Check-In** — today only; outlet address shows; pic capture + crop as proof
- ☐ **Multi-shift day** — after check-out, if the agency assigns ANOTHER shift the same day: Check-In **renews to the new shift** (auto-refetch on opening Today/Check-In); Today section shows BOTH cards — new shift with *Check in* + finished shift as *EARLIER TODAY · COMPLETE* with **View summary** (opens the old check-out summary; amber banner taps back to the current shift); Payment stacks both shifts' wages/OT on the same day column (per-assignment lines, disputable); History shows a card per venue that day. **Cross-midnight check:** a night shift scheduled yesterday (e.g. 27 Jul 22:00–04:00) but checked out THIS morning must appear as today's completed card — completed shifts match on the check-out day, not `shift_date`
- ☐ **Scan** — OCR single-receipt / single-claim / single-PR; repeatable = self-log; **detail button** shows receipt number
- ☐ **Payment** — this-week wages, commission, tips, total; privacy respected
- ☐ **History** — today's checked-out shifts; per-PV PDF; sign last-week; dispute this-week
- ☐ **Profile** — nickname / propic / gallery editable (Admin can view)
- ☐ **Special Service** — visible to PR (✅ already confirmed)

### 4b. Outlet (web) — SL
- ☐ **Dashboard / Today** loads real data
- ☐ **Workspace** — drinks/service menu split, scoped by `outlet_id`, rate card editable
- ☐ **Post Job** — writes shift, "Confirm staffing" respects subscription caps
- ☐ **Bookings / Ratings / History** read real shift + venue-scoped PR data
- ☐ **Subscription / Billing / Settings / Special-Service**

### 4c. Agency (web) — SL
- ☐ **Dashboard / Today** — KPIs, outlet demand, history
- ☐ **Roster** — add shift / add PR / **assign / unassign** via `agency_pr`
- ☐ **MC / Leave requests** — Roster shows a *MC / Leave requests* panel when a PR files leave (PR · outlet · date · reason); **Approve · excuse shift** removes the PR from staffing with no penalty (`leave_approved`), **Reject** puts the PR back on the shift (mobile shows the rejection); cancelled rows still surface the PR's cancel reason
- ☐ **Backfill needed** — after a cancel or approved leave on an upcoming still-understaffed shift, Roster shows a *Backfill needed* card (outlet · date · staffed X/Y · who left · reason); **Pick replacement** lists ranked free PRs (same tier as the released PR first, then "worked here N×"); **Assign** fills the slot and the card disappears once the shift is back at quantity
- ☐ **Pending / Approval** flow
- ☐ **PRs (Manage PR)** list
- ☐ **PV (Payment Voucher)** — weekly wage auto-generated from PR shifts; **verify PR-linking is correct**
- ☐ **Payroll** — this-week receipts/scans → **approve / reject**
- ☐ **Subscription / Settings / Special-Service**

### 4d. Admin (web) — jk
- ☐ **Dashboard** loads
- ☐ **User Management** — admin / agency / outlet / legacy-member
- ☐ **RBAC** — role / permission / module / pending → **confirm role-gating blocks wrong roles** (⚠️ known concern: agency token reached admin screens — retest with a real sign-in)
- ☐ **Service** — payment-voucher, requests, plan-changes, /service/other (redesign pending)
- ☐ **Business** — history / plan / subscription
- ☐ **Audit-Log** per role
- ☐ **Special-Service** — receives PR self-log successfully (✅ confirmed)

---

## 5. What to build/wire FIRST (the spine queue)

Ordered by "connected + blocking" — do the 🔴 first because both sides need them before anyone sees a result.

1. 🔴 **B — Agency assigns PR in Roster** (§3 · S2). Nothing downstream works until a PR is on a shift.
2. 🔴 **E — Wage/tip/commission auto-sync** from outlet rate card → PR shift (S7). Unblocks Payment + Payroll.
3. 🔴 **F — This-week dispute (PR) ↔ verify (Agency payroll)** (S9–S10). Closes the money loop.
4. 🟠 **D — Check-in pic received on Agency/Admin side** (S5).
5. 🟠 **G — Per-PV PDF + sign** in History last-week (S11).
6. 🟡 **H — Admin portal** reconciliation after DB combined (S12).

---

## 6. Guardrails carried over (don't break these)

- **DB is immutable after check-in submit** — OCR only on a *new* assignment; once submitted, cannot revert.
- **OCR baseline:** single non-repeatable receipt · single claim · single PR. Repeatable receipt ⇒ self-log.
- **Every self-log / OCR scan produces a receipt** so Agency can verify by receipt number.
- **No new tables** when an existing table already has the column (e.g. outlet address reused from `outlet`).
- **Clean up:** delete unused tables; confirm every function actually needs its own table.

---

## 7. Daily update schedule (keep this doc alive)

Repeat every working day. Whoever runs a slot ticks the boxes and updates §8 / §9 / §10 before EOD.

| Slot | When | Who | Do |
|------|------|-----|-----|
| **Standup** | Start of day | jk + SL | Pick today's 🔴 target from §9 To-Do. Confirm who owns which link. |
| **Build block** | Morning | each | Wire the assigned link (B / E / F first). |
| **Midday spine run** | ~Midday | jk + SL together | Run §3 spine S1→S12 as far as it connects. Tick pass/fail. |
| **Solo run** | Afternoon | each | Run own §4 checklist. Note breakages. |
| **Log + roll up** | Before EOD | whoever ran it | Move any newly-finished item from §9 → §8 (with role link). Add today's row to §10 Changelog. |
| **Commit** | EOD | jk | `git add TEST_SCRIPT.md && git commit -m "test: daily run YYYY-MM-DD"` |

> **Reset the checkboxes** each morning (they record *today's* run). The Changelog (§10) is the permanent record of what passed/broke each day.
> Want this automated (a scheduled agent that re-audits the code and drafts the daily diff for you)? Say the word and I'll set up a daily routine — I won't create a recurring cloud job without your go-ahead.

---

## 8. DONE — double-checked, with role links (all details)

Legend: **Verified** = reported working end-to-end · **Reported** = built but needs a real sign-in re-check.

### PR side (jk)
| # | Item | Role link | Where | Data source | Status |
|---|------|-----------|-------|-------------|--------|
| P1 | Special Service for PR | PR → **Admin** (admin sees it) | mobile Scan/Special + `special-service` | special-service tables | ✅ Verified |
| P2 | This-week PR flow: Check-In + Payment (this-week) + History (today) | PR (self) | `CheckInScreen` · `PaymentScreen` · `HistoryScreen` | shift + shift-assignment `/mine` | ✅ Verified |
| P3 | PR profile editable (nickname / propic / gallery) | PR → **Admin** (admin views) | `ProfileScreen` + admin user-mgmt | pr / user tables | ✅ Verified |
| P4 | Check-In hides *tomorrow*; shows worked date; outlet **address** on card | PR ← **Outlet** (reads outlet address) | `CheckInScreen` + `shift-assignment.repository` | `outlet` FK (address reused, no new col) | ✅ Verified |
| P5 | History **Shifts** tab reconciles **per-day** with **Payment** this-week (same `payment_voucher_line` source; verified vs live voucher 533.50 = Tue 270.50 + Wed 263.00); a day spanning 2 outlets now labels **both** venues (no silent mis-attribution) | PR (self) | `ShiftHistoryPanel` · `PaymentScreen` | current-week voucher lines `/mine` | ✅ Verified |
| P6 | **F · Dispute now persists** — PR taps an amount on Payment → Last week → the PV flips to `status='disputed'` with reason+note on the **existing** `payment_voucher` columns (no new table). New PR-scoped endpoints `POST /payment-voucher/mine/:voucherId/dispute` + `…/dispute/withdraw`. Header shows a DISPUTED pill + open-dispute banner; withdraw reverts to `sent`. Agency web already reads these fields (`payment-voucher-map.ts`). | **PR → Agency** | `PaymentScreen` · backend `payment-voucher.*` | `payment_voucher` (status/disputeReason/disputeNote/disputedAt) | ⚠️ Reported (needs backend restart + agency-verify UI, §3 S10) |
| P7 | **Self-log proof photo (P2)** — drink self-log requires ≥1 photo (camera capture + reminder above the Note; Submit gated); one-or-many photos saved on the new `payment_voucher_line.proof_photos` jsonb. | **PR → Agency** | `ScanScreen` · backend `payment-voucher.*` | `payment_voucher_line.proof_photos` (jsonb, reused table) | ⚠️ Reported (needs `pnpm migrate` + restart; agency display = SL) |

### Outlet side (SL)
| # | Item | Role link | Where | Data source | Status |
|---|------|-----------|-------|-------------|--------|
| O1 | Today · Subscription · Settings pages | Outlet (self) | `routes/outlet/*` | outlet + subscription | ✅ Verified |
| O2 | Workspace (drinks/service split, scoped by `outlet_id`) | Outlet (self) | `routes/outlet/workspace` + `outlet-workspace` | 1:1 outlet FK | ⚠️ Reported (confirm scoping) |
| O3 | Ratings page | Outlet ← PR | `routes/outlet/ratings` + `rating` | rating table | ✅ Verified |
| O4 | History (real shift / shift-assignment / venue-scoped PR) | Outlet ← Agency/PR | `routes/outlet/history` | shift + shift-assignment | ✅ Verified |
| O5 | **Post Job** → shift write + "Confirm staffing" (caps) | **Outlet → Agency** (feeds roster) | `routes/outlet/bookings` + `shift` | shift + subscription caps | ⚠️ Reported (confirm E2E, §3 S1) |

### Agency side (SL)
| # | Item | Role link | Where | Data source | Status |
|---|------|-----------|-------|-------------|--------|
| A1 | Today · Approval · Job-Posting · Manage-PR · Subscription · Settings | Agency (self) | `routes/agency/*` | agency tables | ✅ Verified |
| A2 | Roster: read + add-shift / add-PR + **assign/unassign** | **Agency → PR** | `routes/agency/roster` + `shift-assignment` | `agency_pr` join | ⚠️ Reported (confirm assign shows on PR, §3 S2–S3) |
| A3 | Home KPIs · Outlet demand · History | Agency (self) | `routes/agency/dashboard` · `history` | shift + outlet | ✅ Verified |
| A4 | Payment Voucher: history endpoint + weekly wage calc | **Agency ← PR** (wages from shifts) | `payment-voucher` | shift-derived weekly | ⚠️ Reported (**verify PR-linking**, §9) |

### Admin side (jk)
| # | Item | Role link | Where | Data source | Status |
|---|------|-----------|-------|-------------|--------|
| AD1 | Special-Service receives PR self-log | **Admin ← PR** | `routes/admin/service` | special-service | ✅ Verified |
| AD2 | Admin can view PR profile | **Admin ← PR** | `routes/admin/user-management` | pr / user | ✅ Verified |

---

## 9. TO-DO (undone) — full backlog, prioritized

### 🔴 P1 — the spine (blocks everyone; do first)
- [ ] **B · Agency schedule/assign PR** — Shifts/Roster page: agency assigns PR to a shift. *(Agency → PR)* — §3 S2
- [x] **E · Wage/tip/commission auto-sync** — PR wages/drinks(HH/NH)/tips/OT pull from the **outlet rate card** (mobile consumes `/shift-assignment/mine` `rate`+`drinkMenu`; `pr-rate.ts`). ⚠️ **jk done in code — SL/user must run `pnpm migrate` (pr_tier 7-enum) + restart backend to go live, then verify §3 S7.** *(Outlet → PR)* — §3 S7
- [ ] **F · This-week dispute ↔ verify** — ~~PR raises dispute~~ ✅ **PR side wired** (persists to `payment_voucher`); **remaining: Agency verify/reject on payroll page** reads `status='disputed'` + reason/note. *(PR → Agency)* — §3 S9–S10 *(agency = SL)*
- [ ] **Payroll page: surface "this week"** so scanned receipts/scans can be **approved / rejected**. *(Agency)*
- [ ] **Verify Payment Voucher ↔ PR wage calc** logic is correct (auto-generated weekly from PR shifts). *(Agency ← PR)*
- [ ] **Confirm Post Job end-to-end** across roles: outlet post → shift → agency roster → PR assignment. *(Outlet → Agency → PR)*

### 🟠 P2 — money loop + proof
- [ ] **D · Check-in pic received** on Agency/Admin side (PR takes pic as proof; the other side must receive it). *(PR → Agency/Admin)* — §3 S5
- [ ] **G · To-Do section in PR Shifts links to History last-week** for PR to **sign** and see the **PDF**. *(PR)*
- [ ] **History page: show the PDF for every PV.** *(PR)*
- [x] **Self-log needs pic as proof** — ✅ **PR side done**: drink self-log now **requires ≥1 photo** (camera capture above the Note field, Submit blocked + reminder until snapped); stored on **`payment_voucher_line.proof_photos`** (jsonb, one-or-many). **Remaining: agency displays the proof on verify** (reads `line.proofPhotos`) *(= SL)*; native camera + optional crop = follow-up. *(PR → Agency)*
- [ ] **Every self-log / OCR scan emits a receipt number**; add a **detail button** for PR to view the receipt. *(PR → Agency)*

### 🟡 P3 — admin + database cleanup + hardening
- [ ] **H · Admin portal**: define what Admin needs to see **after the DB is combined**. *(all → Admin)* — §3 S12
- [ ] **OCR capture** (words) — only enable after a **new assignment** arrives; DB is immutable once check-in is submitted.
- [ ] **OCR baseline**: single non-repeatable receipt · single claim · single PR. Repeatable receipt ⇒ self-log.
- [ ] **Finish remaining backends** and confirm each is connected. *(SL)*
- [ ] **DB cleanup**: run through the database, delete unnecessary / unused tables. *(SL)*
- [ ] **Confirm every function works** as intended. *(SL)*
- [ ] **Verify every link pulls from the correct table** and returns the correct data. *(SL)*
- [ ] **Check whether every function actually needs its own table.** *(SL)*
- [ ] **Role-gating** actually blocks the wrong roles — retest the agency-token-reaching-admin-screens concern with a real sign-in. *(Admin / RBAC)*
- [ ] **Every table linked to each role** that should access it (Outlet / Agency / PR / Admin). *(all)*
- [ ] **/service/other redesign** (admin). *(Admin)*

---

## 10. Changelog (what changed / what's done — append newest at top)

| Date | What changed / done | Area (role link) | Status |
|------|---------------------|------------------|--------|
| 2026-07-28 | **Multi-shift day (PR).** A PR can now hold several shifts on one date. Check-In **renews to the new same-day assignment** after a check-out (auto-pick already preferred it; both Today and Check-In now also **refetch on mount** so an assignment made while the app sat open shows without a manual reload — the "stuck Velvet 23" case). Today section lists **every** shift dated today: the pending/on-duty one keeps the gold *Check in* CTA; each checked-out one stays as an *EARLIER TODAY · COMPLETE* card with **View summary**, which pins Check-In to that shift's check-out summary (`focus` in active-shift; amber banner returns to the current shift; pin auto-expires at midnight). No backend change: wages/OT already seal **per assignment** (dedupe by assignment id) onto the same day column of the current-week PV — so Payment shows both shifts' money on that date (voucher stays disputable) and History renders a card per venue that day. | PR (§8 P4/P5) | ⚠️ Reported |
| 2026-07-24 | **PR shift-cancel epic — Slice 3 (backfill).** Agency Roster gets a **Backfill needed** panel: `GET /shift-assignment/backfill` lists upcoming slots whose PR cancelled / had leave approved while the shift is still below quantity (staffing recounted live, so a filled slot drops off). **Pick replacement** → `GET /:id/replacement-candidates` ranks the agency's free-that-night active PRs (released PR's tier first, then completed shifts at that outlet, then name); **Assign** reuses the normal create-assignment. Pure FK reads — **no migration**, no new table. Outlet sees the gap automatically (Today `filled` already excludes non-staffing statuses). Backend restart needed for the new routes. | Agency ↔ Outlet (§9 backlog) | ⚠️ Reported |
| 2026-07-24 | **PR shift-cancel epic — Slice 1+2.** S1 (commit `089983e`): PR self-cancel via `POST /shift-assignment/mine/:id/cancel` — penalty bracket on the button, confirmation sheet, reason → reused `notes`, cancelled row = agency notify. S2 (this): **MC / Leave beside Cancel** — `POST /mine/:id/leave` flips the row to **`leave_pending`** (new enum values `leave_pending`/`leave_approved`, migration **0049**, no new table — Rule 1); agency Roster gets a **MC / Leave requests panel** with **Approve** (`/:id/leave/approve` → excused, no penalty, off staffing/cost) / **Reject** (`/:id/leave/reject` → back to `assigned`, mobile shows red rejected note via `[Leave rejected]` notes prefix). Check-in while pending withdraws the request. Cancel + Leave sheets now render **inside the phone frame** (new `PhoneSheet` portals into `PhoneFrame` on web; native keeps Modal). **Needs `pnpm migrate` + backend restart.** Slice 3 (MC backfill auto-match) = next. | PR ↔ Agency (§9 backlog) | ⚠️ Reported |
| 2026-07-23 | **P2 — self-log proof photo.** Check-In → Manual self-log (drinks) now **requires a photo** before submit: camera-icon capture block + reminder placed **above** "Note for agency (optional)"; Submit button disabled ("Snap proof to submit") until ≥1 photo, with a ⚠ reminder. Photos are downscaled client-side and saved to the **new `payment_voucher_line.proof_photos` jsonb** column (one-or-many; reuses the existing line table — Rule 1, audit cols already present). Backend `addMyLine`/`updateMyLine` persist + `toReceiptLineDTO` returns them. **Needs `pnpm migrate`** (drizzle-kit generates the `proof_photos` column) **+ backend restart.** Agency-side display of the proof = SL next; native camera/crop = follow-up. | PR → Agency (§8 P7 · §9 P2) | ⚠️ Reported |
| 2026-07-23 | **F (P1) — PR dispute now persists.** Payment → Last week: tapping an amount raises a real dispute on the PR's own PV via new PR-scoped `POST /payment-voucher/mine/:voucherId/dispute` (+ `/withdraw`), setting `status='disputed'` + `disputeReason`/`disputeNote`/`disputedAt` on the **existing** `payment_voucher` table (Rule 1 — no new table; audit cols already present). `getMyLastWeek` returns the dispute so it survives reload; DISPUTED pill + banner shown; withdraw → `sent`. Agency web already reads these fields. Backend restart needed; agency verify/reject UI = SL next. | PR → Agency (§8 P6) | ⚠️ Reported |
| 2026-07-23 | **E (P1) — wage auto-sync confirmed done in mobile code** (ScanScreen drink HH/NH %, tips, OT; CheckInScreen wage/OT; ShiftStatusPanel target — all from `/shift-assignment/mine` `rate`+`drinkMenu` via `pr-rate.ts`). Not yet live: needs `pnpm migrate` (pr_tier 7-value enum) + backend restart, then §3 S7 verify. Mobile `outlet-drink-menu.ts` is now dead (superseded by real `drinkMenu`). | Outlet → PR (§9 E) | ⚠️ Reported |
| 2026-07-23 | History **Shifts** ↔ **Payment** this-week reconciled per-day (both read the same current-week `payment_voucher_line`; verified vs live voucher = 533.50). Fixed multi-outlet day labels in `ShiftHistoryPanel` so a day with 2 venues shows both (was folding a 2nd venue's drinks/tips under the wages outlet). | PR (§8 P5) | ✅ done |
| 2026-07-23 | Set up the daily test tracker. `TEST_SCRIPT.md` is the single source of truth; §10 updated in place on each merge. Google Doc regenerated from this file on request (Drive auto-sync dropped — Claude's Drive connector is create-only). | Docs / process | ✅ done |
| 2026-07-22 | Check-In: hide tomorrow's attendance, show actual worked date, render outlet address on the card. (`CheckInScreen` + `shift-assignment.repository` + mobile `api.ts`) | PR ← Outlet (§8 P4) | ✅ done |

---

*Legend: ✅ Verified · ⚠️ Reported (needs re-check) · ❌ not started · 🔴 P1 spine · 🟠 P2 · 🟡 P3*
