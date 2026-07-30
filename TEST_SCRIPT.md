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
- ☐ **Forgot check-out** — stay checked in past the shift's end time: To-do section pops open with an amber **"Forgot to check out?"** caution (outlet · shift ended HH:MM) + *Check out* button; the eventual check-out stamp is **clamped server-side to the scheduled shift end** (pay locks to the shift window, night shifts cross midnight); **OT is never auto-paid** — the check-out summary shows detected OT (formula unchanged: hours beyond 6h at the tier OT rate / 1.5×) as *pending agency approval · not added to payout*
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
- ☐ **RBAC** — role / permission / module / pending → **confirm role-gating blocks wrong roles**. Retest with real sign-ins, all three portals: (1) backend `requireAdmin` on admin-request routes returns 403 to non-admin tokens; (2) front doors (`ensurePortal`): ANY `/admin/*` URL needs the admin role, `/agency/*` the agency role, `/outlet/*` the outlet role — a wrong-role session lands on ITS OWN portal (PR token → `/no-access`), and an admin session must NEVER be bounced to `/agency` on refresh (the old VITE role-id fallback did exactly that after an RBAC reseed — gates now match seeded role NAMES only)
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

### All roles — live API sweep (SL)
| # | Item | Role link | Where | Data source | Status |
|---|------|-----------|-------|-------------|--------|
| X1 | **Role-gating retested with REAL sign-ins, all 4 roles** — ~60 endpoint checks, expected outcome declared before each call | all | `router/v1.ts` surface | live shared DB | ✅ Verified (30 Jul; 31/31 on re-run) |
| X2 | PR `/mine` set (shifts · current/last week · history · special-service · notification) returns 200; PR refused `/payment-voucher`, `/pr`, `/collection-invoice`, `/platform-config`, `/shift-assignment`, `/rating`, `/user` | **PR ← all** | `*/mine` | live | ✅ Verified |
| X3 | `/shift-assignment/attendance-fixes` = 200 agency, **403 outlet AND 403 PR** — the deliberate staff-coordinate exclusion is server-enforced, not just documented | **Agency ← PR** | `shift-assignment` | `check_in_lat/lng` | ✅ Verified |
| X4 | PV export ticket lane is sound — mint checks `existing.prId !== pr.id` → 404; public path carries a 128-bit / 5-min / single-voucher ticket. Mounted above `authenticateJWT` **on purpose** (a browser download cannot send a Bearer header) | **PR** | `payment-voucher-export.routes.ts` | in-memory ticket | ✅ Verified (not a hole) |
| X6 | **Agency portal click-through on a REAL password login** (`owner@atlas-agency.my`) — Subscription: collections renders live drafts (Velvet 23 · RM 700.00 · 1 shift) + subscription record with correct empty state; Roster: Check-in locations panel plots real fixes. Zero console errors | Agency | `/en/agency/*` | live | ✅ Verified (30 Jul) |
| X7 | **Outlet portal click-through on a REAL password login** (`owner@velvet23.my`) — subscription record shows **Active**, not "Paid" (`4ab4da2` holds); "PR work · owed to your agency" correctly shows **nothing** while the agency's statement is still a DRAFT; `/outlet/special-service` shows the phase message, not a role error (`caeee07`). Zero console errors | Outlet | `/en/outlet/*` | live | ✅ Verified (30 Jul) |
| X8 | **Draft collections are invisible to the venue** — agency sees `Drafts · RM 700.00 · no outlet has been shown these yet`; outlet sees `No statements yet`. Controller's draft filter proven across two portals | **Agency → Outlet** | `collection-invoice` | live | ✅ Verified |
| X9 | **Double-booking refused on a shift TIMING EDIT** — moving Alice's 12:00-13:00 onto her 22:00-04:00 same day → 400 naming the clashing shift + venue; 08:00-09:00 still accepted (no false positive); slot restored | **Agency → PR** | `PUT /shift/:id` | live | ✅ Verified (fix `fa44ce4`) |
| X5 | `GET /user` no longer leaks credentials — `passwordHash` occurrences **0** for admin/agency/outlet; PR 403 on the list and on others' records, **200 on its own** (mobile profile call); all 4 logins still succeed | all | `user.routes.ts` · `withUserProfile()` | user / user_profile | ✅ Verified (fix `9a6eecc`) |

---

## 9. TO-DO (undone) — full backlog, prioritized

### 🔴 P1 — the spine (blocks everyone; do first)
- [ ] **B · Agency schedule/assign PR** — Shifts/Roster page: agency assigns PR to a shift. *(Agency → PR)* — §3 S2
- [x] **E · Wage/tip/commission auto-sync** — PR wages/drinks(HH/NH)/tips/OT pull from the **outlet rate card** (mobile consumes `/shift-assignment/mine` `rate`+`drinkMenu`; `pr-rate.ts`). ⚠️ **jk done in code — SL/user must run `pnpm migrate` (pr_tier 7-enum) + restart backend to go live, then verify §3 S7.** *(Outlet → PR)* — §3 S7
- [ ] **F · This-week dispute ↔ verify** — ~~PR raises dispute~~ ✅ **PR side wired** (persists to `payment_voucher`); **remaining: Agency verify/reject on payroll page** reads `status='disputed'` + reason/note. *(PR → Agency)* — §3 S9–S10 *(agency = SL)*
- [ ] **Payroll page: surface "this week"** so scanned receipts/scans can be **approved / rejected** — wire the agency Payroll RECEIPT SCANS card off demo onto `GET /payment-voucher/receipts`; approve/edit price + quantity; This-week = APPROVED, Last-week = dispute-only; untouched APPROVED → VERIFIED at week close. *(Agency)*
- [ ] **Verify Payment Voucher ↔ PR wage calc** logic is correct (auto-generated weekly from PR shifts). *(Agency ← PR)*
- [ ] **Confirm Post Job end-to-end** across roles: outlet post → shift → agency roster → PR assignment. *(Outlet → Agency → PR)*

### 🟠 P2 — money loop + proof
- [ ] **D · Check-in pic received** on Agency/Admin side (PR takes pic as proof; the other side must receive it). *(PR → Agency/Admin)* — §3 S5
- [x] **G · To-Do section in PR Shifts links to History last-week** for PR to **sign** and see the **PDF** — ✅ **done (30 Jul)**: weekly job now **issues** the closed week's vouchers (`pending_review → sent` + `issued_date`, unbalanced held for agency); PR signs under **Payment → Last week** (server commit FIRST — `POST /mine/:id/sign` — then the seal + History redirect); signed PV appears in History. Manual catch-up: `pnpm tsx --tsconfig tsconfig.json src/scripts/run-weekly-payout.ts` (backend dir). *(PR)*
- [x] **History page: show the PDF for every PV** — ✅ **done (30 Jul)**: History PV card **Open PV** (full voucher doc, real grid + linked receipt lines), **PDF** (one-tap REAL PDF download — server-rendered boxed voucher form with the Atmosphere logo + the PR's drawn-ink signature; same renderer on web + phone; phone opens via a 5-min export ticket, session token never in a URL), **Excel** (`GET /payment-voucher/mine/:id/export.xlsx` — server-rendered workbook cell-for-cell like the prototype's `PV-…-payment-voucher.xlsx`, agency/PR facts via FK joins). *(PR)*
- [x] **Self-log needs pic as proof** — ✅ **PR side done**: drink self-log now **requires ≥1 photo** (camera capture above the Note field, Submit blocked + reminder until snapped); stored on **`payment_voucher_line.proof_photos`** (jsonb, one-or-many). **Remaining: agency displays the proof on verify** (reads `line.proofPhotos`) *(= SL)*; native camera + optional crop = follow-up. *(PR → Agency)*
- [ ] **Every self-log / OCR scan emits a receipt number**; add a **detail button** for PR to view the receipt. *(PR → Agency)*
- [ ] **PV export "—" fields need real columns** — agency address, PR code, PR bank name / bank account no. don't exist in the DB yet, so Excel/PDF print "—". Add columns (+ PR profile UI for bank details), then the exports fill themselves. *(PR / Agency)*
- [ ] **Decide Vicky's duplicate current-week voucher** `34364790-…` — created by pr.vicky 27 Jul, agency owner set it `sent` mid-week; breaks one-week-one-PV at the next close. Merge/delete + block agency from sending current-week vouchers early. *(Agency / DB — decision needed)*

### 🟡 P3 — admin + database cleanup + hardening
- [ ] **H · Admin portal**: define what Admin needs to see **after the DB is combined**. *(all → Admin)* — §3 S12
- [ ] **OCR capture** (words) — only enable after a **new assignment** arrives; DB is immutable once check-in is submitted.
- [ ] **OCR baseline**: single non-repeatable receipt · single claim · single PR. Repeatable receipt ⇒ self-log.
- [ ] **Finish remaining backends** and confirm each is connected. *(SL)*
- [ ] **DB cleanup**: run through the database, delete unnecessary / unused tables. *(SL)*
- [ ] **Confirm every function works** as intended. *(SL)*
- [ ] **Verify every link pulls from the correct table** and returns the correct data. *(SL)*
- [ ] **Check whether every function actually needs its own table.** *(SL)*
- [x] **Role-gating** actually blocks the wrong roles — retest the agency-token-reaching-admin-screens concern with a real sign-in. *(Admin / RBAC)* — ✅ **done (30 Jul)**: real password logins for all 4 roles, ~60 checks. Agency is correctly refused `/platform-config` and `/admin-request` (both admin-only); every other gate behaved as designed. **It also found one real hole — see the `GET /user` row below.** §8 X1–X5
- [x] **Double-booking guard** — ✅ **done (30 Jul, `fa44ce4`)**: assign already refused a clash; the missing half was a shift **timing edit** dragging onto another shift the same PR works. Live-proven both ways (refuses the clash, allows a clear window). *(Agency → PR)* — §8 X9
- [ ] **🔴 Decide what a VENUE may read about a person** — the credential leak is closed, but an outlet listing users still receives the nested `user_profile`: IC/passport no., DOB, address, ID-photo paths. Outlets need PR **names** (Today/History resolve them via `services/pr/prs.ts` → `/user`), not identity documents. Needs a response-shape change **plus a product call**, and it is the same privacy question as "may a venue see staff check-in coordinates?" — **answer both together.** *(Outlet / Agency — decision needed)*
- [ ] **Re-run the live role sweep after ANY auth or gating change** — the 4 logins, ~60 checks and the expected-outcome list are the cheapest regression net in the repo (it found the hash leak in its second minute, after days of clean typechecks). PR password is `password`; agency/outlet owners `Password123!`; admin from `.env`. *(all)*
- [ ] **Every table linked to each role** that should access it (Outlet / Agency / PR / Admin). *(all)*
- [ ] **/service/other redesign** (admin). *(Admin)*

---

## 10. Changelog (what changed / what's done — append newest at top)

| Date | What changed / done | Area (role link) | Status |
|------|---------------------|------------------|--------|
| 2026-07-30 | **Double-booking guard — the audit's entry was wrong, and the real gap was the mirror image.** Re-deriving first showed assign **already** refuses a clash (`shift-assignment` create compares the new window against the PR's other active assignments that day). What was missing: `UpdateShiftSchema` allows changing `slot`/`shiftDate` and shift update had **no** clash check, so an agency could drag a shift on top of another one the same PR works — same outcome, opposite direction, and silent because nobody is assigning at that moment. (Assignment update cannot cause it: it only touches status/pay/check-in-out/notes, never the shift↔PR pairing.) Fix `fa44ce4` + `slotMinutes`/`slotWindowsOverlap`/`shiftDayKey` extracted to `util/slot-window.ts` so both ends test overlap with ONE implementation. Live-proven on a PR genuinely working two non-overlapping shifts in a day: clashing move 400 (message names the other shift + venue), clean move 200, slot restored. | Agency → PR (§8 X9) | ✅ done |
| 2026-07-30 | **First real click-through of both web portals** (genuine password logins, not minted tokens — the step blocked for days). Agency: collections renders live drafts (Velvet 23 · RM 700.00), subscription record correct-empty. Outlet: subscription row reads **Active** not "Paid", `/outlet/special-service` shows the phase message not a role error. **Draft statements proven invisible to the venue across two portals.** Zero console errors either side. Found + fixed one bug on sight (`50e632c`): the check-in card headed a 69 m fix with "1/1 within **50 m**" — `inRange` is radius + min(accuracy,30), so 69 m against a 50 m pin at ±22 m legitimately passes; header now reads "within fence · 50 m pin". Same class as the four catalogued label bugs, and only a live render could show it. | Agency + Outlet (§8 X6–X8) | ✅ done |
| 2026-07-30 | **`GET /user` was serving EVERY account's password hash to any signed-in user — fixed.** The first live 4-role sweep (real password logins, ~60 checks) found it on a **PR** token: 200 OK with the whole user table — 10 accounts, 10 `passwordHash` values incl. the platform admin's, plus IC/DOB/address/ID-photo paths for 6 of them. Same on outlet and agency. Two faults: `list()`/`getById()` spread the raw row (no projection), and the list had no gate. Fix `9a6eecc` — strip `passwordHash` + the 3 lockout columns in **`withUserProfile()`** (NOT the repository: `auth` still needs the hash to verify a login, so the projection must sit at the response boundary; that one helper also covers the `/user/:id` route mobile uses), list gated `requireRole('admin','agency','outlet')`, `/user/:id` self-or-staff. **Outlet stays IN the gate on purpose** — the tighter admin+agency gate blanks PR names on outlet Today + History (`use-outlet-today`/`use-outlet-history` → `services/pr/prs.ts`). Re-verified live: hash occurrences 0, PR 403 on the list / 200 on its own record, all 4 logins still work, 31-check regression clean, backend tsc 0. **Prior sweep had seen this route and rated it MEDIUM — it analysed who could call the endpoint and never what it returned.** | all (§9 role-gating, §8 X1–X5) | ✅ done |
| 2026-07-30 | **First live role sweep — the rest held.** Beyond the leak: PR's six `/mine` endpoints all 200 and every cross-role refusal correct; `/shift-assignment/attendance-fixes` proven 200 agency / **403 outlet + 403 PR** (staff-coordinate exclusion is server-enforced, first execution since it shipped); jk's PV export ticket lane audited and **sound** (mint checks `prId`, 128-bit 5-min single-voucher ticket, above-JWT mount is deliberate for browser downloads); and **no duplicate `pr` rows exist** — all 6 have a `userId`, none shared, so the "consolidate duplicate pr rows" decision is moot on current data. Reusable recipe: repo-root `.env` feeds the backend (no `apps/backend/.env` needed), port 7777, login returns `data.accessToken`, keep sweeps read-only (shared remote DB). | all | ✅ done |
| 2026-07-30 | **TEST_SCRIPT renewal is now ENFORCED by a hook.** New Stop hook `.claude/hooks/renew-test-script.js` (+ registration in project `.claude/settings.json` → `hooks.Stop`): Claude Code cannot end a turn while changes under `apps/`/`packages/`/`tools/` (uncommitted, or in a last commit < 60 min old) are not reflected by a renewed TEST_SCRIPT.md — it is forced to update §8/§9 + append a §10 row first. Fails open on errors; never double-blocks one stop. Both files are committed, so the rule enforces itself on every device after `git pull`. | all (doc-roles rule) | ✅ done |
| 2026-07-30 | **Cross-device memory sync.** Full Claude Code session memory mirrored into the repo: `docs/claude-memory/*.md` refreshed (new `innocenz-pv-pipeline.md` + `innocenz-env-gotchas.md`, updated index/wiring/backlog/sync files) and the Excel **"Claude Code Memory"** tab regenerated with every memory in full + restore steps + the to-do queue. New device: `git pull`, then copy `docs/claude-memory/*.md` into `%USERPROFILE%\.claude\projects\C--Users-jinkg-Downloads-InnocenZ-InnocenZ\memory\`. Rules going forward: renew TEST_SCRIPT.md on EVERY slice; CLAUDE.md only when rules change. | all | ✅ done |
| 2026-07-30 | **PV signature is REAL drawn ink.** Sign sheet now has a finger-drawn pad (`SignaturePad.tsx`, PanResponder + react-native-svg — no APK rebuild needed); Confirm is blocked until something is drawn; strokes stored on `payment_voucher.pr_signature` (migration 0071, server-validated — malformed ink = 400, never silently dropped) and re-drawn on the PDF as small fitted vector ink. Older signed-without-ink vouchers fall back to a small script name; unsigned print blank. Vicky's voucher reset to `sent` for the first live draw. | PR (§9 G) | ✅ done |
| 2026-07-30 | **Portal tabs pinned ("static") — agency can never become outlet.** All web portals shared ONE browser token slot, so a second-tab login silently swapped the first tab's identity (the "jump to outlet / sudden sign-out"). `auth-storage.ts` rewritten: tokens pinned per-tab in sessionStorage on first use; localStorage only seeds brand-new tabs; login/sign-out affects its own tab only. Refresh each portal tab once (re-login if asked) to adopt. | Admin ↔ Agency ↔ Outlet (§4d) | ✅ done |
| 2026-07-30 | **PV PDF = the prototype's boxed voucher form, everywhere.** ONE pdfkit renderer (centered letterhead + Atmosphere logo, bordered payable-to grid, shaded line table, payment-details + tall Total, signature block) serves the phone "Save as PDF" one-tap download AND the web History PDF button (old divergent plain-table client page DELETED). Logo on PV Excel + PDF only, nowhere else. Excel + PDF + print view all render from ONE FK-joined data bundle so they can never disagree. | PR (§9 G) | ✅ done |
| 2026-07-30 | **Scan-vs-selflog explained + plural fix.** A receipt scan logs as SCAN only when the OCR text matches the outlet's menu item names (that IS the gate — otherwise it honestly falls back to self-log). Short names (<5 chars) needed an exact token, so receipts printing "TIP" missed menu item "Tips" → matcher now accepts s-suffix singular/plural twins, and the fallback message lists the exact item names it hunts. | PR (§4 scan) | ✅ done |
| 2026-07-30 | **PR app phone polish (3 asks).** (1) Detail screens (PV doc / Scan / Security) now pad below the status bar — the top-left back button is always visible + tappable (hitSlop 10). (2) History PV **Excel/PDF open directly on the phone**: authenticated POST mints a 5-min voucher-scoped ticket, system browser opens `GET /payment-voucher/export/:ticket/voucher.xlsx` (download) or `/print` (voucher page + auto print dialog → Save as PDF) — public mount BEFORE authenticateJWT; session token never in a URL; PDF button no longer paid-only. (3) New `useKeyboardInset` hook pads every input bottom-sheet (sign, dispute ×2, cancel-shift, history filters, security) so the Android keyboard never covers typing (transparent Modals ignore adjustResize). Verified: ticket links 200 with no auth header, bad ticket 404, both tsc clean. | PR (§9 G) | ✅ done |
| 2026-07-30 | **PV sign + Payment History live (one week = one PV).** Weekly payout job now ISSUES the closed week (`pending_review → sent`, `issued_date` stamped, Σ≠0 held for agency; live drafts the generator used to skip are included) + notifies PRs; manual trigger `src/scripts/run-weekly-payout.ts`. PR signs under Payment → Last week — `PvDetailScreen` now renders the REAL last-week voucher (grid + linked receipt lines from `/mine/last-week`, demo builders removed) and `confirmSign` awaits `POST /mine/:id/sign` BEFORE any success UI. History → Payment shows signed/paid PVs (`/mine/history`) with Open PV / PDF (web print) / **Excel** — new `GET /mine/:voucherId/export.xlsx` renders the prototype's workbook layout from FK-joined agency+PR rows (`exceljs` added to backend). Fixed `weekRangeLabel` off-by-one (Sunday→Monday anchor). Verified live: Vicky 961ca742 sent→signed→history(14 lines)→restored to `sent` for user demo; export 8 KB xlsx checked cell-by-cell. ⚠️ Data note: Vicky has a 2nd current-week voucher `34364790` (agency manually sent it mid-week) — breaks one-week-one-PV at next close; decide merge/delete. | PR ↔ Agency (§9 G, §3 S11) | ✅ done |
| 2026-07-30 | **All three portals locked to their own role + admin-bounce bug fixed.** `ensurePortal(portal)` now guards `/admin`, `/agency` AND `/outlet` route roots (one `/auth/me` lookup per token, cached). Wrong-role sessions land on their own portal; PR tokens → `/no-access`; failed lookup → `/login`. BUG FIX: an admin session was being bounced to `/agency` on every refresh — the guard's `VITE_AGENCY_ROLE_ID` fallback matched a stale role id after this week's RBAC reseed; gates now match seeded role NAMES only (`admin/agency/outlet/pr`). | Admin ↔ Agency ↔ Outlet (§4d) | ⚠️ Reported |
| 2026-07-30 | **Admin portal front door closed (§4d RBAC).** The `/admin` route tree now runs `ensureAdminPortal()` in `beforeLoad`: it reads `/auth/me` roles (cached per token) and redirects non-admin sessions — agency → `/agency`, outlet → `/outlet`, anything else (e.g. PR) → `/no-access`; role-lookup failure clears tokens → `/login` (fail closed). Complements the backend `requireAdmin` guards (commit `41386b9`) that already 403'd admin data — this was why an agency login on `/admin/service/*` saw "Failed to load · 403": the server was right, the front end just let the wrong role sit there. Admin pages themselves are real DB read/write (`admin_request` rows; Resolve/Approve/Decline/Quote persist via PATCH). | Admin (§4d) | ⚠️ Reported |
| 2026-07-28 | **Forgot check-out guard + OT gating.** (1) To-do caution: a PR still checked in past the shift's scheduled end gets an amber *"Forgot to check out?"* card in the Shifts-page To-do section (pops open once, counts in the TO-DO tab) with a *Check out* button. (2) `checkOutMine` now **clamps the check-out stamp to the scheduled shift end** (`shift_date` + slot window, rolls past midnight; unparseable slot = no clamp; never clamps below check-in) — a forgotten check-out can't inflate hours. (3) **OT auto-seal removed** from mobile check-out (was the bogus RM 678.78 "Others"): the OT formula stays (hours beyond 6h × tier OT rate / 1.5× fallback) but is shown on the check-out summary as *pending agency approval · not added to payout*. Agency-side OT approve/pay flow = follow-up. **Backend restart needed.** Old bogus OT lines already sealed must be deleted by hand from the draft PV (self-log edit/delete on Check-In page). | PR ↔ Agency (§9 P2) | ⚠️ Reported |
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
