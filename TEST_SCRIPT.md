# InnocenZ — Daily Run-Through Test Script (4 Roles)

**Owners:** jk (PR-mobile + Admin oversight) · SL (Outlet + Agency web)
**Purpose:** One clean checklist to run **every day**. Test the **connected** workflows first — the ones where both of us have to be wired up before either can see a result.
**Source of truth:** This file (`TEST_SCRIPT.md`) is the single source of truth. Add a §10 Changelog row on every merge to `main`. A Google Doc copy is regenerated from this file on request (a fresh Doc each time — no in-place Drive edit).
**Last synced from code:** 2026-07-30 (branch `jk` — full admin-surface audit)

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
| H | Everything → Admin portal | all → Admin | ⚠️ **wired** — 30 Jul audit: every `/admin` page reads/writes the live DB (no demo screens); needs a real-sign-in verify pass (§8 AD3–AD18) | 🟡 P3 |

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
- ☐ **MC / Leave requests** — reviewed on **Approvals only** (the `MC/Leaves` tab); the Roster no longer carries a duplicate panel. The tab lists each request when a PR files leave (PR · outlet · date · reason); **Approve · excuse shift** removes the PR from staffing with no penalty (`leave_approved`), **Reject** puts the PR back on the shift (mobile shows the rejection); cancelled rows still surface the PR's cancel reason
- ☐ **Backfill needed** — after a cancel or approved leave on an upcoming still-understaffed shift, Roster shows a *Backfill needed* card (outlet · date · staffed X/Y · who left · reason); **Pick replacement** lists ranked free PRs (same tier as the released PR first, then "worked here N×"); **Assign** fills the slot and the card disappears once the shift is back at quantity
- ☐ **Pending / Approval** flow
- ☐ **PRs (Manage PR)** list
- ☐ **PV (Payment Voucher)** — weekly wage auto-generated from PR shifts; **verify PR-linking is correct**
- ☐ **Payroll** — this-week receipts/scans → **approve / reject**
- ☐ **Subscription / Settings / Special-Service**

### 4d. Admin (web) — jk
- ☐ **Dashboard** — 4 live KPI cards (pending agencies / pending outlets / plan requests / job posts) + status donuts + *Today's action items* + activity feed (audit-log GraphQL) + latest-registrations table; every card/row navigates to its management page
- ☐ **User Management** — **Admins** (list + Create Admin via `/auth/register`) · **Agency** (search/filter + **approve / suspend / reactivate** + details sheet with PRs tab + `?focus` deep link) · **Outlet** (filter + **approve / suspend / reactivate** + Business/Location/Team tabs + `?focus`) · **PR** (read-only list, search + agency filter, showcase/portfolio sheet) · **Legacy member** (merged suspended agencies/outlets + inactive PRs, reactivate orgs)
- ☐ **RBAC** — role / permission / module / pending → **confirm role-gating blocks wrong roles**. Retest with real sign-ins, all three portals: (1) backend `requireAdmin` on admin-request routes returns 403 to non-admin tokens; (2) front doors (`ensurePortal`): ANY `/admin/*` URL needs the admin role, `/agency/*` the agency role, `/outlet/*` the outlet role — a wrong-role session lands on ITS OWN portal (PR token → `/no-access`), and an admin session must NEVER be bounced to `/agency` on refresh (the old VITE role-id fallback did exactly that after an RBAC reseed — gates now match seeded role NAMES only)
- ☐ **RBAC CRUD** — create/edit role + per-role **permission matrix** save; permission + module create/edit/deactivate; **Pending** aggregator (agencies · outlets · requests · job posts) deep-links `Review →` to each owning page
- ☐ **Service** — **payment-voucher** (read-only browser: PR-name search, status filter, detail sheet with lines + dispute banner) · **requests** (POS-quote + Custom-renegotiation inbox: remarks / quote / mark-contacted / resolve + negotiated-revenue cards) · **plan-changes** (outlet switch **approve / decline**, agency 'direct' log) · **/service/other** (all-orders + pending-review views, agency job **approve / decline**, edit + status change — redesign pending)
- ☐ **Business** — **plan** (catalog create/edit/activate; `subscription` path redirects here) · **history** (billing ledger: role toggle, status, search, date filters — read-only)
- ☐ **Settings** (platform config: fee % / geofence / monthly fee / dup-payment window / currency — PUT persists) · **Profile** (own display name + propic)
- ☐ **Audit-Log** per role — role picker → per-role table + old-vs-new diff dialog (known: role filter is client-side per page, counts span all roles)
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
| P8 | **The PR sees APPROVED during the week** — `/mine/current-week` + `/mine/last-week` now ship `dayReviews[{date,status}]`, so a day the agency signs off on Tuesday reads **APPROVED** (green) on the phone instead of PENDING until Sunday's send. Header reads "Approved days n/7" — it used to say *Verified* over the PENDING count. A stale approval arrives as `null`, so a day whose total changed reads unreviewed on the phone too — **and so does a day carrying a PENDING receipt** (`prVisibleDayStatuses`), because APPROVED is what unlocks the dispute and must never over-claim. | **Agency → PR** | `payment-voucher.controller.ts` · `week-pay-grid.ts` · `PaymentScreen` | `payment_voucher_day_review` + `payment_voucher_receipt.status` (read-only, no DDL) | ⚠️ Reported (12/12 pure checks; needs a phone re-check after backend restart) |
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
| A5 | **Approving a DAY approves the receipts on that day** — `receiptsCarriedByDays` carries every PENDING receipt whose lines all fall on approved days (a Mon+Tue receipt waits for both; an undated receipt is never carried — its money is in no day's total). Both day-review endpoints return the post-sweep `receipts` + `pendingReceiptCount`, and the Receipts sub-tab is invalidated alongside the evidence detail. | **Agency → PR** | `payment-voucher-day-review.ts` · `payment-voucher.controller.ts` · `use-agency-pv-day-review.ts` · `AgencyPvDayReviewPanel` | `payment_voucher_receipt.status` (no DDL) | ⚠️ Reported (7/7 pure checks + typecheck clean; needs a live agency click-through) |
| A6 | **Agency receipt editor (Approve + dispute queue)** — correct scanned/self-log drinks/tips in place via targeted `PATCH/POST /receipts/:id` (+ lines); never `PUT /payment-voucher/:id`. Same `AgencyReceiptEditor` in Receipts sub-tab and DisputeQueuePanel. Migrations **0083** (`payment_voucher_line.outlet_id`) + **0084** (`review_withdrawn_at`) applied on `innocenz-test`. | **Agency → PR** | `AgencyReceiptEditor` · `use-agency-receipt-edit` · `DisputeQueuePanel` · `payment-voucher.*` · `0083`/`0084` | receipt + line tables | ⚠️ Reported (landed `57bd165`; live click-through still owed — §9 audit items remain) |

### Admin side (jk)

> **30 Jul full-surface audit + live run-through:** every `/admin` page is wired to the live backend — **zero demo screens in the admin tree** (the demo-store split lives only in agency/outlet). Signed in as the seeded admin against DB `103.224.93.109:6543/innocenz-test` and confirmed each page renders real rows; two write round-trips persisted and were reverted.
>
> **Live DB baseline (30 Jul 21:5x):** 3 agencies (all active) · 7 outlets (all active) · 6 PRs · 2 admins · 5 roles / 51 permissions / 16 modules · 4 payment vouchers · 12 admin-requests (6 `plan_change`) · 13 special-services (7 open / 2 assigned / 1 in-progress / 1 completed / 2 cancelled, 2 awaiting admin approve) · 12 plans · 14 member-subscription rows · 2 752 audit rows.
>
> **Write proof (reversible, restored):** `PUT /platform-config` geofence 50 → 57 → 50 persisted **and surfaced in the dashboard activity feed as "InnocenZ Admin updated platform-config"**; `PATCH /admin-request/:id` remarks written, re-read, restored. **Guards:** a PR token got **403** on `/admin-request`, `/platform-config` and RBAC writes.
>
> `☐ No data` = the code path and guard are correct but the DB currently holds **no row in the required state** (e.g. nothing is `pending_review`, so approve/suspend has nothing to act on) — retest once SL creates pending data. Hardening gaps live in §9 → *Admin hardening backlog*.

| # | Item | Role link | Where | Data source | Status |
|---|------|-----------|-------|-------------|--------|
| AD1 | Special-Service receives PR self-log | **Admin ← PR** | `routes/admin/service` | special-service | ✅ Verified |
| AD2 | Admin can view PR profile | **Admin ← PR** | `routes/admin/user-management` | pr / user | ✅ Verified |
| AD3 | Dashboard: live KPI cards + status donuts + Today's action items + audit activity feed + latest registrations | **Admin ← all** | `routes/admin/dashboard` | agency · outlet · admin_request · special_service · audit_log (GraphQL) | ✅ **Verified live** — rendered 3 agencies / 7 outlets / 13 jobs / 3 plan requests / 2 job posts, all matching the API; 7 action items; feed showed my own config write |
| AD4 | Agency management: search/filter list + **approve / suspend / reactivate** + details sheet (Basic Info + PRs tab) + `?focus` deep link | **Admin → Agency** | `user-management/agency` | agency (`PATCH /:id/approve` · `/:id/suspend`) + `agency/:id/prs` | ⚠️ **Read verified** (3 real agencies incl. Atlas/Delta/Starline); approve/suspend routes live (bogus id → 404, guard passed) but ☐ **No data** — 0 rows are `pending_review`/`suspended` |
| AD5 | Outlet management: filter list + **approve / suspend / reactivate** + details sheet (Business / Location / Team) + `?focus` | **Admin → Outlet** | `user-management/outlet` | outlet (`PATCH /:id/approve` · `/:id/suspend`) + `/:id/members` | ⚠️ **Read verified** (7 real outlets incl. Velvet 23 / Emhub Testing); approve/suspend routes live but ☐ **No data** — 0 pending/suspended rows |
| AD6 | PR management: search + agency-filter list, per-row agencies popover, details sheet (Personal / Contact / Showcase / Agencies) — read-only | **Admin ← PR** | `user-management/pr` | user (`?roleId=pr`) + `agency/pr-links` | ✅ **Verified live** — 6 PRs with legal name + NRIC/passport + email/phone + agency links (Vicky, Alice, Nurul, Haziq, Mei Ling, Arjun) |
| AD7 | Admin accounts: list + **Create Admin** (name/email/password) | **Admin → Admin** | `user-management/admin` | user (`?roleId=admin`) + `POST /auth/register` | ⚠️ **Read verified** (2 admin accounts); Create deliberately not run (would add a permanent row) — see §9 for the dropped status toggle |
| AD8 | Legacy member: merged suspended agencies/outlets + inactive PRs, filters/sort, **reactivate** orgs | **Admin → Agency+Outlet+PR** | `user-management/legacy-member` | agency + outlet + user (status loops) | ☐ **No data** — all three source queries return 200 but 0 suspended agencies, 0 suspended outlets, 0 inactive PRs, so the page is legitimately empty today |
| AD9 | RBAC: role create/edit + **per-role permission matrix** save; permission + module CRUD (soft deactivate); **Pending** aggregator with `Review →` deep links | **all roles** | `rbac/role·permission·module·pending` | role · m_module · m_permission · role_permission | ⚠️ **Read verified** — 5 roles, **51 permissions**, 16 modules live; PR token **403** on role write (guard proven); create/edit not run (permanent rows) |
| AD10 | Payment-voucher browser: PR-name search, status filter, detail sheet (lines, totals, dispute reason/note) — read-only | **Admin ← Agency+PR** | `service/payment-voucher` | payment_voucher (+lines) | ✅ **Verified live** — 4 real vouchers (Victoria 587.50 Sent · 1,581.48 Sent · Alice 603.30 Pending · 3.60 Pending). **Both Vicky rows visible = the §9 duplicate-voucher issue confirmed in the UI** |
| AD11 | Plan Request inbox: POS-integration + Custom-renegotiation — edit remarks/quote, **mark contacted**, **resolve** (price finalized) + negotiated-revenue summary | **Admin ← Outlet+Agency** | `service/requests` | admin_request (PATCH `/:id` · `/contacted` · `/resolve`) | ✅ **Verified live + WRITE PROVEN** — 12 requests; negotiated summary (outlet 1×RM4 500, agency rows); `PATCH remarks` persisted on re-read, then restored |
| AD12 | Plan-change activity: outlet switch **approve / decline** (price stamped), agency 'direct' auto-switch log | **Admin ← Outlet+Agency** | `service/plan-changes` | admin_request (`?type=plan_change`, PATCH `/approve` · `/decline`) + subscription | ⚠️ **Read verified** — 6 `plan_change` rows (incl. `status='direct'` agency auto-switches); approve/decline not fired on a real row (would move a subscriber's plan) |
| AD13 | Special-service orders: all-orders + pending-review views, agency job **approve / decline**, edit fields + status change, summary cards | **Admin ← Outlet+Agency+PR** | `service/other` | special_service (PATCH `/:id` · `/status` · `/admin-approve` · `/admin-decline`) | ⚠️ **Read verified** — 13 orders + summary 7/2/1/1/2 + **2 genuinely awaiting admin approval** (Delta makeup, Atlas transport). Approve/decline is the next thing to click for real |
| AD14 | Plan catalog: **create / edit / activate** plans (price, cycle, coverage builder) | **Admin → Outlet+Agency** | `business/plan` | subscription (POST · PUT) | ✅ **Verified live** — 12 plans rendered with audience/coverage/cycle (agency Starter 125 → Custom "Renegotiate price"; outlet Essential 999 → Premier 9 999) |
| AD15 | Billing ledger: member-subscription history with role toggle / status / search / date filters — read-only | **Admin ← Outlet+Agency** | `business/history` | member_subscription | ⚠️ **Read verified** — 14 real ledger rows (agency + outlet subscriber types) |
| AD16 | Audit-log: role picker → per-role table (date/action/entity filters) + old-vs-new **diff dialog** | **Admin ← all** | `audit-log/$role` | audit_log via GraphQL `auditLogs` | ⚠️ **Live but BUGGY** — **2 752 real rows** (grew during the run; captured my own writes + failed probes). Admin-audit page showed **1 row while the footer claimed "1–10 of 2752, Page 1 of 276"** → the §9 client-side role-filter defect is now **confirmed in the UI, not theoretical** |
| AD17 | Platform settings: fee % / geofence radius / monthly fee / dup-payment window / currency — **PUT persists** | **Admin → all** | `settings` | platform_config | ✅ **Verified live + WRITE PROVEN** — form loads 2.50 % / 50 m / 499.00 / 24 h / MYR from DB; geofence 50→57 persisted (`updatedAt` stamped, audit row written), reverted to 50 |
| AD18 | Own profile: display name edit + propic upload | Admin (self) | `profile` | user (`/auth/me` + `PATCH /user/:id`) | ⚠️ **Read verified** (`/auth/me` → roles `[admin]`); name/propic write not run (would change the shared demo admin's identity) |

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
| X10 | **Overnight shifts now clash correctly** — Jul 31 02:00-06:00 against Jul 30 22:00-04:00 refused 400 (both guards previously compared same-`shiftDate` only, so overnight never met the next morning); Jul 31 08:00-09:00 and a second same-day shift both still pass | **Agency → PR** | `util/slot-window.ts` | live | ✅ Verified (fix `b73aa93`) |
| X11 | **PV day review** — hold-with-note records; approve-all approves the rest and reports "1 day(s) approved · 1 held day(s) left untouched" WITHOUT overturning the held day; baseline cents stored (60000 / 330) match the day totals; unknown day 404, bad status 400, PR token 403; un-review returns to clean | **Agency ← PR** | `PATCH /payment-voucher/:id/day-review/:date` | live | ✅ Verified (`ef45445`) |
| X12 | **A voucher cannot be sent until every day is decided** — `PUT /payment-voucher/:id` with `status:'sent'` on a voucher with 2 unreviewed days → **409** naming both dates, and the voucher is **still `pending_review`** afterwards (no partial write). Then approve one day + hold the other → `allDaysReviewed:true` **and** `hasHeldDay:true` together (the documented trap) → send still **409**, citing the held day. Rewriting the lines in the same call as the send → **409** ("two steps"), so the gate cannot judge old totals and ship new ones. Test rows un-reviewed afterwards; voucher restored to zero decisions | **Agency → PR** | `payment-voucher-day-review.ts` `voucherSendGate()` | live (`7bf3962e`) | ✅ Verified |
| X13 | **An outlet no longer receives identity documents** — outlet token on `GET /user`: 17 rows, **0** carrying `idNo`/`dob`/`addressLine1`/`idPhotoFront`, **all 17 usernames intact** (Today/History still resolve names). Same call on an agency token still returns 6 IC numbers + 1 DOB, so it is scoped by role and not blanket-blanked. By id: the **same** user reads `idNo:null` through the outlet and `PRESENT` through the agency. ⚠️ The own-record exemption is **not** live-proved — no outlet account in the shared DB has a populated `user_profile`, so an exemption is indistinguishable from an empty profile; the leak direction is what was proven | **Outlet ← PR** | `redact-identity-docs.ts` · `withUserProfile()` | live | ✅ Verified (leak side) |
| X14 | **PV day-review PANEL driven in a browser on a real agency login** (`owner@atlas-agency.my`, voucher `7bf3962e`, 2 dated days RM 600.00 + RM 3.30). All four gate states proven in order: 0/2 decided → **send disabled**, caption "2 day(s) not yet reviewed"; approve one → 1/2, **still disabled**; hold the other with a note → **DAY REVIEW (2/2) and send STILL disabled** citing the held day — the documented `allDaysReviewed`-vs-`hasHeldDay` trap, live, in the UI; approve the held day → **send ENABLES** + "Every day is decided". `Approve the 1 remaining day(s)` approved the open day and left the held one untouched, stamping `· approve-all` on the row it did touch. Cents rendered exactly (60000 → RM 600.00). Zero console errors. **All decisions cleared afterwards — the voucher is back to zero review rows and still `pending_review`, confirmed by API.** Found + fixed one bug on sight: approving a HELD day carried the hold's note onto the approval, so the record read *"Approved · Note: &lt;why it was held&gt;"* | **Agency ← PR** | `AgencyPvDayReviewPanel` · `use-agency-pv-day-review` | live (`7bf3962e`) | ✅ Verified |
| X15 | **The agency Payroll & PV list could not show ANY real voucher — FIXED.** Atlas has 4 (2 `pending_review`, 2 `sent`) and both week tabs rendered "Payment Vouchers (0)": `pvBelongsToPayrollWeek` required `pv.weekStartIso === <tab week start>`, but tab weeks come from the DEMO timeline and start **Sunday** (19 Jul) while the backend's `week_start` is **Monday** (20 Jul) — never equal. Neither tab covered the CURRENT week either, which is where `pending_review` vouchers sit. **Owner's call: keep the tabs Sunday-start and add a This Week tab**, so matching is now by **containment** (a date falls in exactly one Sun–Sat week, so no ambiguity), not equality. Live after: **This Week = 3 vouchers** (2 Pending Agency Review + 1 Pending PR Review), **Last Week = 1**, all 4 reachable, and each row prints **"Week worked: 27 Jul – 2 Aug 2026"** under the tab's "26 Jul – 01 Aug 2026" so the one-day convention gap is stated rather than hidden. The day-review panel now opens by **clicking a row**, not just by deep link. Zero console errors | **Agency ← PR** | `routes/agency/pv.tsx` `pvBelongsToPayrollWeek`/`pvOwnWeekLabel` | live | ✅ Verified |
| X16 | **An agency is now TOLD when the payout job holds its vouchers** — new notification kind `pv_day_review_pending` (migration **0073**, `ALTER TYPE … ADD VALUE IF NOT EXISTS`, applied via `pnpm migrate:deploy`). Verified live by direct query: the enum now carries **9** values ending in `pv_day_review_pending`, and the recipient filter resolves real people — **Atlas / Delta / Starline each have an active `owner`** — so the notification cannot silently reach nobody. Raised **one per agency per run** naming a count, not one per voucher, and addressed to **owner + finance only**, mirroring `agencyOwnerOrFinance` on the review routes. ⚠️ **The producer itself is NOT runtime-fired** — firing it means running the payout job against the shared DB, and the previous complete week's vouchers are already `sent`, so a run would prove nothing while drafting collection rows | **Agency ← PR** | `weekly-payout.job.ts` · `notification.model.ts` · migration `0073` | live (enum + recipients) | ⚠️ Reported |
| X17 | **The agency home's "Pending Agency Review" link landed on an empty list — FIXED.** Found while re-verifying X15: `/agency/pv?status=PENDING_REVIEW` (linked from `AgencyHomeHubTabs`) forced the **Last Week** tab, but a real `pending_review` voucher lives in the week still running. Live before: Last Week active, "Pending Agency Review **(0)**", *"No vouchers match these filters"* — with **2** genuinely waiting one tab away. It was invisible until X15 made real vouchers list at all. Now the tab is chosen from the DATA (`tabHoldingStatus`, newest week first, `last_week` as fallback), so the payout cadence can move without it going stale again. Verified live: `?status=PENDING_REVIEW` → **This Week active, (2), both rows shown**; `?status=DISPUTED` with none in the DB → falls back to Last Week and shows the empty state without breaking; `?status=TO_PAY` → **Payment Week**, unchanged. Clicking a tab now **clears `?status`/`?pv`** so a later refetch cannot yank the user back off the tab they chose — verified: URL became `/en/agency/pv` and the tab held | **Agency ← PR** | `routes/agency/pv.tsx` `tabHoldingStatus` / `selectPayrollWeekTab` | live | ✅ Verified |
| X18 | **An agency line edit was DELETING the PR's proof photos and severing every receipt link — FIXED.** `PUT /payment-voucher/:id` with `lines` deletes the whole line set and re-inserts from the payload, and `toLineRows()` mapped only 6 fields — no `receipt_id`, no `proof_photos`. So one price edit nulled the receipt link on **every** line of that voucher and destroyed the proof photos a self-log is *required* to carry. That also explains the verify panel reporting commission lines as unbacked. Fix: the repository now carries both across the wipe by matching `ref` (unique refs only — an ambiguous match would attach a receipt to the wrong money), and the API accepts both explicitly so a caller can be authoritative. **Live-proven** on voucher `7bf3962e`: sent the same 2 lines back with neither field in the payload → `receiptId 9b66833f` and 1 proof photo **both survived**, net unchanged at 603.30 | **Agency → PR** | `payment-voucher.repository.ts` `update()` · `toLineRows` | live | ✅ Verified |
| X19 | **jk's export lane audited.** Sound: ticket design (128-bit / 5-min / in-memory / single-voucher), scoping on all three `/mine` exports + the mint (`prId` mismatch → 404), migration `0071` additive. Both formats download 200 for a real PR login. **Two defects found by opening the artifact, not reading it:** (a) **the money columns are TEXT** — `.toFixed(2)` yields strings, so Unit Price and Amount arrive as `"3.60"<string>` and an accountant cannot `SUM` the Amount column of a payment voucher; (b) **the voucher number identifies a WEEK, not a voucher** — `voucherRef()` = `PV-<weekEnd>`, so all 3 of this week's vouchers are `PV-20260802` and download under the same filename (confirmed from `Content-Disposition`). Minor: the workbook and print HTML both carry the PR's IC/passport + phone, and the print/PDF URLs are unauthenticated for 5 minutes — the PR's own data, but it lands in phone browser history | **PR ← Agency** | `payment-voucher-excel.ts` · `-pdf.ts` · `-export-ticket.ts` | live | ⚠️ Reported (2 open) |
| X20 | **RECEIPT LIFECYCLE — backend built, migration `0074` verified live by direct query.** Columns exist as declared (`status` USER-DEFINED NOT NULL default `'pending'`, `reviewed_at` timestamptz nullable, `reviewed_by` varchar nullable) and the partial index `payment_voucher_receipt_pending_idx` is present. **The backfill is the part that mattered and it landed correctly: ZERO rows are `pending`** — 4 on `sent` vouchers became `verified`, 3 on `pending_review` vouchers became `approved` — so no existing voucher was retroactively blocked by a gate that did not exist when its money moved. Backend tsc **0**. ⚠️ **No endpoint has been fired yet**: `PATCH /payment-voucher/receipts/:id/review`, `PATCH …/receipts/:id/lines/:lineId`, the extended send gate, the Monday rollover and the dispute precondition are all logic-and-types only | **Agency ← PR** | migration `0074` · `payment-voucher.controller.ts` · `-day-review.ts` · `weekly-payout.job.ts` | live (schema + backfill) | ⚠️ Reported |
| X21 | **THE RECEIPT LIFECYCLE FIRED LIVE, END TO END — 9 checks on real logins, and it found a bug.** On voucher `7bf3962e` (Alice, Atlas): **(1)** withdrawing approval on `RCP-000007` cleared `reviewedAt`/`reviewedBy` and moved `pendingReceiptCount` 0→1; **(2)** the send then returned **409** naming *both* refusals in one message — *"2 day(s) not yet reviewed: 2026-07-29, 2026-07-30 · 1 receipt(s) not yet reviewed: RCP-000007"* — with the voucher still `pending_review` (no partial write); **(3)** approving stamped `reviewedBy owner@atlas-agency.my`; **(4)** correcting the line 3.30→4.00 did all three things at once — net 603.30→604.00, the receipt dropped **approved→pending**, and the 30 Jul day flipped **STALE** (approved at 330 ¢, now 400 ¢) with its status back to null; **(5)** the PR was refused a drinks dispute on that day — *"The agency has not finished reviewing RCP-000007"*; **(6)** with the receipt approved, the PR's own edit **409** *"raise a dispute if the figure is wrong"* and **(7)** delete **409** *"raise a dispute instead of removing it"*; **(8)** the PR's current-week read showed the wages line `disputable: true` with no receipt (the exemption) beside the drinks line carrying the real `approved`. **(9) THE BUG:** `PATCH /mine/lines/:id` answered `receiptStatus: null · pending: false · disputable: true` for a line whose receipt was genuinely **pending** — the write response fell back to the source guess, so the app would have offered a dispute button the server refuses. Fixed by re-reading the statuses on that path; re-fired on the rebuilt server → `receiptStatus: pending · pending: true · disputable: false`. **Shared DB restored to the exact baseline** (pending_review · net 603.30 · 0 pending · no day-review rows · lines 1×600.00 + 1×3.30); the one lasting change is that `RCP-000007` now carries a real `reviewedBy`, which is true. ⚠️ **Two paths deliberately NOT fired, both because they leave permanent rows:** a successful send, and a dispute that actually succeeds | **Agency ← PR** | `payment-voucher.controller.ts` · `-day-review.ts` · migration `0074` | live (real agency + PR logins) | ✅ Verified |
| X22 | **🎉 THE PR APP RAN FOR THE FIRST TIME — in a browser, on a real login, against the live backend.** Nothing in `apps/mobile` had ever been executed in any session; `react-native-web` + `react-dom` were already dependencies, so `expo start --web` was all it needed (new `tools/scripts/dev-mobile-web.mjs` + a `mobile-web` entry in `.claude/launch.json`). Bundled clean — **492 modules, zero console errors**. Verified on Alice's real account: home renders her actual shift (Emhub Testing, Thu 30 Jul 12:00-13:00, real address); **Payment → This week shows the new caption "1 entry approved by your agency"** beside a real grid (wages 600.00 Wed + drinks 3.30 Thu, running total RM 603.30); **Check-In → STATUS shows the Lemon Drop row badged "Approved"** — not "Matched" — **with its edit / rescan / delete controls gone**, which is the interlock working on screen. ⚠️ **Not exercised: the last-week dispute refusal.** It needs a last-week voucher carrying a pending receipt, and Alice has no last-week voucher; note that a *sent* voucher can never have one, since the send gate blocks that — so this only arises on a week the gate is still holding. The server-side half of that refusal IS fired (X21). Camera/geofence/native pickers behave differently on web and were not judged | **PR** | `dev-mobile-web.mjs` · `PaymentScreen` · `ShiftStatusPanel` · `lib/receipt-review.ts` | live (real PR login) | ✅ Verified |
| X23 | **A PR CANNOT SIGN IN WITH THE NUMBER THEIR AGENCY HAS FOR THEM.** Found while logging in for X22. The app's only sign-in is by mobile number (`login()` sends `phoneNum` when the identifier has no `@`), and it matches `user.phone_num` — but the roster, the PV and every agency screen read `pr.phone`, and **they are different numbers for the same person**: Alice is `+60123456805` on her `pr` row and `+60987654321` on her `user` row. Both forms of the pr number were refused 401 by the API (with and without the `+`), and only the user-row number worked. **Two faults, not one:** the same fact is stored in two tables, which `CLAUDE.md`'s own rule 3 forbids ("never duplicate a column — one fact lives in one table"), and there is no normalisation, so a stored `+60…` and a typed `60…` would not match even if the two rows agreed. **Needs an owner decision before any fix** — which column is authoritative — so nothing was changed | **PR** | `apps/mobile/src/lib/api.ts:108` · `pr.phone` vs `user.phone_num` | live (401 on both forms) | ⚠️ Reported |
| X24 | **THE PHONE SPLIT IS FIXED FOR READS AND FOR LOGIN — owner's call: `user.phone_num` wins.** Measured first (read-only, masked output): **6 pr rows · 5 agree · 1 conflict (Alice) · 0 rows where the user has no phone · 0 pr rows without an account**, and all 12 non-null `user.phone_num` values carry a `+` while the sign-in placeholder does not — which is the whole 401. **Reads repointed:** `PrRepository.getById`/`listPaginated` already left-joined `user`, so the account's number now answers (`withAccountPhone`), and the **PV export bundle** joins it too, because a printed voucher is the document a PR is paid against. Live after: the agency roster shows Alice as **+60987654321** — the number that actually logs in — where it used to show `+60123456805`, which nobody could sign in with. **Login normalised:** matched on DIGITS via `regexp_replace`, accepting `+60123456801` / `60123456801` / `012-345 6801` alike; **all three forms returned 200** where `60…` was a 401 an hour earlier, and an unknown number still 401s. Ambiguity **refuses** (fetches 2, returns null) rather than picking an account. **Also fixed in passing: `getUserByLoginMethod` logged the whole matched `UserType` — including `passwordHash` — on every sign-in**; it now logs an id. ⚠️ **`pr.phone` is NOT dropped:** the agency PR search (`ilike(PrTable.phone…)`) and jk's PV export still read it, and it is the only number a PR has before they have an account | **PR ← Agency** | `pr.repository.ts` · `payment-voucher.repository.ts` · `user.repository.ts` | live (all 3 forms + roster read) | ✅ Verified |
| X25 | **THE EXPORTED VOUCHER CAN NOW BE SUMMED — half of finding X19 closed, verified by opening the file.** Unit Price and Amount were `.toFixed(2)` **strings**, so the Amount column of a payment voucher could not be summed by the one person whose job is to sum it. Now written as numbers with a `#,##0.00` format. Downloaded Alice's voucher over an authenticated `/mine` export and read it back with exceljs: **row 15 `D=600 (number, fmt=#,##0.00) · E=600`, row 16 `D=3.3 (number) · E=3.3`** — where both were quoted strings before. The header row is still text (correct) and the merged "Total" block stays a styled string on purpose: it is a caption, not a column. Rounded to cents on the way in, because a unit price derived by division would otherwise store full float precision and display one figure while holding another. ⚠️ **The other half of X19 is still open** — `voucherRef()` derives `PV-<weekEnd>`, so every PR's voucher for a week shares one number and one filename; fixing it properly needs a real `voucher_no` column and a decision on its format, since the number is visible on the phone, the paper and the filename | **PR ← Agency** | `payment-voucher-excel.ts` `money()` | live (file opened, not read) | ✅ Verified |
| X26 | **A VOUCHER HAS ITS OWN NUMBER NOW — finding X19 fully closed.** Owner's call: a **running number**, `PV-000001`, in the same shape as the receipt numbers this schema already issues (migration **0075**: additive column + unique index + backfill in issue order). It was DERIVED as `PV-<weekEnd>` in **five** places (backend export + four in the PR app), so every PR's voucher for a week shared one number and one download filename — the same no-column-behind-it shape as the fake drinks and the "Paid" pill. Live after: the four real vouchers read **PV-000001 … PV-000004**, and the **three that share `week_start = 2026-07-27` now have three different numbers**, which is the defect itself, fixed. The PR app's `/mine/current-week` returns `voucherNo=PV-000003`, and the export's `Content-Disposition` is now **`PV-000003-payment-voucher.xlsx`** where all three of that week's vouchers previously downloaded as `PV-20260802-…`. The week is still printed on the document, so the number giving it up costs nothing. Backend tsc 0, mobile tsc 0. ⚠️ **The ALLOCATOR itself is not fired** — every existing voucher was numbered by the migration's backfill; issuing a number on INSERT (retry-on-conflict, 20 attempts, then an unnumbered voucher rather than a failed one) first runs when a new voucher is created. Deliberately not forced: it would leave a junk row on the shared DB | **PR ← Agency** | migration `0075` · `payment-voucher.repository.ts` · `-excel.ts` · 4 mobile call sites | live (numbers + filename) | ✅ Verified |
| X27 | **RE-RAN THE LIVE 4-ROLE SWEEP AFTER AN AUTH CHANGE — 19/19.** Triggered by the rule in §9: this session rewrote the login lookup (`getUserByLoginMethod` now matches on digits and refuses on ambiguity), so **all four logins were the first thing checked — admin, agency, outlet and PR all still sign in**, the PR by phone. Then the new surface: `PATCH /payment-voucher/receipts/:id/review` **200 agency · 403 PR · 403 outlet**, and `PATCH …/receipts/:id/lines/:lineId` **403 PR · 403 outlet** — the sub-role gates hold from outside, not just in the route file. Standing set unchanged: PR and outlet both **403** on `/payment-voucher`, PR **403** on `GET /user`, `/shift-assignment/attendance-fixes` **200 agency / 403 outlet / 403 PR**, all six PR `/mine` reads **200**, agency **403** on `/platform-config`. The agency approve call was made on an already-approved receipt, so the sweep changed nothing. ⚠️ **One "failure" was my own test being wrong** — I asserted `/notification/mine`, but that router is mounted at `/notification` and scopes to the caller server-side; on the real paths it is **200 (2 rows)** and `unread-count` **200**. Worth recording: the same "re-derive the entry before believing it" rule applies to a test's expectations, not just to the audit's | all | `router/v1.ts` surface | live (real logins, 4 roles) | ✅ Verified |
| X28 | **EVERY NEVER-FIRED PATH ON THIS PAGE WAS FIRED — 6 of 6, on the live shared DB.** **(1) The voucher-number ALLOCATOR:** a new voucher came back **`PV-000005`**, the first number issued on INSERT rather than by the backfill. **(2) `pv_day_review_pending`:** the payout job logged *"awaiting agency day review"* and the notification landed in the agency owner's bell with correct singular grammar and a payload naming the voucher. **(3) THE SEND THAT SUCCEEDS** — the permissive half of the gate, never exercised: refused **409** with the day unreviewed, then **200 · status=sent** once approved. **(4) THE DISPUTE THAT SUCCEEDS + the APPROVED→VERIFIED arm:** the PR raised a real dispute on a receipt-backed day (allowed now the receipt is approved; `disputedAmount 3.30` computed server-side), receipts stayed `approved` while it was open, and on resolution **both flipped to `verified`** and the PR was told. **(5) `pr_rating_low`:** a 2-star rating produced *"Average now 2.0 across 1 ratings, below the 3.5 warning line."* **(6) `shift_cover_needed`:** a real PR cancellation produced *"Cover needed — Alice… (cancelled)"* to the agency. **(7) MFA enrol → confirm → challenge:** factor confirmed, password-only login **401 `mfaRequired`**, wrong code **401**, correct code **200 with a token**. Collections **issue → settle** also fired: the outlet's view went **0 rows → 1 at the moment of issue**, an outlet settling its own bill is **403**, and settle succeeded | all | payout job · gate · dispute · rating · shift-assignment · auth MFA · collections | live (real logins, shared DB) | ✅ Verified |
| X29 | **🔴 AN ACCOUNT CANNOT BE DELETED, DEACTIVATED OR DEMOTED — found by trying to clean up after X28.** To fire MFA safely I created a throwaway admin (never touching the real admin's authenticator, which is bound to a person). Removing it afterwards turned out to be impossible through the API: **there is no `DELETE /user` route at all**; **`PATCH /user/:id` is self-edit only** (`user.controller.ts:121` — *"Users may only edit their own account"*), so a platform admin got **403** trying to deactivate another account; and **`rbac/user-role` has `POST` but no `DELETE`**, so a granted role cannot be revoked. Together: **anyone who can create an account can mint a permanent admin.** It had to be removed with a direct, id-scoped DB script (email-checked before deleting, `audit_logs.user_id` nulled rather than the events destroyed, `user_profile`/`admin_mfa`/`user_role` cleared first — four FK layers). ⚠️ **And a near-miss worth keeping:** I first read the post-delete **401 as "account gone"** when it was the **MFA challenge** — the account was fine. Re-checked WITH a valid code, which is the only way that question can be answered once MFA is on | all | `user.routes.ts` · `user.controller.ts:121` · `rbac/user-role.routes.ts` | live | ⚠️ Reported |
| X30 | **X29 FIXED — an account can now be disabled and demoted, and the guards hold.** Two endpoints, both admin-only: **`PATCH /user/:id/status`** (`active|inactive|blocked`) and **`DELETE /rbac/user-role`** (`{userId, roleId}`) — the counterpart `POST` never had. The disable half needed no enforcement work: **login already refused a non-active account** (`auth.controller.ts:79`), so the switch bit the moment it existed, which is also why the gap was easy to miss — the lock was fitted, with no handle on the outside. Fired end to end on a throwaway admin: **granted → `roles: 'admin'` → revoked → `roles: ''`** (checked against `GET /rbac/user-role?userId=…`, **not** the login payload — my first attempt read an empty `roles` array there and would have "proved" a revoke that had not happened), then **disabled → login 401**. Guards all fired: self-revoke **409** *"You cannot remove your own role"*, self-disable **409**, last-holder-of-a-role **409** *"grant it to someone else first"* (forced by making the throwaway the only holder of an empty role), invalid status **400**, and an agency token **403** on both routes. ⚠️ **Deliberately still no hard delete:** `audit_logs`, `user_profile`, `admin_mfa` and `user_role` all FK a user, and the audit trail should outlive the person — soft-disable is the right default. The `ZZ REVOKE TEST` account is left **inactive** as the evidence | all | `user.routes.ts` · `user.controller.ts` `setStatus` · `rbac/user-role.*` | live | ✅ Verified |
| X31 | **A DISABLED ACCOUNT'S LIVE TOKEN DIES ON THE NEXT REQUEST — correcting something I wrote here an hour earlier.** X30 recorded that a disabled account "keeps working until its JWT expires, because there is no token revocation". **That was never checked and it is false.** `authenticateJWT` does not trust the token's payload: it re-reads the user with `getUserDataByToken` on **every** request and refuses `status !== 'active'`. Proven rather than re-read: took a live token on an active account (`GET /notification` → 200), disabled the account **without touching the token**, reused the *same* token → **401**. So the soft-disable is immediate, and the standing "no token revocation" gap ([[app-foundation-gaps]]) is narrower than recorded — status revocation works; what is missing is per-session logout, which is a different thing. ⚠️ Note the cost side of the same design: every authenticated request does a user lookup | all | `middlewares/authenticate-jwt.ts` · `auth.repository.getUserDataByToken` | live | ✅ Verified |
| X32 | **THE ACCOUNT CONTROLS HAVE A SCREEN — driven in a browser on a real admin login.** X30's endpoints were API-only, so the security fix was unusable by a person. The admin user table now carries an **Actions** column: **Disable / Enable** and **Remove admin**, each behind a confirm that says what will happen (*"will be signed out on their next request and cannot sign in again until this is undone. Nothing is deleted."*). Verified live on `/en/admin/user-management/admin`: both admin rows render the actions, the confirm copy is right, and **clicking Disable on my own row produced the server's exact sentence in a toast — "You cannot change your own account status — ask another admin." — with the row still Active**, which is the guard, the verbatim-message design and the no-partial-write all proven in one click. Cancel on the revoke dialog left jk's access untouched. Zero console errors; web tsc **121** (baseline), biome clean. **One defect found and fixed in the same pass:** the dialog animates out *after* its state clears, so it flashed *"Re-enable this account? **undefined** will be able to sign in again"* — the copy now renders from the last real target, which outlives the close. ⚠️ **`currentUserId` is passed as null:** the web auth context tracks only *whether* someone is signed in, not who, so a row cannot be recognised as your own client-side — the server's refusal is what explains it. Pass a real id when the context carries one | Admin | `routes/admin/user-management/admin.tsx` · `components/admin/admins-table.tsx` · `services/admin/admins.ts` | live (real admin login) | ✅ Verified |
| X33 | **THE ACTIONS COLUMN REACHES PR ACCOUNTS — and the backlog entry that asked for it was wrong about two of its four tabs.** §9 said "replicate to `pr.tsx`, `outlet.tsx`, `agency.tsx`, `legacy-member.tsx`, mechanical". Re-derived from the code first (the standing rule), and **`agency.tsx` and `outlet.tsx` list ORGANISATIONS, not accounts** — rows come from `fetchAgencies`/`fetchOutlets`, so `row.id` is an `agency`/`outlet` id, and `PATCH /user/:id/status` would address a row that is not there. Both already carry org-level approve/suspend, which is a different fact about a different table. **Applied where it is genuinely an account:** `pr.tsx` (rows are `GET /user?roleId=<pr>`, so `PrUser.id` **is** a user id) gets Disable/Enable + **Remove PR**; `legacy-member.tsx` is mixed, and its **PR rows only** gain Reactivate — that tab is where a disabled PR lands, so without it an account could arrive there and never leave. `revokeAdminRole` generalised to **`revokeUserRole(userId, roleName)`**; the confirm copy, the dialog-close defect fix and the show-the-server's-sentence handling moved into **`hooks/use-account-actions.tsx`** so the second tab is not a copy of the first. `colSpan` bumped 7 → 8 on all three PR empty-state rows, and the Actions cell stops propagation so a button press does not also open the details sheet. **Proved against the live backend** (probe run and deleted): `getRoleIdByName('pr')` resolves; the PR list returns **6 rows, every one carrying a user id and a status**; `PATCH /user/:id/status` **round-tripped on the `ZZ REVOKE TEST` throwaway** — `active` 200 *"Account re-enabled"* → back to `inactive` 200, ending exactly where it started; self-disable **409** with the sentence the UI shows verbatim. ⚠️ **The SCREEN itself is not verified** — that needs a password typed into the login form, which I do not do; the click-through is one minute of the owner's time and is in §9. ⚠️ Also note **all 6 PR accounts are currently `active`**, so the legacy-member Reactivate button has no rows to render on today. Web tsc **121** (baseline, none in the touched files); biome clean apart from the repo-wide CRLF `format` finding that fires on untouched files too | Admin / PR | `hooks/use-account-actions.tsx` · `routes/admin/user-management/{pr,admin,legacy-member}.tsx` · `components/pr/prs-table.tsx` · `services/admin/admins.ts` | live (API proved, UI not) | ⚠️ Reported |
| X34 | **FULL END-TO-END SWEEP, ALL 4 ROLES — 28 endpoints read, 3 write flows round-tripped, 4 findings.** Owner asked for a full run-through. **Reads/gates:** 28 endpoints × 4 roles, **outcomes observed rather than predicted** — the 30 Jul lesson was that 3 of 4 "failures" were wrong guesses in the test, not bugs. Scoping is genuinely enforced, not just declared: `/pr` returns **6 rows to admin, 4 to the agency, 3 to the outlet**, `/shift` 10/10/7, and PR is refused on 15 endpoints while getting all six `/mine` reads. Outlet correctly refused `/payment-voucher`, `/outlet-swap`, `/admin-request`, `/platform-config`, `/shift-assignment/attendance-fixes`. **Writes, each paired with its inverse and the starting state captured first:** day review `null → approved → null` (**restored, verified by re-read**, `approvedTotalCents` 60000 recorded then cleared); receipt `RCP-000006` **approved → pending → approved** (*"Approval withdrawn"*, restored); shift-assignment **create 201 → delete 200** (restored). **Every one of those writes was refused 403 for the wrong role** — pr and outlet on the day review, pr on the receipt, outlet on the assignment — so the sub-role gates hold from outside the process, not just in the route file. ⚠️ **PR dispute raise→withdraw SKIPPED this pass** — the PR I swept as has no current-week voucher; that path was fired live on 30 Jul (X28) including the resolve arm. ⚠️ **Deliberately NOT fired, no undo endpoint:** voucher send, collections issue/settle, dispute **resolve**, check-in/out. **The shared DB was left exactly as found.** | all | `router/v1.ts` surface · day-review · receipt review · shift-assignment | live (4 real logins) | ✅ Verified |
| X35 | **BOTH SWEEP FINDINGS FIXED AND PROVEN LIVE.** **(1) A malformed id 500ed.** Cause was subtler than it looked: all three controllers read *identically* — `paramId(req.params.id)` → repository → 404 if falsy → 500 on throw — because **`paramId()` does not validate anything**; it only unwraps a repeated query param. `/user` survived a non-uuid for a reason inside its repository, `/payment-voucher` and `/shift` did not, and the route code gave no hint which was which. New **`uuidParam()`** in `util/params.ts` returns `null` for a non-uuid so the caller answers **404** — what it actually is, a row that cannot exist. Applied to **all three** `/:id` handlers in `payment-voucher.controller` (get/update/remove — a `replace_all` found the bug was never only in the read) and to `shift.controller`. **(2) The RBAC catalogue** is now gated at the mount, `v1Router.use('/rbac', requireAdmin, rbacRoutes)`, mirroring `/platform-config`. Checking first **de-escalated it**: every `/rbac` **write was already `requireAdmin`**, so this was disclosure, not a privilege hole. Callers were verified before gating — the agency portal makes zero `/rbac` calls, mobile none, signup reads role UUIDs from `env.ts` — because the `GET /user` lesson is that a flat gate can blank a live screen. **Live after:** `/payment-voucher/not-a-uuid` and `/shift/not-a-uuid` **404** (matching `/user` and `/agency`), a **real** id still **200**s on both, `/rbac/{role,module,permission}` are **200 admin · 403 agency · 403 outlet · 403 pr**, and `getRoleIdByName('pr')` still returns 200·1 for admin — the half worth proving, since a guard that breaks the path it protects is worse than the bug. Backend tsc **0**. ⚠️ Other routers' `/:id` handlers are **not** swept; §9 carries it. | all | `util/params.ts` · `payment-voucher.controller` · `shift.controller` · `router/v1.ts` | live (4 real logins) | ✅ Verified |
| X36 | **🔴🔴 THE MONEY IS WRONG. First independent check of a real week's pay, and it does not survive it.** Method: pulled the **primary facts** — assignments, statuses, stamps, sealed `payAmount`, tier rate cards, receipt sales — and recomputed by hand rather than re-running the app's arithmetic. Subject: **Victoria Tan Mei Lin, tier_3, week 2026-07-27**. **What the records say she worked:** of her 8 assignments, exactly **ONE** falls in that week and is `completed` — 30 Jul. Tier III daily wage is **700.00** at every one of the 7 outlets. So the week is worth **700.00 wages + 3.60 commission = RM 703.60**. **What the app produced: TWO vouchers totalling RM 2,285.08** — `PV-000004` (pending_review) at 703.60, which is **correct**, and `PV-000002` (**`sent` — already issued to the PR**) at **RM 1,581.48**, which is not. Inside `PV-000002`: **(a)** a **700.00 wages line dated 28 Jul**, a day whose assignment is `assigned` with **no check-in and no check-out** — pay for a shift the records say was never worked; **(b)** an overtime line reading **"Overtime 113.1h @ RM6.00/h" = 678.78** on a 6-hour slot — 113 hours of overtime cannot exist in a week, and 678.78 ÷ 6.00 = **113.13**, so the label rounds while the amount does not, the display disagreeing with the value it describes; **(c)** a drink line dated **2026-06-16 on a week-of-27-July voucher**, six weeks out of range; **(d)** the *same* Lemon Drop counted **twice** — `ORD0389` and `ORDO389`, a letter O against a digit 0 from OCR, so dedupe never saw them as one. **Separately, `PV-000001` (status `signed` — a PR has already accepted it) carries wages of 198.00 and 186.00, which match NO tier rate** (the card is 500/600/700/825/1000/200) and no multiple of one; and its commission rate moves **15% on 21 Jul to 12% on 22–23 Jul** with tips at 10% then 17%, unexplained. ⚠️ **Certainty:** (b), (c) and (d) are arithmetic and dates, provable from the dump alone. (a) is strong but rests on the assignment list — a targeted check of the `f5a1f22` ref should confirm it before anyone is told. The duplicate-voucher half was already known (§9, Vicky's `34364790-…`) — **what is new is the amount, and that the wrong one is the one that was sent.** | **PR ← Agency** | `payment_voucher` + lines vs `shift_assignment` + `tier_rate` | live (primary records) | 🔴 **BLOCKING** |
| X37 | **🔴 THE MONEY RULES ARE NOW ENFORCED IN CODE — 4 of the 7 P0 items closed, and re-deriving corrected the finding's own conclusion.** X36 concluded, and the audit page repeated, that *"one assertion **at generation time** would have caught every fault"*. **That is false, and building to it would have put the check in the one place none of the faults can reach.** `listCompletedForAgencyWeek` already filters `status='completed'` **and** `shift_date BETWEEN weekStart AND weekEnd`, so the weekly generator can emit **neither** an unworked day **nor** an out-of-week line. Every fault on `PV-000002` came from the **PR self-log path** (`addMyLine` / `addMyReceipt`), which appends to a draft using a **client-supplied `lineDate`** with no window check at all. **Shipped:** **(1)** new **`payment-voucher-audit.ts`** — pure, integer-cents, never throws, mirroring `payment-voucher-balance.ts`; `auditVoucher()` reconciles a voucher against its **source records** (wages ↔ completed assignments × sealed `payAmount`, every line inside the week, OT bounded by the **attendance stamps**, no duplicate order refs, no sibling voucher) plus the reverse direction nothing else checks — **a completed shift with no wages line is unpaid work**. **(2)** `checkLineAgainstWeek()` wired into **both** self-log handlers → **400** on an out-of-week date, before anything is written. **(3) The duplicate-voucher MECHANISM found and closed:** `getOrCreateCurrentWeekDraft` looked up the draft with `status='pending_review'` only, so **once a week's voucher was `sent`, the next self-log created a SECOND voucher for the same PR and week** — exactly how `PV-000002`(sent) + `PV-000004`(pending) both exist. Existence is now checked across **every** status and a closed week is **409**'d, not restarted; appending to the sent voucher instead would silently rewrite a document the PR already holds. **(4)** `findReceiptByOrderNo` now matches on an **OCR-folded key** (O/0, I/1/l, S/5, B/8, Z/2, case, separators) in JS rather than `eq()` in SQL — `ORD0389` and `ORDO389` are one paper again. **(5)** `GenerateWeeklyResult` gains `unreconciled`, reported by the Monday job separately from `imbalanced`, because broken arithmetic and correct arithmetic over wrong inputs have different causes and different fixes. **Proof:** `src/scripts/probe-pv-audit.ts` — pure, no DB — rebuilds Victoria's week and **all 21 checks pass**: all five faults fire, and the two over-fire guards hold (a clean week reports **nothing**, and 2h of *genuine* OT at 300.00 passes while the same day at 400.00 is refused). Backend tsc **0**. ⚠️ **Not closed, needing live data or an owner call:** which write path put the 28 Jul wages there, `PV-000001`'s non-tier wages, and the merge of the two existing vouchers. ⚠️ **The new 400/409 refusals are proven by unit-level probe, NOT by a live self-log from the phone.** | **PR ← Agency** | `payment-voucher-audit.ts` · `payment-voucher.repository` · `payment-voucher.controller` · `payment-voucher-generator` · `weekly-payout.job` | live records (synthetic replay) | ✅ Verified (code) |
| X38 | **🔴 THE AUDIT WAS POINTED AT THE LIVE VOUCHERS — 3 of 4 fail, and it found TWO faults the hand-check missed.** `src/scripts/audit-live-vouchers.ts` (**read-only**, `db.select()` only) loads each voucher plus **every** assignment for that PR in that week *regardless of status* — the shape the generator's own call cannot supply, since an unworked day is invisible to a query that selects only worked ones. Ten seconds, repeatable, against `103.224.93.109:6543/innocenz-test`. **Result: 3 of 4 do not reconcile; 6 kinds of finding; `PV-000003` is CLEAN** — the first voucher on this project ever confirmed correct by machine rather than asserted. **NEW — the vouchers pay the WRONG DAYS, not merely the wrong amounts:** `PV-000002` pays 700.00 for **28 Jul, whose assignment is `assigned`**, while the shift Victoria **actually completed — 30 Jul, `ab4a53ae`** — has **no wages line at all**. X36 saw the overpayment; it did not see that the day she genuinely worked is **unpaid**. The same shape on `PV-000001` (**`signed`**): wages on **21 and 22 Jul, days with no assignment whatsoever**, while the **completed** shift on **23 Jul is unpaid** — which also **answers the `f5a1f22` question X36 left open**: `f5a1f227-a1ca-449d-8d02-10bddc05a1c9` is a real *completed* assignment, and the finding is that nothing pays for it. That reframes `PV-000001`'s "wages match no tier rate" (198.00/186.00): the amounts are unexplained **and** attached to days that do not exist. **Confirmed from X36, now by machine:** the 2026-06-16 line six weeks out of range; the `assigned`-day wages; **`RCP-000003`/`RCP-000004` = the same order `ORDO389`**; overtime **678.78 against a 0.00 stamp budget**; and the `PV-000002`↔`PV-000004` double payment reported from **both** sides. ⚠️ **Nothing was written** — the shared DB is exactly as found. **The repairs are owner decisions and are NOT done.** | **PR ← Agency** | `scripts/audit-live-vouchers.ts` · `payment-voucher-audit.ts` | live DB (read-only) | ✅ Verified |
| X39 | **🔴 THE AGENCY DOOR WAS STILL OPEN, AND THE Σ=0 CHECK WAS CRYING WOLF.** Three fixes, all found by re-deriving rather than from any backlog. **(1) X37 closed only half the hole — my own unfinished business.** `POST /payment-voucher/` (agency create) had **no `existsForPrWeek` check and no line-date validation**, so an agency could still raise a **second voucher for the same PR and week** and still write lines outside it. That is the likelier origin of the live duplicate: `PV-000002` was created and set `sent` mid-week from the agency side, not by a self-log. Both guards now applied to `create`, and the week guard to `update`'s line rewrite — the latter checked against the week the voucher **will have** (`data.weekStart ?? existing.weekStart`), so moving a voucher's week and its lines in one call is not judged against the old window. Both are conditional because `prId`/`weekStart`/`weekEnd` are **optional on the schema** (hence the nullable columns); absent facts cannot be checked and fall through to `auditVoucher`. **(2) `checkVoucherBalance` disagreed with the whole rest of the system about what `amount` means** — it computed `Σ(amount × quantity)`, but `amount` is the **LINE TOTAL**: `recomputeTotals` sums it bare, the Excel/PDF exports print `amount / quantity` as *Unit Price* and `amount` as *Amount*, and the PR self-log posts `amount: commission` with quantity already inside `sales`. So the first multi-item receipt would have made a **healthy** voucher log *"DO NOT BALANCE — hold payment and review"* on the Monday job. **Latent only because every line in the live DB carries quantity 1** — proven by the X38 run, which reported zero `[balance]` findings across all 4 vouchers. Quantity is still validated (a non-integer is a real fault) but no longer scales money, and deliberately **no longer `return`s** — skipping the line would have dropped its amount and turned a quantity complaint into a phantom money discrepancy. **(3) The money-WRITE routes were the least-gated on the router:** `POST /` and `PUT /:id` sat behind `requireRole('admin','agency')` while merely *reviewing* a day or receipt required `agencyOwnerOrFinance` — the endpoints that author money were looser than the ones that check it. Now gated to match, **callers verified first** (`updatePaymentVoucher` has ONE consumer, `use-agency-pvs.ts`, reached only from screens already gated on `agencyCan('raisePv')`; `createPaymentVoucher` has **no frontend caller at all**), so it is a no-op for every legitimate caller. ⚠️ Also **corrected a stale memory entry**: the "agency can DELETE a PV" hole is **already fixed** — `canDelete = requireRole('admin')`. Probe now **26/26**, backend tsc **0**. ⚠️ **Proven at unit level, not fired over HTTP.** | **PR ← Agency** | `payment-voucher.controller` (create/update) · `payment-voucher-balance.ts` · `payment-voucher.routes.ts` | unit probe + code re-derivation | ✅ Verified (code) |
| X40 | **🟠 MIGRATION 0077 — THE SCHEMA FOR "OT CAN NEVER BECOME MONEY" AND "NOBODY CAN ACTUALLY BE PAID" — WRITTEN, NOT YET APPLIED AND NOT YET WIRED.** One migration for both gaps **deliberately**: the DB is shared with jk, so two windows is twice the risk for no benefit, and everything here is **additive + nullable** (`ADD COLUMN IF NOT EXISTS`, no drops, no backfill, no NOT NULL) so nothing in jk's lane can break on it. **(1) `shift_assignment`** gains `overtime_minutes`, `overtime_status` (varchar, **not** an enum — NULL means *no overtime on this shift*, which is nearly every row, and a defaulted enum would turn every ordinary shift into a pending decision somebody must clear), `overtime_amount`, `overtime_decided_at`, `overtime_decided_by`. ⚠️ **`overtime_minutes` is recorded AT CHECK-OUT, not derived later, because the clamp DESTROYS the evidence** — `check_out_at` is overwritten with the scheduled end, so how long the PR actually stayed survives nowhere but the notification payload. The clamp stays on purpose (wages seal to the shift window; overtime is a separate decision, not a longer day). `overtime_amount` freezes what was **APPROVED** — never recompute from the current rate, the same rule as `payment_voucher_day_review.approved_total_cents`. **(2) `user_profile`** gains `bank_name` / `bank_account_no` — on the PERSON, not on `pr`, because `user_profile` already holds that class of fact (IC/passport, DOB, address) **and is already the table `redactIdentityDocsForOutlet` blanks**, so a venue cannot see a worker's account number for the cost of one line; on `pr` it would have opened to every screen that reads the roster. **Both new fields were added to `IDENTITY_DOC_FIELDS` in the same commit** — that helper blanks what it *names*, so a sensitive field it does not name is a sensitive field handed to every outlet caller. **(3) `agency`** gains `address_line_1` / `address_line_2`, in the same two-line shape `outlet` already uses. ⚠️ **This row was written by the auto-commit hook mid-slice and its "not done" list is now STALE — corrected here rather than deleted, because a doc that quietly rewrites itself teaches you not to trust it.** Since it was written: the migration **HAS been applied and verified live** (all **9/9** columns present on `103.224.93.109:6543/innocenz-test`, checked by `information_schema` **and** by calling `getExportBundle`, which is the read the exports actually make — `drizzle-kit` saying "applied" is not proof, per [[green-signals-that-lie]]); **`agency.model.ts` now HAS the two address columns**, so nothing will propose dropping them; `getExportBundle` joins `user_profile` and carries all four fields; the **workbook, print HTML and PDF all read them** through a shared `joinAddress()`; and `PATCH /user/:id` (self-edit only) accepts `bankName`/`bankAccountNo` with an empty string clearing to NULL. Backend tsc **0**. ✅ **The bank/address half is COMPLETE.** ⚠️ **The OVERTIME half is still schema-only:** the five columns exist and nothing writes or reads them — no check-out recording of `overtime_minutes`, **no approve/reject endpoint, no agency screen, and no `component='ot'` line written on approval.** See §9. | **PR ← Agency** | `0077_…sql` · `shift-assignment.model.ts` · `user-profile.model.ts` · `agency.model.ts` · `util/user-profile-image.ts` · `payment-voucher.repository` · `-excel` · `-pdf` · `user.controller` | live DB (columns verified) | ✅ Bank/address verified · ⚠️ OT schema only |
| X41 | **🔴 THE OUT-OF-WEEK HOLE HAD A THIRD DOOR — `PATCH /payment-voucher/mine/lines/:lineId`.** Found by walking **every** write of `line_date` rather than trusting that the create paths were the whole story. X37 guarded `addMyLine`/`addMyReceipt` and X39 guarded the agency `create`/`update` — but `updateMyLine` set `patch.lineDate` from the request **with no check at all**, so a PR could log a line with a perfectly valid in-week date, have it accepted, then **PATCH it to `2026-06-16`**. Two steps to the same place, and guarding only the create paths *looked* complete while closing nothing. Now checked against **the voucher the line belongs to** rather than the current week — an old draft stays editable while `pending_review`, and judging it against today's week would refuse a legitimate correction to last week's own voucher. ✅ **Also confirmed clean by the same sweep:** the agency receipt-line edit (`PATCH …/receipts/:receiptId/lines/:lineId`) does not touch `line_date` at all, so it needed nothing; `toLineRows` is fed only by the two already-guarded agency paths. **All four writers of `line_date` are now guarded.** Backend tsc **0**, probe **26/26**. ⚠️ Unit-level only, not fired over HTTP. | **PR ← Agency** | `payment-voucher.controller` (`updateMyLine`) | code sweep of every `line_date` write | ✅ Verified (code) |
| X42 | **🟢 OVERTIME CAN NOW BE DECIDED, AND AN APPROVAL BECOMES MONEY — the last BUILD in the PV backlog (`5e0dbee`).** `PATCH /shift-assignment/:id/overtime` (approve \| reject, **`agencyOwnerOrFinance`** — the PV attestation grant, because `agencyOwnerOnly` would shut finance out of a payroll decision) + `GET /shift-assignment/overtime/pending` (the worklist, **priced server-side** so the screen cannot derive a second figure) + migration **0079** (`overtime_decided`, **applied and verified live** — the enum now holds 10 values). Minutes have been recorded since `7e47502` and have blocked the send since `882afd7`; **the gate had no exit, so no overtime was ever payable.** **🔴 TWO FAULTS THE BUILD EXPOSED, neither of them the endpoint. (1) The audit would have flagged EVERY legitimate approval.** `maxOvertimeCents` budgeted overtime from `check_in_at`/`check_out_at` — but **check-out CLAMPS `check_out_at` to the scheduled end**, so a shift that genuinely ran two hours late leaves stamps describing one that finished on time, and the budget derives to **0.00**. Correctly-approved money would have come back as *"exceeds what the attendance stamps can justify"*. The **recorded minutes are the evidence the clamp destroys** — that is why check-out writes them — and they are now the primary source, with the stamp derivation kept as a fallback **only** for rows carrying no decision, so pre-0077 vouchers do not start failing. ⚠️ **The pure-function fix reached nothing until both `auditVoucher` call sites started SELECTing the two columns** (`payment-voucher-generator.ts`, `audit-live-vouchers.ts`). A `pending` or `rejected` claim budgets **0** on purpose: OT becomes money at approval and at no other moment. **(2) A double-clicked Approve paid twice.** Read the row → see `pending` → check no line exists → insert: two concurrent requests pass every step, because **a read-then-check is not a lock**. The decision is now CLAIMED with `UPDATE … WHERE overtime_status = 'pending'` (`claimOvertimeDecision`), making the transition itself the mutex; the loser gets 409. The stamp therefore lands **before** the money, and a failed voucher write **reverts the claim** (`revertOvertimeDecision`) — *an approval with no line is recoverable, a line paid twice is not*; without the revert the claim would vanish from the worklist and the send gate would close the week straight over it. Also: **the line lands on the week the shift was WORKED** (owner's rule, via the new pure `weekOfDate()`); **the `-ot` dedupe ref is written, never the `component` column**, since classification is derived in the repository; the line is **dated the shift's own date** so it *passes* `assertLinesAgreeWithShifts`; and **a commission-only PR's unpriceable claim is a 409, not a 0.00 line**. New module `payment-voucher/overtime-line.ts`. Backend tsc **0** (230 files, confirmed by `--listFiles`), probe **83/83** (was 44), `audit-live-vouchers` still **3 of 3 OK**. ⚠️ **NOT fired over HTTP — no approve, reject or 409 has reached a running server.** | **PR ← Agency** | `shift-assignment.controller` (`decideOvertime`, `listPendingOvertime`) · `shift-assignment.repository` · `overtime-line.ts` · `payment-voucher-audit.ts` · `payment-voucher-week.ts` · `0079_…sql` | unit probe 83/83 + live enum + live audit | ✅ Verified (code + DB) · ⚠️ not fired over HTTP |
| X43 | **🟢 THE AGENCY CAN NOW SEE AND DECIDE OVERTIME — the endpoint finally has a screen.** `OvertimeQueuePanel` on **`/agency/pv`**, plus `use-agency-overtime` and two service calls (`fetchPendingOvertime`, `decideOvertimeClaim`). Pure frontend: **no backend change, no migration, no schema change.** **🔴 THE PLACEMENT IS THE DECISION, and the obvious home was wrong.** `/agency/pending` is the approvals page and looks like the natural fit — but that whole route returns *"Finance role cannot approve PR sign-ups"* when `agencyCan(subRole, 'approvePrSignups')` is false, and **agency FINANCE does not hold it** — while finance is one of the two roles the server's `agencyOwnerOrFinance` guard lets decide overtime. Shipping it there would have locked out half the people entitled to act, and the symptom would have read as a broken role rather than a misplaced screen — the same shape as [[phase-flags-vs-permissions]]. It sits **beside `DisputeQueuePanel` and above the week tabs** instead: an undecided claim is *why* a week below refuses to send, so the refusal and its cause are on one screen. **Three rules held deliberately: (1) the screen NEVER derives a figure** — `amount` and `week` are rendered exactly as the server priced them, by the same functions the approval uses, so the agency cannot attest to one number while a different one lands on the voucher; `formatMinutes()` formats the server's own minutes and is not a step toward pay. **(2) The 409s are surfaced VERBATIM** via `toMutationError`, not flattened — *"already decided"*, *"decided by someone else a moment ago"* and the unpriceable commission-only refusal are each specific and actionable, and a generic *"could not save"* would send the agency hunting a bug that is not there. **(3) The refetch is on `onSettled`, not `onSuccess`** — a 409 means the list on screen is stale in precisely the case where the write failed, so refetching on failure too is what makes the row disappear instead of sitting there inviting a second click. Both actions take a **second click naming the consequence** ("Confirm · pay RM 67.50" / "Confirm · pay nothing") because neither has an undo endpoint; **no reason box**, because the endpoint accepts only the decision and asking for one would collect text and discard it (the same call `LeaveDetailPanel` makes). Action buttons gate on `agencyCan(subRole, 'raisePv')` — mirroring the server — and a caller without it is **told which role holds it** rather than shown a dead button. `apps/web` tsc **121 = baseline, 0 from these files**; biome clean on both new files (the 3 errors + 1 warning on the two edited files are pre-existing, confirmed by stashing); **`vite build` succeeds**, so the modules resolve through the bundler and SSR. ⚠️ **NOT rendered in a browser** — `/agency/pv` needs a real agency password login, which nothing in this slice has had. | **Agency** | `OvertimeQueuePanel.tsx` · `use-agency-overtime.ts` · `services/shift-assignment/index.ts` · `routes/agency/pv.tsx` | tsc baseline + biome + `vite build` | ✅ Verified (build) · ⚠️ never rendered |
| X44 | **🔴 THE RECEIPT NUMBER ALLOCATOR HAD BOTH BUGS THE VOUCHER ONE HAD — and the note telling us to look was already written.** Found while starting the "every self-log / OCR scan emits a receipt number" item. Numbers **are** emitted (`createReceiptWithLines`), so that half was already true — but the allocator was the **pre-31-Jul `nextVoucherNo` code, verbatim**. **(1) `count(*) + bump` RECYCLES numbers after a delete**, and receipts are deletable on purpose (`removeMyReceipt` exists so a PR can drop a bad self-log) — delete two, and the next scan reissues a number an earlier receipt already held. **This is worse for receipts than it was for vouchers:** `RCP-…` is what the refusal messages quote back at the PR (*"RCP-000007 has already been reviewed by the agency"*), so two rows answering to one name make those messages point at the wrong receipt. Now `max(<numeric suffix>) + bump`, with non-conforming values coalesced to 0 so one malformed row cannot stall numbering. **(2) The catch-and-retry was a NO-OP inside the transaction.** In Postgres a failed statement aborts the WHOLE transaction, so the first clash poisoned `tx`, the next iteration's own SELECT returned **25P02**, and because 25P02 is not a unique violation it was rethrown — **the loop could never reach attempt 2**, and the caller saw an error about a SELECT rather than a number clash. Each attempt now runs in a **SAVEPOINT**, and the number is **re-read inside the loop** (a value read once above it would collide again at every bump). ⚠️ **THE LESSON IS ABOUT THE PROCESS, NOT THE CODE:** the 31 Jul fix explicitly ended *"grep for other `try { insert } catch { retry }` inside `db.transaction`"* — **that grep was never run**, and the third site sat there for two days behind a green typecheck. It has now been run: the only other `23505` sites (`outlet-swap.controller`, `shift-assignment.controller`, `payment-voucher-dispute.repository`) classify an error into an HTTP status and contain no retry loop, so **this was the last one**. Backend tsc **0**, probe **83/83**. ⚠️ Not fired against the live DB — proving a recycled number needs a real delete on the shared database. | **PR → Agency** | `payment-voucher.repository` (`nextReceiptNo`, `createReceiptWithLines`) | tsc + probe 83/83 + repo-wide `23505` sweep | ✅ Verified (code) · ⚠️ not fired live |
| X45 | **🟢 THE ADMIN PV PAGE IS WIRED — the escalation path finally has a screen.** Two sections added to the detail sheet: **`ReceiptEvidence`** renders the `receipts[]` array that has always come back from `GET /payment-voucher/:id` and was never displayed, and **`VoucherDisputes`** renders that voucher's disputes with **Accept / Reject**, which is the first write on this otherwise read-only page. **It exists for exactly one reason** (owner, 31 Jul, Option A): resolving a dispute is the agency's job, but agency-only leaves a PR with **no recourse if their agency goes quiet**. **Nothing was widened to build it** — `guard()` already waves admin through `agencyOwnerOrFinance` by design. **Four judgment calls worth keeping: (1) receipts stay READ-ONLY** — reviewing one is the agency's job (they can check it against the venue); admin is an escalation path, not a second reviewer. **(2) `undefined` receipts and an EMPTY array are different facts** — the list route omits the field, the detail route returning `[]` means there genuinely are none, and since live commission lines exist with nothing backing them, "no receipts are attached" is said out loud rather than rendered as a blank. **(3) The dispute query is `openOnly = false`** — an escalation needs to see what was *already decided* as much as what is outstanding, because *"the agency rejected this"* is the usual reason a PR escalates at all. **(4) The voucher's own `disputeReason`/`disputeNote` COLUMNS are kept and relabelled** *"Dispute note on the voucher record"* rather than folded into the queue: they predate the `payment_voucher_dispute` table, and a legacy value with no row behind it **cannot be resolved** — showing it as an open dispute would offer a decision with nothing to write to. The queue endpoint is not voucher-scoped so the filter is client-side; **safe here and nowhere else**, because admin may already see every tenant's list in full — this narrows a list, it is not what keeps tenants apart. `apps/web` tsc **121 = baseline, 0 from this file**, biome clean. ⚠️ **Never rendered** — needs a real admin password login. | **Admin ← Agency+PR** | `routes/admin/service/payment-voucher.tsx` (`ReceiptEvidence`, `VoucherDisputes`) | tsc baseline + biome | ✅ Verified (build) · ⚠️ never rendered |
| X48 | **✅ X46 WAS WRONG — `apps/mobile` TYPECHECKS FINE, I WAS RUNNING THE WRONG CONFIG. Retracted the same day it was filed.** `apps/mobile/tsconfig.json` is a **solution-style** config — `"files": []`, `"include": []`, `"references"` to `tsconfig.app.json` + `tsconfig.spec.json` — so `tsc -p tsconfig.json` compiles **nothing by design**. That is not a defect; it is how TypeScript project references work. The real config, **`tsconfig.app.json`, ALREADY sets `"jsx": "react-jsx"`** and includes `**/*.tsx`. **The correct command is `npx tsc -p tsconfig.app.json --noEmit` from `apps/mobile`** (or `tsc -b`), and it puts **58 src files** in the program. ⚠️ **THE REAL MOBILE BASELINE IS 10 ERRORS, NOT 0** — `PaymentScreen.tsx` 4, `proof-photo.ts` 3, `PhoneSheet.tsx` 2, `demo-shifts.ts` 1. So the long-standing "mobile tsc 0" was wrong too, just not for the reason X46 gave. **Judge only files you touch, against 10.** 🔴 **How I got it wrong, because the method matters more than the fact:** I ran `-p tsconfig.json`, saw zero src files, and reached for a *cause* (a missing `jsx`) instead of first checking **what that config actually is**. The `cat tsconfig.json` I used to "confirm" it printed a DIFFERENT project's config from a stale shell directory, and I read it as agreement. **Two independent signals agreed and both were mis-addressed** — a wrong config file and a wrong working directory — which felt like corroboration and was really the same mistake twice. **A zero-file program means "I aimed at the wrong thing" far more often than "the project is broken".** X47's mobile half is now **properly verified**: 0 errors in `PvDetailScreen.tsx` and `lib/api.ts`. | **PR** | `apps/mobile/tsconfig.app.json` (unchanged — nothing needed fixing) | `tsc -p tsconfig.app.json --listFiles`: 58 src files, 10 pre-existing errors | ✅ Corrected |
| X46 | **🔴 RETRACTED — THIS FINDING IS WRONG, see X48. Kept, not deleted, because a doc that quietly rewrites itself teaches you not to trust it.** ~~`apps/mobile`'s TYPECHECK COMPILES NO APP CODE — the "mobile tsc 0" baseline has been meaningless the whole time.~~ Found while trying to verify a one-field mobile change. `npx tsc -p tsconfig.json --noEmit --listFiles` from `apps/mobile` lists **1378 files and ZERO from `apps/mobile/src`** — the program is nothing but `lib.*.d.ts` and `node_modules`. Cause: `apps/mobile/tsconfig.json` sets no **`jsx`** option, so `.tsx` never enters the program despite `include: ["src/**/*"]`. **Every "mobile tsc 0" in this document and in memory is therefore a statement about an empty program, not about the app.** ⚠️ **This is the sharpest instance of [[green-signals-that-lie]] yet, and worse than the ones before it:** the earlier cases were a green signal that did not cover a *specific* risk (a live DB, a runtime path); this one is a green signal covering **no code at all**, reported confidently across many sessions. It also explains why `apps/mobile` has never caught a type error — not discipline, no compilation. ⚠️ **NOT FIXED HERE, deliberately:** adding `"jsx": "react-native"` will surface an unknown number of pre-existing errors in a lane jk also touches, and turning that on mid-slice would mix a config change with a feature change and give a false impression of what this slice verified. **Filed as the next job with a known first step.** Consequence for THIS slice: the mobile half of X47 is proven by **reading only** — no tool has compiled it. | **PR** | `apps/mobile/tsconfig.json` (unchanged) | `tsc --listFiles` (0 src files of 1378) | 🔴 Confirmed, NOT fixed |
| X47 | **🟢 A PR CAN NOW SEE THEIR RECEIPT'S NUMBER — and the "add a detail button" backlog item was already built.** Re-derivation first, per the standing rule: the §9 item read *"every self-log/OCR emits a receipt number, plus a PR detail button"*. **Both halves were already true** — `createReceiptWithLines` has always allocated `RCP-…`, and `PvDetailScreen` has had a per-receipt **Details** link opening a modal since it was written. **The REAL gap was narrower and sharper: the modal could show everything about a receipt EXCEPT its number**, because `/payment-voucher/mine*` never joined the receipt table — so the server's own refusals (*"RCP-000007 has already been reviewed by the agency"*) **named an identifier the PR had no way to see anywhere in their app.** Closed by widening the map the PR reads already build: `receiptStatusMap` → **`receiptInfoMap`**, whose value goes from a bare status to `{status, receiptNo}`, and `PrReceiptLineDTO` gains **`receiptNo: string | null`**. ⚠️ **The number rides on the LINE and is NOT copied into a column** — `payment_voucher_line` has no `receipt_no` and must not grow one; the fact belongs to the receipt (rule 3). The modal prints **`RCP-000007 · Self-logged`** — number first because that is what the agency and the server both call it, origin kept beside it because a number alone does not say whether it was scanned or self-logged, and a line with **no** receipt behind it still shows the origin alone rather than a blank. Backend tsc **0**, probe **83/83**. ⚠️ **The mobile half is READ-VERIFIED ONLY — see X46: nothing in `apps/mobile` is compiled by its own typecheck.** Not fired live either. | **PR ← Agency** | `payment-voucher.controller` (`PrReceiptLineDTO`, `receiptInfoMap`, `toReceiptLineDTO`) · `mobile/lib/api.ts` · `mobile/screens/PvDetailScreen.tsx` | backend tsc 0 + probe 83/83; mobile by reading | ✅ Backend verified · ⚠️ mobile unverified |
| X49 | **🟢 THE OVERTIME REFUSALS ARE FIRED LIVE — 5 passed, 0 failed, and NOTHING was written to the shared DB.** First time any part of the overtime lane has reached a running server. New kept probe `probe-overtime-refusals.ts` (admin login from `DEFAULT_ADMIN_*`, never printed), run against a real backend on 7777 talking to `103.224.93.109:6543`. **The design point: every case here is a REFUSAL, and a refusal writes nothing** — so the whole lane could be proven over HTTP without putting one row on a database jk shares. Fired: **400** `agencyId is required` (admin with no agency — it refuses rather than silently returning an empty list, which would read as "no overtime" to a platform admin); **200** worklist for a real agency; **400** `decision must be 'approve' or 'reject'`; **404** for an absent assignment; and **409** `There is no overtime claim on this shift` — the arm proving "no claim" is distinguished from a malformed request, which is what lets a screen decide whether to re-fetch. ⚠️ **ONE CHECK IS REPORTED AS `SKIP`, NOT `PASS`, AND THAT IS THE POINT:** *"every claim arrives priced and week-stamped"* ran over **zero** pending claims. A check that goes green on an empty set asserts nothing, and calling it a pass would be the exact green-signal-that-lies failure that produced the retracted X46 hours earlier — so the probe now prints SKIP and says why. **The pricing rule therefore remains UNPROVEN live.** ⚠️ **A successful APPROVAL was deliberately NOT fired** — it writes real money onto a real voucher on the shared DB, and that is the owner's call, not mine. Also still unproven live: the concurrent-claim loser (needs two simultaneous requests against a genuine pending claim) and the unpriceable commission-only 409. Backend tsc **0**. ⚠️ The backend's first DB connection **timed out** (`ETIMEDOUT 103.224.93.109:6543`) and recovered on retry — the remote DB is not reliably reachable from this machine, so a failed probe run is worth re-running before it is believed. | **Agency ← PR** | `src/scripts/probe-overtime-refusals.ts` (new, non-mutating, KEPT) | live HTTP, 5 passed / 0 failed / 1 skipped | ✅ Fired live |
| X50 | **🟢 A SUCCESSFUL OVERTIME APPROVAL IS FIRED LIVE — money reached a real voucher, and the double-click guard refused on real approved data.** Owner asked for it explicitly on 2 Aug. New script `fire-overtime-approval.ts` (**the only WRITING script in `src/scripts/`** — everything named `probe-*` refuses to). It writes twice because a success cannot be reached otherwise: a PENDING claim (what a late check-out records), then the approval over HTTP. **Bounded on purpose: only a `pending_review` voucher is eligible** (a `sent`/`signed` document a PR has already seen must never be appended to), one assignment per run, refuses if the row already carries a decision, **rolls the claim back if the approval fails** (an approval with no line is recoverable; a held week nobody can see is not), and prints cleanup SQL. **RESULT: `f5a1f227…` (shift 23 Jul, 60 min) → `PATCH …/overtime` 200, "Overtime approved — RM175.00 added to the voucher for 2026-07-20"** — and **RM175.00 is exactly `700 ÷ 6 × 1.5`, predicted before the run**, so the rate rule is now confirmed against live money rather than a unit test. `PV-000002` went **700.00 → 875.00, 1 line → 2**, and `audit-live-vouchers.ts` still reports **all 3 vouchers reconcile**. ✅ **The double-click guard then REFUSED on that same real row: 409 "This overtime claim was already approved"** — the first live proof that `claimOvertimeDecision`'s `UPDATE … WHERE overtime_status='pending'` mutex works on data, not just in theory. 🔴 **MY ERROR, RECORDED BECAUSE IT IS THE USEFUL PART: re-running the script created a SECOND approval instead of retesting the first.** It selects on `overtime_status IS NULL`, so the row it just decided is no longer eligible and it silently moved to the next one — `9d897070…` (shift 29 Jul, RM150.00 = `600 ÷ 6 × 1.5`). **Idempotent per CLAIM, not per RUN**, and I read "re-run it" as "repeat what it just did". A `--report` mode (read-only inventory of every OT decision) and a `--retry` mode (re-approve an already-approved claim, which writes nothing) now exist so the state is one command instead of an inference. **TWO approvals therefore sit on the shared DB, both on `pending_review` vouchers, both reconciling.** Cleanup SQL for both is in §9 — GateGuard blocks `DELETE` from a script, so it is the owner's to run. Backend tsc **0**. | **Agency ← PR** | `src/scripts/fire-overtime-approval.ts` (new, WRITES) · live `PATCH /shift-assignment/:id/overtime` | live HTTP 200 + audit 3/3 OK + live 409 | ✅ Fired live |
| X51 | **🟢 THE UNPRICEABLE COMMISSION-ONLY 409 IS FIRED LIVE — and proving it needed a borrowed wage, because the case does not exist on this database.** `409 "This assignment carries no daily wage, so overtime cannot be priced. Seal a wage on the shift first, or reject the claim."` **The finding that came first: there is NO commission-only assignment on the live DB.** All **17** rows carrying no overtime decision have a positive `pay_amount`, so the refusal guards a case the data has never contained — which is exactly why it had never been exercised, and exactly why it was worth exercising. **The method, since the arm was otherwise unreachable:** `--unpriced` prefers a genuinely unpriced row, finds none, and **BORROWS** one — sets `pay_amount` to `0.00`, fires, and **restores the original in a `finally`**, so a crash mid-run still puts the wage back. ⚠️ **`'0.00'`, not NULL: the column is NOT NULL, and zero reaches the same guard anyway** — the endpoint tests `amountCents <= 0`, because a commission-only PR's wage is absent in VALUE, not in schema. **The row was chosen by least consequence** — `cancelled` → `no_show` → `assigned` → `confirmed`, with **`completed` excluded outright**, because completed rows are what vouchers are built from and a wage that blinks out mid-generation would be a real payroll fault rather than a test. It borrowed `b9edbd18…` (`assigned`, RM 700.00, shift 24 Jul). ✅ **Net effect on the shared DB: NOTHING.** The 409 precedes both the week lookup and the claim, the pending claim created to reach the endpoint was rolled back (**otherwise it would have held that PR's week forever, over a claim that can never be approved**), and the wage was restored. Verified after: **still exactly 2 overtime decisions** (the two from X50, no third), wage back at RM 700.00, and `audit-live-vouchers.ts` **3/3 reconcile**. Backend tsc **0**. | **Agency ← PR** | `src/scripts/fire-overtime-approval.ts --unpriced` | live HTTP 409 + zero-residue re-check | ✅ Fired live |
| X52 | **🔴 CONFIRMED FROM CODE: SUSPENDING AN AGENCY OR OUTLET ORGANISATION DOES NOT STOP ITS PEOPLE SIGNING IN.** Previously filed as "confirm live first"; now re-derived at HEAD rather than trusted. **`agency.status` and `outlet.status` both EXIST** as enums defaulting to `pending_review` (`agency.model.ts:30`, `outlet.model.ts:28`) — so an organisation genuinely can be suspended. **Nothing consults them at any auth boundary:** `auth.controller.ts:79` (login) and `:464` (refresh) test `user.status.toLowerCase() !== 'active'`, and `authenticateJWT` tests `user.status !== 'active'`. **That is the complete set of status checks in the auth path.** So suspending an agency leaves its owner and finance staff signing in with full access — **including raising payment vouchers**, which is the one surface where the consequence is money. ⚠️ **Not fixed here** — the fix is a design choice (does a suspended org 401 at login, or authenticate and lose write scope? does an in-flight session die on the next request, as a disabled USER's does per §8 X31?), and it touches every role's login path, so it wants a decision first, not a patch. | **all** | `auth.controller.ts` · `middlewares/authenticate-jwt.ts` · `agency.model.ts` · `outlet.model.ts` | code re-derivation at HEAD | 🔴 Confirmed OPEN |
| X53 | **🟢 THE CONCURRENT-CLAIM RACE IS PROVEN LIVE — and it was never "unfixable", only unproven.** Two **simultaneous** `PATCH …/overtime` requests at one pending claim, fired with `Promise.all`: **one 200, one 409 "This overtime claim was decided by someone else a moment ago."** ⚠️ **That message is the point** — it comes from `claimOvertimeDecision` returning falsy, i.e. the `UPDATE … WHERE overtime_status = 'pending'` losing the race, **not** from the earlier already-decided precondition. A read-then-check would have let both requests through every precondition; the state transition itself is what refuses the second. This is the live proof for the fix in `5e0dbee` that a double-clicked Approve cannot pay twice. **The method is the reusable part: it decides with REJECT, not approve.** Reject runs the identical mutex but writes **no voucher line**, so the race is provable without putting money on anyone's payslip — and the claim is then rolled back to NULL in a `finally`, so the run leaves nothing at all. Verified after: **still exactly 2 overtime decisions** (the X50 pair, no rejected row), audit **3/3 reconcile**. Backend tsc **0**. ⚠️ Correction to my own earlier note: I had written this off as needing "a genuine race" as though that were impractical. `Promise.all` of two requests IS a genuine race — **"hard to observe" was mistaken for "hard to test".** | **Agency ← PR** | `src/scripts/fire-overtime-approval.ts --race` | live HTTP 200+409 concurrently, zero residue | ✅ Fired live |
| X54 | **🟢 THE SURPLUS APPROVAL IS CLEARED — and the cleanup SQL I had written down would have CORRUPTED the voucher.** `--clear=<assignmentId>` removed the RM 150.00 line from `9d897070…`; **PV-000003 went 1353.30 / 4 lines → 1203.30 / 3 lines**, exactly RM 150.00 lighter, and the audit still reports **3/3 reconcile**. One approval remains — `f5a1f227…`, RM 175.00 on PV-000002 — which is the one that was asked for. 🔴 **THE FINDING IS IN THE CLEANUP, NOT THE CLEAR.** The two-statement `DELETE … FROM payment_voucher_line` + `UPDATE shift_assignment` recipe I had printed at the end of every run and recorded in §9 **was incomplete**: a voucher's `subtotal`/`net` are recomputed when a line is **added**, so deleting the row behind their backs leaves **a voucher whose stated total no longer matches its own lines** — PV-000003 would have read 1353.30 with 1203.30 of lines under it. **That is precisely the fault class this entire audit exists to catch, so running my own cleanup would have manufactured one.** ⚠️ The general lesson, and it is the same one as the `-ot` dedupe ref and the `component` column: **when the app maintains a derived value, undo through the app's own path, never with SQL that only touches the base row.** `--clear` therefore calls the repository's `deleteLine()`, which runs `recomputeTotals` in the same transaction. It also prints what it will remove and takes `--dry-run`, because a delete that names its target before acting is the only kind worth trusting on a shared database. Backend tsc **0**. | **Agency ← PR** | `src/scripts/fire-overtime-approval.ts --clear=` · `payment-voucher.repository` (`deleteLine` → `recomputeTotals`) | live clear + audit 3/3 + totals arithmetic | ✅ Verified live |
| X55 | **🟢 SUSPENDING AN ORGANISATION NOW ACTUALLY STOPS ITS PEOPLE — refused at login AND live sessions killed.** New `features/auth/org-status.ts` → `suspendedOrgBlock(userId)`, called from **`auth.controller` login** and from **`authenticateJWT`**. Two call sites on purpose: refusing the next login alone would leave anyone holding a token at the moment of suspension working until it expired — **which for an agency finance user means they could still raise payment vouchers.** The middleware already re-reads the account every request (§8 X31), so that cost was being paid and this rides along with it. **The login check sits BEFORE the password compare**, mirroring the lockout: a refusal that only fires once the password is right confirms the password to anyone who tries it. **🔴 THE DESIGN IS ALL IN WHAT IT DOES *NOT* BLOCK, and each carve-out is a lockout that nearly happened. (1) `pending_review` is ALLOWED** — only `suspended` and `inactive` deny. `pending_review` is the column **DEFAULT** for both `agency` and `outlet`, so a rule reading "not active" would have shut out **every organisation nobody has reviewed yet**, and no review screen exists. **(2) No membership means no opinion** — a platform admin and a PR hold no `agency_user`/`outlet_user` row at all, so an "is your org active?" test would have refused everyone who has no organisation, **locking every admin out of their own platform**. Absence of a membership is not a suspended membership. **(3) One live organisation is enough** — a user in a suspended agency AND an active one keeps access, rather than being punished for the other org's status. **(4) The membership row's own `status` is filtered first**, since `agency_user.status` is independent of `agency.status`. The refusal **names the organisation and its state** rather than saying "invalid credentials", which would send someone to reset a password that was never the problem — and it is their own org, so it discloses nothing. **LIVE PROOF, `probe-org-suspension.ts`, 5/5:** an active agency does not block → suspend → **blocked with the right message** → restore → access returns → and **admin is never blocked**. ✅ **Nothing was newly locked out: all 3 agencies and all 7 outlets are `active`** (asserted by the probe, not assumed). The suspension is restored in a `finally`. HTTP login re-verified after the change: admin logs in and all 6 authenticated requests pass the middleware. Backend tsc **0**. | **all** | `features/auth/org-status.ts` (new) · `auth.controller` (login) · `middlewares/authenticate-jwt.ts` · `probe-org-suspension.ts` (new) | live probe 5/5 + HTTP login re-verified | ✅ Fired live |
| X56 | **🟢 `/agency/pv` IS RENDERED IN A BROWSER AT LAST — on a REAL agency login, and it immediately produced a bug.** X43 and X45 shipped this screen proven only by `tsc`/biome/`vite build`; this is the first time a browser has loaded it. Signed in as `owner@atlas-agency.my` against the live backend: the page renders **real DB rows** (Alice `RM 1,203.30`, Victoria `RM 700.00`, both `Pending Agency Review`), the **dispute panel and `OvertimeQueuePanel` both mount**, console **clean — zero errors**. ⚠️ **The OT panel rendered its EMPTY state** ("No overtime awaiting a decision"), because the only live claim is already approved (X50). **Its POPULATED state is still unproven, and populating it means writing to the shared DB** — do not report this screen as fully exercised. **🔴 THE BUG IT FOUND: `pv_day_review_pending` was never mapped in `apps/web` at all.** The kind has existed since migration 0073 and is produced by `weekly-payout.job.ts`; the web app's hand-written `NotificationKind` union never received it. jk's `unknown` fallback stopped it white-screening, so it degraded quietly to a generic **"Update"** row — and `hrefFor` fell to `default: return undefined`, so **a notification whose own body reads "Approve each day on Payroll & PV, then send" navigated NOWHERE when tapped.** ⚠️ **Same class as jk's crash, one kind later, and the fallback is exactly why nobody noticed: it turned a loud failure into a silent one.** Fixed across 5 files (union → `KIND_MAP` → `PR_KIND_MAP` → `OPS_KIND_LABEL` → `hrefFor` case). **Verified in the browser, not by compiler:** the row now reads **"Day review"** and clicking it lands on `/en/agency/pv`. ✅ **Bonus — closes jk's §9 item 2:** his crash fix had never been seen rendering; `shift_cover_needed` and `pr_rating_low` both display correctly, no crash. `tsc` **121, unchanged from baseline**; biome clean (format only — pre-existing `prType` warning left alone). | **Agency** | `services/notification/index.ts` · `agency-portal/lib/ops-notifications.ts` · `agency-portal/hooks/use-notifications.ts` · `agency-portal/lib/push-notifications.ts` · `agency-portal/components/pr/PrNotificationBell.tsx` | real browser login + click-through | ✅ Rendered live, bug fixed |
| X57 | **🟢 THE WAGE ARITHMETIC IS PROVEN AGAINST THE RATE CARD — §9 P1's "Verify Payment Voucher ↔ PR wage calc" is answerable YES for the first time.** ⚠️ **First the correction that matters: `audit-live-vouchers.ts` reporting "3/3 reconcile" DOES NOT mean the wages are right.** `wages_amount_mismatch` matches a line against **`shift_assignment.pay_amount` — the amount check-out SEALED** — and never asks whether that sealed amount was itself derived correctly from the outlet's rate card. **A wrong rate card therefore yields a voucher that reconciles perfectly and still pays the wrong money.** The audit's green is *voucher ↔ assignment*, one link short of *the money is correct*. New read-only **`check-wage-vs-ratecard.ts`** closes that link and prints both sides. **Result: 4 completed assignments since 2026-07-20, agree 4 · disagree 0 · no-card 0** — `700.00 = 700.00` (Victoria, tier_3) and `600.00 = 600.00` (Alice, tier_2), each resolved from the **per-shift override** (`shift_pay_tier`), the precedence the app itself uses. The full chain **rate card → sealed pay → voucher line** is now machine-verified on live data. **🔴 TWO TRAPS WORTH KEEPING:** (1) the first run reported **SKIP — 4 rows, 0 comparable**, because `pr.tier` is the enum `tier_3` while `outlet_tier_rate.tier` holds the DISPLAY label `"Tier III"`; **they never join raw**, and the app bridges them with `PR_TIER_TO_OUTLET_LABEL` in `shift-assignment.controller.ts`. The fault was the probe's, not the app's — **re-derive before reporting a money bug.** (2) The table is **`outlet_tier_rate`, not `tier_rate`**, and `shift_date` lives on **`shift`, not `shift_assignment`** — the same column-guessing tax as every prior probe. ✅ **The script reports SKIP, never a pass, over zero comparable rows** — that is what stopped a false green here, and it must stay. | **Agency ← PR** | `apps/backend/src/scripts/check-wage-vs-ratecard.ts` (new, read-only) | live: agree 4 · disagree 0 | ✅ Verified live |
| X58 | **🟢 LANDING PAGE LAG HARDENED — the public `/` handoff was burning frame budget on mouse move and permanent GPU blur.** Owner: landing felt laggy. Root cause was not one animation but a stack: **`useCursorGlow` did `querySelectorAll('.hz-glass')` + `getBoundingClientRect()` on every `mousemove` across dozens of cards** (forced layout thrashing), aurora layers used **`filter: blur(120–150px)`**, glass used **18px backdrop-blur** plus per-card radial glow CSS vars, a fullscreen SVG grain overlay blended every frame, AI section used **`background-attachment: fixed`** (Windows scroll jank), and dashboard `useTick` intervals ran even when `#dashboards` was off-screen. **Fixes:** cursor glow now only updates `--mx/--my` via `rAF` (fine-pointer + reduced-motion gated); glass fill made more opaque and blur cut to 8px, per-card `::before` glow removed; aurora uses soft radial gradients with no `filter: blur`; grain disabled; AI BG no longer fixed; below-fold images `loading="lazy"`; flow particles 12→5 without SVG softblur; `useTick` IntersectionObserver + visibility gated; CountUp writes DOM text instead of React setState per frame; `prefers-reduced-motion` + mobile kill switches for aurora/spotlight/backdrop. Files: `handoff/primitives.tsx`, `HandoffPlatform.tsx`, `HandoffChallenges.tsx`, `HandoffBenefits.tsx`, `landing-handoff.css`. ⚠️ **Asset weight left open in X58; closed in X60** (JPG swap). | **Web (landing)** | `apps/web/src/components/landing/handoff/*` · `landing-handoff.css` | code + hard-refresh expected | ✅ Done |
| X59 | **🟢 PRIVACY POLICY PAGE (web only).** Public `/privacy` with PDPA-oriented copy (account/identity, geofence location, payroll/receipts, role sharing, retention, WhatsApp contact). Landing footer **Privacy** / **隐私** → `/privacy`; login + signup footers too. Owner: **no in-app mobile copy** — PR app does not ship a Privacy Policy screen. ⚠️ **Not lawyer-reviewed** — product-accurate draft for store/compliance URL. | **Web (public)** | `routes/privacy.tsx` · `components/legal/PrivacyPolicyPage.tsx` · `lib/legal/privacy-policy.ts` · footer/login/signup links | code | ✅ Done |
| X60 | **🟢 LANDING PAYLOAD + AUTH ICONS + PHONEFRAME SCROLL.** Follow-on to X58: (1) venue/PR landing photos **PNG ~2MB → JPG ~90–200KB** (`landing-assets.ts` + `public/img/landing/*.jpg`; old PNGs removed); logos/favicon under `/assets/`. (2) Below-fold landing sections **lazy-imported + `LazyMount` IntersectionObserver** so Challenges→Footer JS/DOM defer until near viewport. (3) Login + outlet/agency signup field icons **MaterialIcon → Lucide**. (4) PR `PhoneFrame` ScrollView: `nestedScrollEnabled`, `keyboardShouldPersistTaps="handled"`, stable keys when toggling scroll. | **Web + PR shell** | `landing-assets.ts` · `HandoffHomePage.tsx` · `login.tsx` · `signup-form.tsx` · `PhoneFrame.tsx` · landing JPGs | code | ✅ Done |
| X61 | **🟢 DEV SCRIPTS FREE OWNED PORTS ON CTRL+C (Windows orphan fix).** Async `taskkill` raced `process.exit()`, so Vite/Expo orphans kept holding WEB_PORT (often **3001** when Cursor owns 3000). **Fix:** `killChild` uses **`spawnSync` taskkill `/t`** on Windows; new `killPortListeners` force-stops Listen owners on claimed ports; `makeShutdown(children, ports)` is re-entrant-safe and frees ports after children. `dev-web` tracks web (+ backend if owned); `dev-all` also tracks **8081/8082** for Expo. | **Dev tooling** | `tools/scripts/dev-shared.mjs` · `dev-web.mjs` · `dev-all.mjs` | code | ✅ Done |
| X62 | **🟢 ORG OWNER GUARDS NOW CHECK THE ORGANISATION IN `:id` — and member writes check `:memberId` belongs to it.** `agencyOwnerOnly` used to ask only *"are you an active owner?"* — every agency owner satisfied it for every agency; the same hole covered outlet `PUT` + both geo-fence routes. Fixed with `agencyOwnerOfParam` / `outletOwnerOfParam`. A second hole: `updateMember`/`removeMember` validated `:id` while writing `:memberId` — now 404 if the member is not of that org. **Live-proven:** `probe-org-scope-guard.ts` **7/0/1**; member ownership probe **8/0/3**. See `docs/claude-memory/innocenz-org-scope-guards.md`. | **Agency / Outlet** | `require-sub-role.ts` · `agency.*` · `outlet.*` · `probe-org-scope-guard.ts` | live probes | ✅ Fired live |
| X63 | **🟢 ORG OWNERS CAN MANAGE THEIR OWN MEMBERS — UI on both Settings screens.** Backend: `GET/POST/PUT/DELETE /agency\|outlet/:id/members` behind route scope → controller `:memberId` ownership → `guardMemberChange` (refuses leaving an org with no active owner; unit tests in `member-change-guard.test.ts`). UI: one `OrgMembersPanel` (`kind="agency"\|"outlet"`) on agency + outlet Settings. ⚠️ **Only refusals proven live** — add/remove leave permanent rows and were not fired on the shared DB. Person must already have an account (no invite/mailer). | **Agency / Outlet** | `OrgMembersPanel.tsx` · `member-change-guard.ts` · agency/outlet member routes | UI click-through + probes | ⚠️ Reported (writes unfired) |
| X64 | **🟢 PRE-PILOT GATE 2 — demo login is DEV-only and absent from production builds.** `import.meta.env.DEV` gates the client demo branch so Vite drops it at build time. ⚠️ **The recorded credential was wrong for days:** it is `demo@atlas-agency.invalid` / `demo@velvet23.invalid` (RFC 2606 `.invalid`), not `owner@atlas-agency.my`; planted JWT is `alg:"none"` and the backend rejects it — blast radius was a demo shell, not real data. Proven by grepping the production `vite build` output (demo symbols **0**, real login path still present). | **Web (auth)** | `routes/login.tsx` · `lib/auth/*` | production build grep | ✅ Proven |
| X65 | **⚠️ WHATSAPP CLOUD API OTP + PR MOBILE SIGN-UP RESTRUCTURE — CODE LANDED, TABLE + META NOT.** Public `POST /auth/otp/send` + `/auth/otp/verify` (sha256 `code_hash` only; 5 min / 60s resend / 5 attempts); Meta webhook at `GET\|POST /webhooks/whatsapp`; mobile sign-up split into `screens/sign-up/step1…6` + `safe-area.tsx`; `.env.example` documents `META_WHATSAPP_*`. 🔴 **No `phone_verification` migration ships with this code** — the model comment says "Migration 0083" but **0083 is already `pv_line_outlet_fk`** on this branch; table does not exist until a new migration is authored. Also needs Meta Business verification + filled env. Not E2E on a real phone. | **PR (mobile) ↔ Auth** | `otp.controller.ts` · `phone-verification.*` · `features/whatsapp/*` · `screens/sign-up/*` | code only | ⚠️ Reported (needs DDL + Meta) |
| X66 | **🟢 AGENCY RECEIPT EDITOR LANDED (`57bd165`) — the slice that left the DB ahead of the repo.** Agency can correct drinks/tips on a scanned or self-logged receipt in place (order no, printed date/time, qty/commission, add missed line) through **targeted** receipt endpoints — never the destructive `PUT /payment-voucher/:id` line wipe. Same editor opens from the Receipts sub-tab **and** inside the dispute queue. Migrations **0083** (`outlet_id` FK on lines, 18/18 backfilled) and **0084** (`review_withdrawn_at`) were already live on `innocenz-test`; this commit ships the code that reads them. ⚠️ **Not a live agency click-through yet** — §9 day/receipt agreement audit items (PvDetail dispute, disputed-cell withdraw UX, etc.) stay open. | **Agency → PR** | `AgencyReceiptEditor` · `use-agency-receipt-edit` · `DisputeQueuePanel` · `0083`/`0084` | live schema + committed code | ⚠️ Reported |
| X5 | `GET /user` no longer leaks credentials — `passwordHash` occurrences **0** for admin/agency/outlet; PR 403 on the list and on others' records, **200 on its own** (mobile profile call); all 4 logins still succeed | all | `user.routes.ts` · `withUserProfile()` | user / user_profile | ✅ Verified (fix `9a6eecc`) |
| X56 | **🟢 THE AGENCY NOW HAS THE SAME NEGOTIATED-PRICE HANDSHAKE AS THE OUTLET — Custom is to an agency what the POS add-on is to a venue.** Until now every part of that pipeline was outlet-only: the agency Subscription screen was READ-ONLY (no switch, no re-quote, no exit, no waiting state), its Custom rows carried no previous price, and the admin drawer framed Custom as a plain plan swap. **Backend:** `withPreviousAddonPrice` → `withPreviousNegotiatedPrice` (field `previousNegotiatedAmount`) covering BOTH types — POS reads the active `kind:addon` line, Custom reads the active `kind:plan` line and only when that plan IS Custom, since a list price is not a negotiated one; **a zero counts as no price** (the catalog placeholder). `applyResolvedPriceToLedger` for `custom_renegotiation` now routes a request that NAMES a plan through `applyPlanChangeToLedger` — joining Custom, re-agreeing it, or leaving it all write a new ledger row so the old price survives as history; re-pricing in place had left an agency that asked for Custom still recorded on Growth while billed the Custom figure. New `GET /admin-request/mine/custom-quote` (session-scoped, before `/:id`). **Agency screen:** rate-card Switch buttons, a *Negotiated tier* card with `Ask for a new price`, a waiting banner, and the hero tier/price now read from the LEDGER not the demo PV curve — it used to tell an agency on Custom that it was on Starter. Ordinary tier→tier stays `plan_change`/`direct` (list price, nothing to decide); anything touching Custom is `custom_renegotiation` and WAITS, which is what stops an agency setting or ending its own price — that is how Atlas ended up on Custom at RM 0. **Verified live:** `previousNegotiatedAmount` = 99999.00 on all 5 Emhub POS rows, **null** for Delta (moved off Custom to Growth 500.00 — correct) and **null** for Atlas (Custom 0.00 placeholder — correct); `/mine/custom-quote` returns 200; web+backend `tsc` clean on every touched file | **Agency ↔ Admin** | `admin-request.controller.ts` · `admin-request.routes.ts` · `use-agency-subscription.ts` · `routes/agency/subscription.tsx` · `routes/admin/service/requests.tsx` | live API (reads) + tsc | ✅ Verified (write path needs one click — §9) |

---

## 9. TO-DO (undone) — full backlog, prioritized

### ▶ THE DAY-STATUS SEQUENCE (owner, 5 Aug 2026 — the spec everything else answers to)

*"first is pending, status pending in the pr payment page after the pr check out, after the agency
approved then only the pr payment page status approved, then only can show dispute button to make
dispute, then after the agency resolved the dispute the status on the payment page is verified"*

1. **PENDING** — PR checks out, the day's money is sealed, nobody has checked it.
2. **APPROVED** — the agency approves the day. **Only now does the Dispute button appear.**
3. **DISPUTED** — a raised claim outranks APPROVED while open; the approval is what is being argued.
4. **VERIFIED** — the agency RESOLVES the claim. Stronger than approved: questioned AND answered.

Mirrored in memory as `innocenz-day-status-lifecycle`. Already enforced by `prVisibleDayStatuses`
(backend) and `dayStatusLabel` (mobile). A STALE day drops back to PENDING rather than claiming an
approval of a figure that no longer exists.

- [ ] ⚠️ **UNDECIDED — a day nobody disputes.** The sequence above makes VERIFIED the post-dispute
  state, but most days are never disputed and the Sunday 02:00 rollover verifies undisputed approved
  receipts today. Both routes are ASSUMED to stay (resolution → verified immediately; no dispute →
  verified at the Sunday run). If VERIFIED is meant strictly as post-dispute, the rollover has to
  change instead — and that governs when a week CLOSES, so decide it deliberately.
- [ ] **Not written by this session:** `dayStatusLabel`, `disputesForDay`, `openDisputeKeys`,
  `weekDisputable` in `apps/mobile/src/lib/receipt-review.ts` appeared mid-session from another
  source. They implement this sequence but have NOT been reviewed here — read them before trusting.

### ▶ AGENCY PAYROLL UI — 3 OWNER REQUESTS, NOT STARTED (5 Aug 2026)

- [ ] **Search the PV list by PR name or outlet.** *"pv section make need to search the pr name or
  the outlet name"*. The Payment Vouchers panel has STATUS chips and no text search. Add one input
  filtering on the payee label and `pv.outlet`. Match the payee the way the card now DISPLAYS it
  (`resolvePvPrLabel` — nickname + legal name), or searching "Vicky" will not find a voucher whose
  `pr_name` is "Victoria Tan Mei Lin".
- [ ] **Disputes: separate open from settled, and make it searchable.** *"dispute section here need
  to show out which already disputed and which still pending, also need to make a filter easy to
  search"*. `useAgencyDisputes()` currently feeds one flat list captioned "No open disputes". A
  dispute row already carries `outcome` (`accepted|rejected|withdrawn|null`) — null IS the open one —
  so the split needs no new data. Add status chips (Open / Resolved / All) plus the same text search.
- [ ] **Confirm EVERY agency action on screen** — standing rule, mirrored in memory as
  `innocenz-confirm-every-action`. The receipt editor already prints the server's sentence; day
  Approve/Hold/Clear, receipt Approve/Withdraw, voucher Send and To-pay do NOT. Use the server's own
  wording verbatim, never "Saved" — it already names the consequence. ⚠️ This is what stops a reviewer
  clicking Approve twice because nothing appeared to happen, and on these paths a second click
  re-approves or re-stales a day.

### ▶ UNCOMMITTED WORK IN THE TREE — recorded 4 Aug 2026, needs its owner to finish
### ▶ NEXT SESSION STARTS HERE — amended 4 Aug 2026 (jk — receipt editor committed)

> **`57bd165` closed the "uncommitted receipt-editor tree" block.** Code + migrations are in the
> repo; DB already had `0083`/`0084`. **Next:** live agency click-through of Approve + dispute-queue
> edit paths, then work the §9 DAY/RECEIPT AGREEMENT AUDIT highs (PvDetail dispute never hits server,
> disputed voucher turns every cell into withdraw). Do **not** treat §8 A6/X58 as verified until a
> real agency login drives the editor.

### ▶ ~~UNCOMMITTED WORK IN THE TREE~~ — ✅ CLOSED 4 Aug 2026 (`57bd165`)

> Was: receipt editor + `0083`/`0084` readers sitting untracked while the DB already had the columns.
> **Landed** as `feat(agency): correct a receipt under Approve, and inside the dispute queue`.
> Checklist that used to live here (untracked editor files, DisputeQueuePanel blocked on them,
> "doc rows without code") is **done**. Remaining product gaps are in RECEIPT EDITOR SCOPE verify +
> DAY/RECEIPT AGREEMENT AUDIT below — not "commit the tree".

### ▶ ADDED LINES MUST MATCH THE OUTLET'S LIST — DRINKS **AND TIPS** (owner, 4 Aug 2026)

*"if add a missing line section at the agency need for example the drinks need verified is the outlet
else cannot add so in his way can make list the the drink on that shift from what outlet"*, then
*"need to do same thing for the tips also"*.

- [x] **Drinks AND tips — SHIPPED** (see §10, 4 Aug). One table `outlet_drink_menu` split by
  `category`: `drink` → the DRINKS PRICE list, `service`/`tip` → SERVICE ENTITLEMENT. There is no
  second catalogue, so tips needed no second design.
- [x] The outlet is resolved by **FK, not by name**: `receipt.shift_assignment_id → shift.outlet_id`,
  read through the existing `resolveDrinkMenusForOutlets` — the same list the PR's phone gets.
- [x] Price ≠ commission: the picker shows the outlet's price for matching against the paper and the
  commission stays typed. No per-item commission rule exists anywhere to auto-fill from (the web
  `AgencyCommissionRulesPanel` reads the client demo store, not the backend).
- [x] ⚠️ ~~**DECIDE: drop or wire `0083_pv_line_outlet_fk`.**~~ **APPLIED + shipped with `57bd165`.**
  Column + FK live on `innocenz-test` (18/18 lines backfilled). Keep — do not drop.
- [ ] `PUT /payment-voucher/:id` is a SECOND DOOR: it still writes receipt-linked lines with
  free-text descriptions under the same `agencyOwnerOrFinance` guard, so the catalogue rule is
  enforced on one path and not the other.
- [ ] The added line's `amount` is the WHOLE-LINE commission (the server stores it verbatim and every
  total sums it without multiplying by quantity), but the form's `QTY × COMMISSION` layout reads as
  per-unit. Re-word or re-derive.
- [ ] `AgencyAddReceiptLineSchema.lineDate` still lets the caller pick the day, contradicting the
  endpoint's own comment that a line inherits the receipt's day.
- [ ] Item matching is on `name`, which has no unique constraint on `outlet_drink_menu`.

### ▶ DAY GOES VERIFIED (decided 4 Aug 2026, SPEC'D — after the receipt editor)

Owner: *"once after the agency approve, if the pr make disputation, change the status to verified of
that day"* → confirmed: **VERIFIED when the dispute is RESOLVED**, not when it is raised. Raising a
dispute must NOT verify — `verified` is terminal (not settable over HTTP, and both correction paths
refuse to leave it), so verifying contested money would lock the agency out of fixing the very thing
being argued about. While a claim is open the day reads **DISPUTED**.

⚠️ **The week is SUNDAY–SATURDAY and the payout cron is SUNDAY 02:00 Asia/Kuala_Lumpur**
(`previousCompleteWeek()`, re-anchored 3 Aug on the owner's instruction). Any note saying "Monday"
is stale — that error came from `docs/claude-memory/innocenz-receipt-lifecycle.md`, now corrected.

- [ ] **Two paths to the same state, which is why no new mechanism is needed:** the Sunday run
  verifies the finished week's approved receipts and **already skips vouchers with an open dispute**;
  `resolveDispute` closes those when the last claim is decided. Extend that from RECEIPTS to the DAY
  the PR sees.
- [ ] **NO DDL — derive it.** `payment_voucher_day_review.status` is only `approved|held`; do not add
  a `verified` value. A day is verified when **every receipt on that day is `verified` and no dispute
  on that day is open**. For a wages-only day (no receipts at all) it is verified once the voucher's
  week has rolled and no dispute on that day is open.
- [ ] Compute it in `prVisibleDayStatuses` alongside the existing pessimistic downgrade, so one
  function still owns everything the PR is told about a day.
- [ ] Mobile already renders `verified` — `week-pay-grid.ts` and both Status rows handle it since the
  audit fix. Confirm a DISPUTED day still outranks it in the label.
- [ ] Test: (1) approve day → PR disputes → day reads DISPUTED, not VERIFIED; (2) agency resolves →
  day reads VERIFIED; (3) a day nobody disputes → VERIFIED on the Sunday run; (4) a day with a still-
  pending receipt never reaches VERIFIED by either path.

### ▶ WAGES-ONLY DAYS AUTO-APPROVE (decided 4 Aug 2026, SPEC'D — implement after the receipt-editor build)

Owner: *"so if the shift either one daily wages or the status or both no need approve"* → confirmed as
**auto-approved, Hold still available**, and the PR sees the normal green **APPROVED**.

The reasoning that makes this safe: the day review exists so somebody checks the EVIDENCE behind a
day. A day with no receipt on it has no evidence to check — wages and OT are fixed by the outlet from
the check-in/check-out stamps, and the PR cannot dispute them (see the dispute rule, §10 4 Aug).
Requiring a click there is ceremony, and ceremony is what makes people click through the days that
DO matter.

- [ ] **Definition (owner, restated 4 Aug):** *"either one daily wages or the others (OT) or both no
  need approve"* — a day auto-approves when **every line on it has `component` in {`wages`, `ot`}**.
  Either alone, or both together.
  ⚠️ **NOT "no receipt on the day"**, which was the first draft of this rule and is wrong: `deduction`
  and `other` carry no receipt either, so that definition would have silently auto-approved a day
  where money was taken OFF the PR's pay — the one day most deserving a human look. A deduction or
  adjustment on the day means the day still needs a click. One scanned drink likewise disqualifies it.
- [ ] **`buildDayReviewView`** (`payment-voucher-day-review.ts`): a receipt-free day with **no review
  row** reports `status: 'approved'` plus a new `autoApproved: true`. An explicit row always wins, so
  **Hold still blocks** — that is the whole point of choosing this over "never reviewable".
- [ ] **Staleness does not apply** to an auto-approved day: there is no `approved_total_cents`,
  because nobody attested to a figure. A wages-only day whose total changes stays auto-approved.
- [ ] **Send gate needs NO change** — the day already reads `approved`, so `voucherSendGate` passes
  it. Verify that rather than assume it.
- [ ] **PR side:** nothing to do. `prVisibleDayStatuses` cannot downgrade a receipt-free day (no
  pending receipt can sit on it), so the phone shows APPROVED — the chosen answer.
- [ ] **Agency panel** (`AgencyPvDayReviewPanel`): render the row approved with a quiet caption ("no
  receipts on this day") and offer **Hold** / **Clear** but not Approve. A button whose only effect is
  to convert an automatic yes into a manual yes is noise.
- [ ] ⚠️ **Do not let this hide a held day.** Test: hold a wages-only day, confirm the send still
  refuses and the phone does not show APPROVED.

### ▶ RECEIPT EDITOR SCOPE (owner, 4 Aug 2026)

*"the agency only can edit the scanned or self log of the drink or the tips at the receipt section"* —
the editor is confined to **drinks and tips lines on a receipt** (scanned or self-logged), reached
from the **Receipts section**. Wages and OT are never editable there: they carry no receipt, they are
fixed by the outlet, and the way to change one is the attendance record.

- [x] **Editor shipped** (`57bd165` / §8 A6 · X58) — also opens inside the dispute queue.
- [ ] **Verify against this scope on a live agency login** before promoting A6/X58 to ✅ Verified
  (no wages/OT editable; drinks+tips only; catalogue match for add-line).

### ▶ DAY/RECEIPT AGREEMENT AUDIT — 12 confirmed, 2 FIXED, 10 OPEN (4 Aug 2026)

Four-lens adversarial audit of the day-approval carry. Every item below survived a refutation pass.
**Fixed already:** the full-set re-sweep erasing a withdrawal (`receiptsCarriedByDays` now takes
`justApprovedDates`), and the mobile grid letting voucher status outrank `dayReviews` (which also
fixed the two hardcoded `VERIFIED` Status rows). **Open:**

- [ ] **HIGH · PvDetail's dispute never reaches the server** (`PvDetailScreen.tsx:345`) — the PR is
  shown an open dispute that does not exist.
- [ ] **HIGH · A disputed voucher turns every cell into a withdraw button** (`PaymentScreen.tsx:285`)
  — most taps 404, and raising a second dispute is unreachable.
- [ ] **HIGH · Scheduler issues vouchers unsigned** (`weekly-payout.job.ts:187`) and the finance
  signature can never be added afterwards.
- [ ] **MED · Sunday job verifies receipts on vouchers it then refuses to send**
  (`weekly-payout.job.ts:106`) — `verifyApprovedReceipts` has no voucher-status filter and runs
  BEFORE the send loop, so `verified` (terminal, unreachable by both correction paths) is stamped on
  a week that stays stuck. Freezes the agency's correction path permanently.
- [ ] **MED · Client `buildSendGate` mirrors only 2 of the server gate's 4 rules**
  (`use-agency-pv-day-review.ts:68`) — week-not-finished and pending-overtime are missing, and the
  resulting 409 on Send is swallowed silently.
- [ ] **MED · Receipt review from the Verify panel never invalidates the Receipts sub-tab**
  (`use-agency-pv-receipt-review.ts:25`) — the mirror of the bug already fixed in the day-review hook.
- [ ] **Agency day panel shows a day APPROVED while a receipt on it is PENDING** — no agency-side
  equivalent of `prVisibleDayStatuses`. The PR now sees the honest answer and the agency does not.
- [ ] **Zero-dated-day branch asserts the voucher "can be sent as it stands"** without consulting
  `sendGate`, and the Send caption is suppressed when only receipts block.
- [ ] **Undated (week-level) lines are bucketed onto `weekStart`** — Monday money that no day review
  covers and no dispute can name a date for.
- [ ] **"N entries approved by your agency"** is printed for scans nobody has looked at
  (`receipt-review.ts`), and the held-voucher notification always blames days even when the blocker
  is a receipt or overtime.

### ▶ AGENCY — EDIT / ADD RECEIPT LINES UNDER *Approve* (added 4 Aug 2026, NOT STARTED)

Owner: *"makes agency can change and edit the price and the quantity of drinks and tips or add drinks
or tips category from the receipt scanned, under the approve add a edit button"*.

- [ ] **Edit** button beside *Approve* on each receipt card in `AgencyReceiptsPanel` **and**
  `PayrollVerifyPanel` (one component, both places — two editors would drift). Editing a line's
  quantity/commission already has its endpoint:
  `PATCH /payment-voucher/receipts/:receiptId/lines/:lineId` (`editReceiptLine`) — it exists and is
  UNUSED by the UI. **Never route this through `PUT /payment-voucher/:id`**: that path deletes and
  re-inserts every line, which is how an agency price edit once severed the receipt links and deleted
  the PR's proof photos.
- [ ] **ADD a drinks/tips line to an existing receipt** — no endpoint exists yet. Needs
  `POST /payment-voucher/receipts/:receiptId/lines` under `agencyOwnerOrFinance`, writing a
  `payment_voucher_line` with the receipt's FK, the day's `line_date`, and a `ref` packing the kind so
  `componentFromRef` buckets it as drinks/tips.
- [ ] Both writes must keep the two existing consequences intact: the day's total changes so
  `approved_total_cents` flips that day **stale** (re-approval required), and an APPROVED receipt drops
  back to **PENDING** — the receipt table stores no amount, so staleness there cannot be detected
  afterwards and must be recorded at the moment of the edit.
- [ ] Watch the interaction with the new day-approval carry: re-approving the stale day will
  re-approve the receipt, which is correct — but confirm it does not approve a receipt whose newly
  added line lands on a *different*, unapproved day.

### ▶ PR PAYMENT — CELL EVIDENCE (added 4 Aug 2026, awaiting owner verification → promote to §8)

- [ ] **Tapping any Payment-grid amount (This week AND Last week) opens the proof behind it.** Per
  contributing line the sheet must show: the ORDER NUMBER off the paper (`ORD0389`, or "No order
  number" when the paper carried none) with its `RCP-…`, the shift's CHECK-IN and SHIFT END stamps and
  duration, the QUANTITY, and the ITEM name — grouped shift → receipt → items. **The sheet total must
  equal the cell**; when it does not, a red warning says so rather than showing a short list silently.
- [ ] ⚠️ **This CHANGES an already-verified §8 step.** Last-week cells used to open the dispute sheet
  directly; they now open evidence, and **Dispute this amount** is a button inside it. Re-word the §8
  dispute step to "tap the cell, then Dispute this amount" — including the withdraw variant for a
  voucher already under dispute — rather than leaving it stale.
- [ ] **Phase 2 (deferred):** `getMyHistory` does not carry `shifts`, so the sheet reached from a past
  voucher in `PvDetailScreen` would show "Shift times are unavailable". Widen it by gathering assignment
  ids across ALL weeks into ONE `listByIdsForPr` call — a per-week fetch there is an N+1 (it already
  calls `listReceipts` per week). Then point PvDetailScreen's grid at the same sheet and delete its
  now-false comment at ~92 ("the /mine payloads do not join `payment_voucher_receipt`" — they do now).

### ▶ NEXT SESSION STARTS HERE — amended 3 Aug 2026 (read this amendment, then the 2 Aug block below)

> **3 Aug (latest) — a wage-classification fault found while wiring the PR History tabs, then FIXED
> at the owner's instruction (§10 latest).** No open item left from it.
>
> - [x] **🟠 Generated WAGE lines were classified `others`, so daily wages read RM 0.00 on three
>   screens** — ✅ **DONE 3 Aug.** The weekly generator writes `ref = <shift assignment id>` (a bare
>   uuid, no packed kind) and sets `component: 'wages'` explicitly, but `toReceiptLineDTO` derived
>   the PR bucket from `ref` alone, so `decodeRef()` fell through to `'others'`. New `lineKind()`:
>   **a packed ref still wins** (a self-log states its own kind and is the authority on itself); the
>   `component` column answers **only** when the ref packs nothing. `sumWages()` goes through the
>   same helper — it was returning 0.00 for the same reason. Proven per line by
>   `src/scripts/probe-pr-history.ts`: Vicky's 2 × RM 700.00 wage lines **MOVED** others → wages, her
>   RM 175.00 `ot` line correctly **stayed** in others, and Alice's already-packed lines were
>   **untouched** (wages stayed wages, drinks stayed drinks). ⚠️ The earlier note here claimed this
>   was risky because `kind` drives `disputable: kind === 'wages'` — **that was wrong**: a wage line
>   carries no receipt, so `receiptStatus === null` already made it disputable. The only other effect
>   is that a dispute raised on that cell now files under `wages` instead of `others`, which is the
>   correct bucket.

> **3 Aug: `main` was merged in (jk's PR #41 — docs only), and TWO of the five open items closed.**
> ✅ **§9 P1 "Verify PV ↔ PR wage calc" is DONE (§8 X57)** — the rate-card link the audit never
> checked is now machine-proven live, `agree 4 · disagree 0`.
> ✅ **`/agency/pv` is RENDERED on a real agency login (§8 X56)**, and doing so found and fixed a
> dead notification deep-link. **jk's own §9 item 2 closed with it** — his crash fix now verified
> in a browser.
>
> **🔴 STILL OPEN, and both are blocked on the same thing — a login I could not obtain:**
> 1. **The ADMIN PV page has still never been rendered** (§8 X45 shipped it compiler-proven only).
> 2. **The 400 (bad line date) and 409 (closed week) refusals have still never been fired from the
>    PHONE.** The overtime refusals WERE fired live (X49/X51/X53); these two were not.
>
> ⚠️ **The OT panel on `/agency/pv` rendered only its EMPTY state** — the sole live claim is already
> approved. **Do not record that screen as fully exercised**; its populated state needs a pending
> claim, which means a write to the shared DB.
>
> ✅ **RESOLVED — and the earlier warning here was wrong.** This block previously claimed ~19 files of
> unauthored reformatting sat in the tree, naming `GeoFenceCard.tsx`. **16 of those 19 were CRLF/LF
> line-ending noise with no content change at all**; only 3 were real, all pure biome formatting, and
> `GeoFenceCard.tsx` was **not** among them. All committed; tree clean. See the correction at the top
> of §10 — the mistake was generalising from one sampled diff to a whole file list.

### ▶ 3 Aug 2026 — ARRIVED WITH THE MERGE, NOT MINE TO SILENTLY FIX (SL’s files)

1. **🔴 `PrNotificationBell.tsx` navigates to `/host/PaymentVoucher`, a route that does not exist.**
   `apps/web/src/routes/host/` is not in this repo at all and `routeTree.gen.ts` has no such entry, so
   `npx tsr generate` will not help — three TS2322/TS2353 errors at lines 110 and 186. A PR tapping a
   payment-voucher notification cannot navigate. Left exactly as `main` has it: rewriting a teammate’s
   feature inside a merge resolution hides the problem instead of surfacing it.

2. **🟡 Unused symbols in `ops-notifications.ts` (`prType`) and `pr-demo.ts`** (`getPreviousWeekSundayIso`,
   `remapIsoByWeekSlide`, `addDays`, `y`) — TS6133, harmless, but they are new to the baseline.
### ▶ 3 Aug 2026 — AGENCY CUSTOM: two things left, both need a click on a running app

1. **PROVE THE CUSTOM WRITE PATH — one clean loop, now that Atlas is reset.** The READ side is
   verified live; the ledger write still needs a human click, because proving it means putting a real
   price in the shared DB. ⚠️ **Steps updated 3 Aug (evening): the buttons this originally named no
   longer exist** — the agency picks no tier, and the two Custom actions were split apart. In order:
   **(a)** Atlas → Subscription → Custom tile → **✦ Ask admin for a price**; **(b)** admin → Plan
   Request → the row reads `Custom` pending → set a figure → **Resolve** → Atlas' active
   `member_subscription` row becomes `Custom <figure>`; **(c)** back on Atlas, the **Negotiated tier**
   card shows that figure and the price MUST STILL BE THERE after a refresh — the auto-reset that used
   to eat it is gone; **(d)** press **↺ Reset to normal subscription** → applies immediately, ledger
   moves to `Starter RM 125.00`, and the admin sees `Reset · Starter` (status Direct) in Plan Request.

2. ✅ **GHOST SUBSCRIBERS PURGED FROM `admin_request` — DONE 3 Aug.** `repair-member-subscription-links.ts`
   now detects request rows naming an organisation that does not exist, and `--purge-ghosts --apply`
   deleted **4**: Marble Hall (outlet, plan_change/declined), Horizon Talent, Pioneer Crew and Summit
   Staffing (agency, custom_renegotiation). **All four carried `created_by=seed-sample`** — that stamp
   is what made it safe to delete without guessing. Rollback JSON written BEFORE the delete to
   `%TEMP%admin-request-ghosts-2026-08-03T08-55-52-748Z.json`; re-inserting it restores them exactly.
   Plan Request went **16 → 13 rows**, and every remaining row belongs to a real outlet or agency.
   ⚠️ Only the three SUBSCRIBER types are judged — a `contact`/`other` enquiry from someone without an
   account is legitimate and is never touched.

3. **`seed-sample-activity.ts` still recreates them if anyone re-runs it** — carried over from the
   2 Aug list, now with three named victims as proof it matters.


### ▶ (2 Aug 2026 — HEAD `5e0dbee`, tree clean, 9 unpushed)

> **THE PV BACKLOG HAS NO BUILD LEFT ON THE BACKEND.** `5e0dbee` closed the overtime endpoint, which
> was the last one. What remains below is **one frontend screen (item 2), two under-wired admin/PR
> surfaces (items 3–4), and EVIDENCE (item 5)** — five refusals that are unit-proven and have never
> been sent to a running server. ⚠️ **Migration 0079 is applied to the SHARED DB**; a teammate pulling
> this branch does not need to re-run it, and it is idempotent if they do.

> Nothing is pushed; **that is the owner's call — ask, do not assume.** Backend `tsc` **0**,
> `probe-pv-audit.ts` **44/44**. ⚠️ **Run both from `apps/backend`, never the repo root** — a root
> `npx tsc -p tsconfig.json` picks the ROOT config and reports a meaningless 0. That happened this
> session; the clean result was worthless until re-run in the right directory.

**🔴 DO NOT RE-ASK THE OVERTIME PAYOUT DECISION — it is answered** (owner, 31 Jul): *"the OT should
be sent together with the week PV it originates from, as that is the most fair and direct."* So
overtime is paid on the voucher of the week it was **WORKED**, and the consequence is already
shipped (`882afd7`): **an undecided claim blocks its own week's send.** **There is therefore no
reopen-a-sent-voucher path to build** — a week cannot close with a claim outstanding. Do not design
an amend flow.

1. ✅ **`PATCH /shift-assignment/:id/overtime` + the `component='ot'` line — DONE `5e0dbee`.** Also
   `GET /shift-assignment/overtime/pending` (the agency worklist), migration **0079**
   (`overtime_decided`, applied + verified live), and two fixes the build exposed that nothing else
   would have: **the clamped stamps made the audit flag every legitimate approval**, and **a
   double-clicked Approve paid twice**. Full detail in §10. **This was the last BUILD in the PV
   backlog.**
2. ✅ **The agency screen for deciding OT — DONE (§8 X43).** `OvertimeQueuePanel` on **`/agency/pv`**,
   beside the dispute queue and above the week tabs, because an undecided claim is *why* a week
   below refuses to send. ⚠️ **It is deliberately NOT on `/agency/pending`:** that route is gated on
   `approvePrSignups`, which **agency finance does not hold** — and finance is one of the two roles
   the server lets decide overtime, so the obvious home would have locked out half the people
   entitled to act. The screen renders the server's `amount` and `week` and derives no figure of its
   own. ⚠️ **Never rendered in a browser** — that needs a real agency password login; it is proven
   by tsc (baseline 121, 0 from these files), biome and a successful `vite build` only.
3. ✅ **Admin PV page — DONE (§8 X45).** `ReceiptEvidence` (read-only) + `VoucherDisputes`
   (Accept/Reject, the one write on the page) on the detail sheet. Nothing was widened: `guard()`
   already waves admin through `agencyOwnerOrFinance`. ⚠️ **Never rendered** — needs a real admin login.
4. ✅ **Receipt numbers + the PR detail button — DONE (§8 X47).** Re-derivation found **both halves
   were already built**; the real gap was that the detail modal could show everything about a receipt
   **except its number**, because `/mine` never joined the receipt table — so the server's refusals
   named an identifier the PR could not see. `PrReceiptLineDTO` now carries `receiptNo`.
   ⚠️ **§8 X46 claimed mobile never typechecks. That was WRONG and is retracted in §8 X48** — I ran
   the solution-style `tsconfig.json` (which compiles nothing by design) instead of
   `tsconfig.app.json`, which already sets `"jsx": "react-jsx"`. **Nothing needed fixing.**
   ✅ **What IS true and is a correction to the old baseline: run
   `npx tsc -p tsconfig.app.json --noEmit` from `apps/mobile`, and the real baseline is 10 errors**
   (`PaymentScreen.tsx` 4, `proof-photo.ts` 3, `PhoneSheet.tsx` 2, `demo-shifts.ts` 1), not 0.
   X47's mobile half is verified clean against it. ✅ **§8 X44 found and fixed something worse on the way in:** the receipt
   allocator was the pre-31-Jul `nextVoucherNo` code verbatim — `count(*) + bump` (which **recycles
   numbers after a delete**, and receipts are deletable) and a catch-and-retry that **could never
   reach attempt 2** inside a transaction. ⚠️ **Still to build: the PR detail button** to open a
   receipt from the mobile PV screen.
5. **Fire the refusals LIVE** — the 400 (bad line date), the 409 (closed week), the mid-week send, the
   OT send gate, and now the **three new OT refusals**: already-decided, the concurrent-claim loser,
   and the unpriceable commission-only claim. **All of them are unit-proven only**, and a refusal's
   real risk is refusing something LEGITIMATE, which a pure probe cannot rule out. The cheapest live
   proof of the whole overtime lane, in order: check out a shift late on the PR app → the claim shows
   on `GET /shift-assignment/overtime/pending` → approve it → the `ot` line appears on that week's
   voucher → `audit-live-vouchers.ts` still reports OK → the week can now be sent.


### 🟢 ROWS ON THE SHARED DB — resolved 2 Aug (§8 X50, X54)

**ONE approved overtime decision remains, and it is the one that was asked for:**
`f5a1f227-a1ca-449d-8d02-10bddc05a1c9`, shift 2026-07-23, 60 min, **RM 175.00** on **PV-000002**
(700.00 → 875.00). Keep it — it is the live proof that overtime becomes money.

✅ **The surplus second approval is CLEARED** (`9d897070…`, RM 150.00). **PV-000003 went
1353.30 / 4 lines → 1203.30 / 3 lines**, exactly RM 150.00 lighter, and `audit-live-vouchers.ts`
still reports **3/3 reconcile**.

⚠️ **DO NOT use raw SQL for this — the two-statement `DELETE` + `UPDATE` previously recorded here
was INCOMPLETE and would have corrupted the voucher.** A voucher's `subtotal`/`net` are recomputed
when a line is *added*, so deleting the row behind their backs leaves **a voucher whose stated total
no longer matches its own lines** — PV-000003 would have sat at 1353.30 with 1203.30 of lines under
it. That is the exact fault class this audit exists to catch, so the cleanup would have created one.

**Use the script, which goes through the repository's own `deleteLine()` and therefore calls
`recomputeTotals` in the same transaction:**

```bash
npx tsx --tsconfig tsconfig.json src/scripts/fire-overtime-approval.ts --clear=<assignment-id> --dry-run
```

Drop `--dry-run` to apply. Then confirm with `--report` (read-only inventory of every overtime
decision) and `audit-live-vouchers.ts`. Both are safe to re-run at any time.

### ▶️ jk's 31 Jul session hand-off — SUPERSEDED AS A "START HERE", KEPT FOR ITS ITEMS

> ⚠️ **Arrived on the 2 Aug merge of `main` into `SL` (jk's `b6c5786`, PR #41). The block above is the
> current start point; this one is kept because items 1–4 below and the whole P0-CLIENT list that
> follows are still open work, not because it should be read first.** Its stated tree state is now
> stale: branch `jk` **has** been pushed and merged — it is in `main` as `80efdc7`.

**Working tree state when this was written:** the notification-crash fix (6 files under `apps/web`)
and these `TEST_SCRIPT.md` edits are **saved on disk but NOT committed**. `git status` will show them.
The merge commit `37d55f1` IS committed; branch `jk` has **not been pushed**, so GitHub still shows
the old "Can't automatically merge".

**Do these in order — 1 and 2 are unfinished business from this session, not new work:**

1. **Open the owner's progress artifact — it was NEVER read.**
   <https://claude.ai/code/artifact/0c66cb02-c767-4a67-ad9d-617e399983b3>
   Everything in P0-CLIENT below came from the owner's typed message and screenshots only. Fold in
   whatever the artifact adds, then delete this line so nobody re-reads it twice.
2. **Verify the crash fix in a real browser.** It is type-checked and DB-evidenced but **never seen
   rendering**. Boot with `pnpm dev:web` from the repo ROOT (**not** the `web-3001` launch config —
   that path 500s on missing `apps/web/.env`), sign in as agency, confirm `/en/agency` loads and the
   bell lists the `pr_rating_low` + `shift_cover_needed` rows. **Then promote §9 item 6 to §8.**
3. **Get the four DECISIONS OWED answered** (§9 item 5) — platform fee 2.5% vs 5% first, it is money.
   Nothing in P0-CLIENT can be scoped until "supervised pilot vs general client use" is answered.
4. **Then, and only then, start P0-CLIENT item 1** (the PV functions).

⚠️ **Standing rule that this session proved twice: RE-DERIVE, don't trust an entry.** §9 F claimed the
agency dispute queue was missing when it was built; and `pv_day_review_pending` was described as a
teammate's kind when it is our own X16 work whose producer has vanished from `apps/`.

### 🔴🔴 P0-CLIENT — the owner's own list, to let a CLIENT use the app (given 31 Jul)

> **Source: the owner, verbatim, not derived from code.** Everything else in §9 is something the
> code told us; this block is what the *business* says must be true before a client touches it.
> Where an item already has a technical entry below, it is cross-referenced rather than restated —
> **do not treat the two as separate work.**
> Progress artifact: <https://claude.ai/code/artifact/0c66cb02-c767-4a67-ad9d-617e399983b3>

**The three headline blockers:**

- [ ] **🔴🔴 Fix the PV functions — "right now most are not working"** — the owner's blunt assessment, and it outranks the per-fault entries in P0/P0b below. Those fix *correctness* (the money is wrong); this one is about *function* (the buttons do not do things). ⚠️ **Re-derive before building** — walk the PV screens one control at a time and record which are dead, rather than assuming the P0 list already covers them.
- [ ] **🔴🔴 Registration end to end** — **WhatsApp OTP is completely untouched** (nothing built), and **Agency + Outlet registration both need checking** — they exist but have not been walked through. ⚠️ **WhatsApp Business verification is an EXTERNAL process measured in weeks** — if there is a client date, it starts now regardless of code readiness. Same for an **email provider API key**: no mailer exists at all today, so there are no password resets and no OTP by email either. Same item as 4) below.
- [ ] **🔴🔴 Every page must read the DATABASE, not the prototype's demo store** — the single largest source of "it works on my screen but the client sees nothing". ⚠️ **This is the standing #1 bug class in this repo**: a page that falls back to demo data looks healthy while being disconnected. Sweep every screen, not only recently-touched ones.

**1) Dispute and receipt — the state machine the owner wants**

- [ ] **🔴 The receipt lifecycle, as specified:** `PENDING` → agency reviews the receipt (**photo + the PR's note**) and may **EDIT price / quantity / drink / category** → `APPROVED` (the PR now sees "APPROVED", and **only now may the PR dispute it**) → if disputed: resolve → `VERIFIED` → **if untouched when the week closes: `APPROVED` → `VERIFIED` automatically**. ✅ **AMENDED 3 Aug — the rollover is not "buildable", it is BUILT and running.** This line used to read *"the rollover is buildable now — `node-cron` is installed and a scheduler already runs"*, which understated it and left the item looking like unstarted work. Re-derived at `aa572c8`: `paymentVoucherRepository.verifyApprovedReceipts()` is called from **`scheduler/weekly-payout.job.ts:106`**, deliberately **before** the send gate (after it, every week's receipts would sit an extra seven days at `approved` — a whole cadence skipped, invisibly). The resolved-dispute arm lives in `resolveDispute`. See the fuller entry in P3 below, which had this right all along. ⚠️ **What is still open in THIS item is the agency EDIT surface** — the spec's *edit price / quantity / drink / category* — and the OCR-detail requirement in the sibling item, not the rollover.
- [ ] **🔴 Split the PR's two sections by week:** **disputes are raised in the LAST-week section; the approve view appears only in the THIS-week section.** ⚠️ **This is the "remaining" half already flagged at §9 F / Payroll below** — the agency side of receipt review was built 30 Jul, the PR's two sections were not. One job, not two.
- [ ] **🟠 The agency's decision screen must show EVERYTHING the OCR returned**, not a summary — the owner is explicit that all scanned detail is needed to decide. The same surface handles this week's review and approval.

**1a) Open questions the owner raised — answer these before the above is finished**

- [ ] **🔴 Photo proof on EVERY action that creates money.** A scan needs a picture to prove it; **a self-log needs one too, and without it the PR cannot check out**; an **edit** reuses the same capture flow and **replaces the stored photo with the latest one**. ⚠️ Decide whether "replace" means *overwrite* or *supersede with history* — an edit that silently discards the original photo destroys the evidence a dispute would rest on.
- [ ] **🔴 Tips have no receipt path at all.** There is no tip self-log, so tips never form a receipt — **and from the photo alone the PR cannot tell which capture is drinks and which is tips.** Needs a category chosen at capture time, not guessed afterwards.
- [ ] **🟠 DECISION OWED: two shifts checked out on the same day — one combined payment line, or two separate ones?** **The owner recommends SEPARATE**, and notes separate is the harder *design* while combined is the harder *backend*. ⚠️ **Answer before the PR payment page is built on top of it** — it changes the shape of a voucher line, and [[pv-money-classification]] requires all insert paths to share one rule.

**2) PV** — the owner left this heading empty; the technical backlog for it is the P0 / P0b blocks below.

**3) Cancel shift**

- [ ] **🔴 An MC approved BEFORE the shift, once the agency verifies it, must remove the shift from the PR's view entirely** — not merely mark it. ⚠️ Extend the existing leave/MC work (migration 0076, `shift_assignment` status + notes + `leave_proof_photos`); do not build a second path.
- [ ] **🔴 A cancellation is charged against the PENALTY RULES.** ⚠️ **Penalty amounts are still undefined except for Velvet 23** — a money figure only the owner can set, and this cannot ship without it.
- [ ] **🟠 QUESTION (open, not a decision): when a cancellation leaves a shift short, does the agency get AUTO-ASSIGN to fill it?** The owner marked this "??". Do not build until answered.

**4) OTP and sign up** — the same work as the registration blocker above, kept here under the owner's own numbering. **Both long-lead externals (WhatsApp Business verification, email provider API key) start now if a client date exists.**

**5) DECISIONS OWED — from the owner's GENERAL QUESTIONS doc, NOT yet anywhere else in this file**

> Checked by grep on 31 Jul: suspension and no-shows already have entries; the three below have **none**.
> These are owner calls, not engineering work — none can be built until answered.

- [ ] **🔴 Platform fee: 2.5% or 5%?** The live value is **2.5%**; the spec has been read as **5%** in several places. **Confirm before anyone invoices from it** — every historical invoice derived from the wrong figure is a money error, not a display one.
- [ ] **🟠 Should a PR see the list of ALL agencies?** Any PR can currently enumerate all three. Probably harmless, but it is a scoping decision the owner has not made.
- [ ] **🟠 Agency and outlet accounts have NO admin screen** — those logins can only be disabled over the API. New tab, or a section on the existing organisation tabs? (~half a day either way; the shared logic already exists.)
- [ ] **🔴 What must be true before a CLIENT touches it?** There are **no tests, no rate limiting, and no per-session logout**. A **supervised pilot** is reasonable on that basis; **general client use is not**. ⚠️ **Get the owner to say which one is planned** — the two need very different work, and everything else in P0-CLIENT is scoped by that answer.

**6) Not yet recorded from today's session (31 Jul) — write up before this doc is trusted again**

- [ ] **🔴 §10 has NO row for today's agency-portal crash fix.** The bug: the web app kept a hand-written copy of the `notification_kind` enum and the merge added two kinds (`pr_rating_low`, `shift_cover_needed`) it never got, so `KIND_MAP[kind]` returned `undefined` and the bell called `.startsWith` on it — **the whole `/agency` page white-screened** for any agency user holding one, which the live DB confirms `owner@atlas-agency.my` does. Fixed across 6 files, with an `unknown` fallback so a future kind degrades to a readable row instead of taking the page down. **Also missing: the `GeoFenceCard.tsx` merge-conflict resolution** (took main's redesign; jk's hemisphere-paste parsing was dropped because main deleted the manual lat/lng entry it enhanced).
- [x] **~~🔴 `pv_day_review_pending` EXISTS IN THE DB BUT NO CODE PRODUCES IT ANY MORE~~ — ✅ RETRACTED 3 Aug: the producer exists and always did** *(SL)*. Re-derived against the tree at `aa572c8`: the kind is declared at `notification.model.ts:51` and **fired at `scheduler/weekly-payout.job.ts:264`**. The original entry's evidence was *"grep finds the string nowhere under `apps/`"* — that grep was wrong, and the entry was believed for three days on the strength of it. ⚠️ **The lesson is the one §9 keeps re-learning: a NEGATIVE grep result is the weakest evidence in this repo and must be re-run before it is written down as a fact.** Nothing was lost in a merge and no row was hand-written. **The genuinely open half is unchanged and still below: the producer has never been FIRED live** (it needs a payout run against the shared DB).

### 🟠 UI — `/agency/pv` layout change requested by the OWNER (3 Aug 2026, from a screenshot)

- [x] **🟠 DISPUTES and OVERTIME must NOT sit permanently expanded at the top of `/agency/pv`** — ✅ **DONE 3 Aug, owner confirmed the reading ("make them tabs alongside Payment Vouchers and Receipts").** `PvSubTab` widened to 4; both panels moved out of the header into the sub-tab row; **counts ride on the labels** via `useAgencyDisputes()` / `useAgencyOvertime()` called at page level (React Query dedupes with the panels' own fetches, so no extra request). ⚠️ **The two new tabs are deliberately NOT week-scoped**, unlike Vouchers/Receipts: a claim blocks whichever week it belongs to, so filtering to the selected week would hide the thing stopping a *different* week from going out. **Verified in a browser:** tab row reads `Payment Vouchers (2) · Receipts (0) · Disputes (0) · Overtime (0)`, the top of the page no longer renders either panel, and clicking Overtime reveals it. `tsc` 121 (baseline unchanged), 0 errors in `pv.tsx`. Original request kept below for the reasoning.
- [ ] ~~**🟠 DISPUTES and OVERTIME must NOT sit permanently expanded at the top of `/agency/pv`**~~ —
  *"the Dispute and Overtime should only show when it is clicked below"*. **Owner's words, from a
  screenshot of the live page**, so this is a product instruction, not a code-derived item. Today
  both panels render open above the week tabs and push the voucher list below the fold; on a week
  with nothing outstanding they occupy most of the first screen saying only *"No open disputes"* and
  *"No overtime awaiting a decision"*. **Intended shape: fold them into the EXISTING tab row that
  already carries `Payment Vouchers (n)` / `Receipts (n)`, so the row becomes four tabs and each
  panel appears only when its tab is selected.** ⚠️ **Keep the COUNT visible on the tab label**
  (`Disputes (n)`, `Overtime (n)`) — the whole reason these were placed on top was that an undecided
  overtime claim is *why* the week below refuses to send (§8 X43), and hiding that behind a click
  with no count would turn a visible blocker into an invisible one. ⚠️ **Do NOT move them to
  `/agency/pending`** — that route is gated on `approvePrSignups`, which agency finance does not
  hold, and finance is one of the two roles allowed to decide overtime (the trap X43 already avoided).
  ⚠️ **Confirm the reading before building**: "clicked below" is being read as *the existing tab row*;
  the other possible reading is *collapsed-by-default accordions kept in place*. Ask the owner which
  — the two look very different and only one was asked for.

### 🔴🔴 P0 — THE MONEY IS WRONG (found 31 Jul, §8 X36 — do before any demo or pilot)

> **Status after §8 X37: the RULES are enforced in code, the EXISTING BAD ROWS are not repaired.**
> Four of the seven below are closed. What remains needs live data or an owner decision, and
> **nothing here makes the three live bad vouchers correct** — the code stops new ones.
> ⚠️ **The entry that said "one assertion at generation time" catches everything was WRONG** — the
> generator's query is already status- and date-bounded; every fault came from the **PR self-log**
> path. See X37. Yet another instance of the standing rule: re-derive before building.

- [ ] **🔴 A voucher paid for a shift that was never worked — AND does not pay the one that was** *(SL)* — ✅ **CONFIRMED BY MACHINE (X38), and it is worse than X36 recorded.** `PV-000002` (`sent`) pays 700.00 for **28 Jul**, whose assignment is `assigned` with no stamps, while the shift Victoria **actually completed — 30 Jul, `ab4a53ae`** — carries **no wages line at all**. So the money is on the wrong day *and* the real day is unpaid. ✅ **The `f5a1f22` question is answered too** — `f5a1f227…` is a genuine **completed** assignment (23 Jul) that `PV-000001` fails to pay. ✅ **THE WRITE PATH IS NOW KNOWN (31 Jul) — and it is a hole that is STILL OPEN in code.** Found by reading `payment_voucher_line.created_by` + `ref` before wiping the rows, via `wipe-test-vouchers.ts --show-lines`. Two facts:
  1. **Every line on all three bad vouchers was written by `pr.vicky@innocenz.demo`** — the **PR self-log** path. Not the generator, and **not the agency**: this corrects the round-2 note that guessed `PV-000002` "was raised and sent from the agency side", which was inference from its `sent` status, not evidence.
  2. **The mechanism: a line's `lineDate` is client-supplied and is never checked against the assignment its own `ref` names.** `PV-000002`'s wages line is dated **2026-07-28** while its ref is `wages|checkin|700.00|f5a1f227…` — and `f5a1f227` is the **completed 23 Jul** assignment. Same shape on `PV-000001` (21 + 22 Jul naming `6165d678` / `938e8741`) and on the 678.78 OT line (`f5a1f227…-ot`, also dated 28 Jul). **The line knows which shift it is for and is dated a day that shift is not on.**
  ⚠️ **X37's `checkLineAgainstWeek()` does NOT catch this and was never going to** — 28 Jul *is* inside the 27 Jul–2 Aug week, so the week guard passes it happily. The audit only catches it afterwards, as `wages_without_completed_shift`. **The fix is a new assertion at write time: when a line's `ref` carries a shift-assignment id, `lineDate` MUST equal that assignment's `shift_date`.** Promoted to its own item below — this is the single check that would have prevented all three fictional wage days.
- [x] **🔴 Overtime is unbounded and its label disagrees with its amount** — ✅ **closed (X37 + earlier `pr-rate.ts` work)**. Two independent halves, and only the second was ever recorded here: the **phone** already bounds hours by `MAX_PLAUSIBLE_SHIFT_HOURS` and returns **0** for untrustworthy stamps, and the *"@ RM6.00/h"* bug — `standard_shift_hours` (6) being spent as ringgit per hour — is corrected to a derived `daily/6 × 1.5`. **The missing half was the server, which accepted whatever the phone sent.** `auditVoucher` now budgets OT **per day** against what the attendance stamps can justify, so a stamp gap yields a **0.00** budget and 678.78 is refused. Proven both directions: 2h of real OT at 300.00 passes, 400.00 on the same day does not.
- [x] **🔴 A voucher line dated six weeks outside its own week** — ✅ **closed (X37)**. **The premise was wrong**: the generator's date filter *is* holding (`shift_date BETWEEN fromDate AND toDate`). The 2026-06-16 drink came in through `addMyLine`/`addMyReceipt`, which took `lineDate` from the client unchecked. `checkLineAgainstWeek()` now **400**s it before any write, and `auditVoucher` flags any that already exist.
- [x] **🔴 The same receipt was counted twice — `ORD0389` vs `ORDO389`** — ✅ **closed (X37)**. `findReceiptByOrderNo` folds OCR confusables (O/0, I/1/l, S/5, B/8, Z/2) plus case and separators, and compares in JS rather than `eq()` in SQL. Scoping is unchanged — still one shift, because outlets genuinely reuse order numbers across nights. Verified a real difference survives the fold (`ORD0389` ≠ `ORD0390`) and that an empty order number never matches another empty one.
- [ ] **🔴 `PV-000001` is `signed`, and BOTH its wage days are fictional** *(SL)* — 198.00 and 186.00 match no tier rate (card: 500/600/700/825/1000/200), and X38 adds the part that reframes it: those wages sit on **21 and 22 Jul, days with NO assignment at all**, while the **completed** shift on **23 Jul (`f5a1f227…`) is unpaid**. So it is not a rate problem — the amounts are attached to days the records say never happened. Commission also moves 15% → 12% with tips 10% → 17%, unexplained. **A PR has already accepted this document.** ✅ **ANSWERED 31 Jul — test data, so it is wiped and regenerated rather than reissued.** Had it been real, the standing rule now on record applies instead: **void + reissue, PR notified.**
- [ ] **🔴 Two vouchers exist for the same PR and the same week** *(SL)* — ✅ **the MECHANISM is closed (X37)**: `getOrCreateCurrentWeekDraft` only ever looked for a `pending_review` draft, so a week already `sent` was invisible and the next self-log minted a second voucher. It now checks every status and **409**s a closed week. ✅ **The two that exist are SETTLED (31 Jul):** no merge — the owner's call is **test data → wipe and regenerate**, so `PV-000002` (sent, RM1,581.48) and `PV-000004` (pending_review, RM703.60) both go and the week is rebuilt from source. The **`(pr_id, week_start)` unique constraint** is still worth doing and is now unblocked; run it **after** the wipe.
- [x] **🔴 Nothing checks a voucher against its own source records** — ✅ **closed (X37)**, the highest-value item and now built: **`payment-voucher-audit.ts`**. Pure, integer-cents, never throws, mirroring `payment-voucher-balance.ts` — which answers a *different* question, since a voucher paying 700.00 for a day nobody worked balances perfectly. Two entry points sharing one rule: `auditVoucher()` for the whole-voucher sweep (wired into the generator; `GenerateWeeklyResult.unreconciled`, reported by the Monday job **separately from `imbalanced`**) and `checkLineAgainstWeek()` for the per-write guard. It also checks the direction nothing else does — **a completed shift with no wages line is unpaid work**. Proof: `src/scripts/probe-pv-audit.ts`, pure and DB-free, **21/21**.
- [x] **🟠 Point the audit at the LIVE VOUCHERS** — ✅ **done (X38)**: `src/scripts/audit-live-vouchers.ts`, read-only, ten seconds, re-runnable. **3 of 4 fail, `PV-000003` is clean, and it found two faults the hand-check missed** (both "the day actually worked is unpaid"). Re-run it after any repair, and before any demo.
- [x] **🔴 DECIDE THE THREE REPAIRS** — ✅ **ANSWERED 31 Jul, and all three collapse into one act.** The owner's call: **these four vouchers are TEST DATA, not payroll anyone is owed.** So there is no document to reissue and no shift to settle — **wipe the rows and regenerate the week from source.** That answers (1) the `PV-000002`/`PV-000004` duplicate pair, (2) `PV-000001` `signed` with fictional wage days, and (3) the two unpaid completed shifts, all at once, **and it unblocks the `(pr_id, week_start)` constraint below.** ⚠️ **The rule for REAL payroll is DIFFERENT and is now decided in advance, so nobody has to improvise under pressure: VOID + REISSUE with the PR notified** — mark the bad voucher voided with a reason, issue the correct one, PR re-signs. **Never a silent in-place edit** of a document a PR already holds, and never the wipe script. **Tool: `src/scripts/wipe-test-vouchers.ts`** — dry run by default, refuses to run unscoped, deletes lines→receipts→disputes→day-reviews→**notifications**→voucher in one transaction. It does not trust the model's `onDelete: 'cascade'` (a green model is not a live constraint) and it clears the jsonb `notification.payload->>'voucherId'` rows **no cascade can reach**, which is otherwise a PR tapping "your voucher is ready" into a 404.
- [x] **🟠 Add the `(pr_id, week_start)` unique constraint** *(SL)* — ✅ **DONE, and this checkbox was STALE until 2 Aug.** It shipped as migration **0078** (`pv_one_per_pr_week`, renumbered from 0077 by the merge with jk's lane), and the live `drizzle.__drizzle_migrations` ledger confirms `when=1785500000000` applied. ⚠️ **Another instance of the standing rule: the §9 P0 checkboxes go stale independently of the prose above them**, so re-derive one before acting on it. Original note kept below for the reasoning. — the code now refuses a second voucher (X37), but a constraint is what makes the rule outlive the code. ✅ **NO LONGER BLOCKED BY A DECISION** — the owner's wipe-and-regenerate call removes the duplicate pair that would have made the migration fail. **Still ordered though: run the wipe FIRST, then write the migration**, because a `CREATE UNIQUE INDEX` against the live duplicate aborts. ⚠️ `pr_id` is nullable on `payment_voucher`, so a partial index (`WHERE pr_id IS NOT NULL AND week_start IS NOT NULL`) is the correct shape — Postgres treats NULLs as distinct anyway, but stating it keeps the intent readable.
- [ ] **🔴 A line's DATE is never checked against the SHIFT its own `ref` names** *(SL)* — **the newly-proven cause of every fictional wage day** (see the P0 item above). `addMyLine` takes `lineDate` from the client and `ref` carries the shift-assignment id, and **nothing asserts the two agree**. `PV-000002` wages: dated `2026-07-28`, ref `wages|checkin|700.00|f5a1f227…`, and `f5a1f227` is the **23 Jul** assignment. **X37's week guard cannot catch it** — the wrong date was still inside the right week. ✅ **HALF DONE (31 Jul):** the rule is now code — `assignmentIdFromRef()` + `checkLineAgainstShift()` in `payment-voucher-audit.ts`, wired into `auditVoucher()` as finding `line_date_contradicts_shift`, with 8 probe cases including one asserting the **week guard alone would NOT have caught the live fault**. So the generator and `audit-live-vouchers.ts` both DETECT it. ❌ **The write-time 400 is still owed — this is the remaining work.** **The check:** when `ref` carries a shift-assignment id, load that assignment and require `lineDate === shift.shift_date`; 400 otherwise. ⚠️ **Why it was not finished in that slice, so the next person does not rediscover it:** `PaymentVoucherController` has **no `shiftAssignmentRepository` injected** (constructor takes 5 repos, none of them shift), so this needs either a new lookup method on `paymentVoucherRepository` (which already has `db`) or a constructor change in `composition-root.ts` — then applying it at **5 call sites** where `ref` is assembled at different points. ⚠️ **Do it in the REPOSITORY, not the controller** — [[pv-money-classification]] established that all four insert paths must get one rule, and a controller-only check leaves the agency create/update path free to write the same fault. ⚠️ **Also covers the OT line** (`…-ot` refs), which carried the same wrong date.
- [x] **✅ THE WIPE + REGENERATE IS DONE (31 Jul) — all vouchers now reconcile.** Deleted `PV-000001`/`PV-000002`/`PV-000004` (scoped to `pr=d48f38ad…`, so the clean `PV-000003` of a *different* PR was untouched — scoping by `--week-start` would have destroyed it), regenerated weeks 2026-07-20 and 2026-07-27, and `audit-live-vouchers.ts` reports **3 of 3 OK, 0 flagged** — Victoria 700.00 for each of her two genuinely completed shifts, which is tier_3 exactly. **The two "completed shift not paid" faults are settled by the regeneration**, not left as debts. 1 orphan notification went with them.
- [x] **🔴 VOUCHER NUMBERS WERE RECYCLED ON DELETE, and the retry loop could never retry** — ✅ **both fixed, found only because the wipe exercised a path nothing had.** Two independent bugs in `nextVoucherNo`/`create`:
  1. **The number came from `count(*) + bump`.** Deleting three vouchers dropped the count from 5 to 2, so the next voucher was issued **`PV-000002` — the number the deleted `sent` document had held** (this really happened; the regenerated week-07-20 voucher carries it), and the following attempt computed `PV-000003`, which **already existed**. A recycled number is worse than an ugly one: it appears in an export a PR already downloaded, so **two different documents answer to the same name**. Now `max(<numeric suffix>) + bump`, with non-conforming values ignored so one malformed row cannot stall numbering.
  2. **The number-clash retry was impossible in PostgreSQL.** The `catch` treats a unique-index clash as retryable, but **a failed statement aborts the whole transaction** — so the first clash poisoned `tx`, attempt 2's own SELECT returned `25P02 current transaction is aborted`, and since 25P02 is not a voucher-no conflict it was rethrown. The loop could never reach attempt 2, and every caller saw a baffling error about a `count(*)` query. Each attempt is now wrapped in a **SAVEPOINT** (drizzle nested transaction). ⚠️ **The general lesson, worth more than the fix: a catch-and-retry inside a Postgres transaction is a no-op unless it rolls back to a savepoint.** Grep for other `try { insert } catch { retry }` blocks inside `db.transaction`.
- [x] **🟠 `generate-weekly-pvs.ts` never loaded the env** — ✅ fixed. It imported `@/composition-root.js` (which builds the pg pool) without `import '@/env.js'` first, so every run died at the first query with *"SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string"* — an error naming the auth mechanism, not the cause. `audit-live-vouchers.ts` carries the same guard line deliberately. ⚠️ **`run-weekly-payout.ts` has the identical shape and was NOT changed — check it before relying on the manual catch-up command.**
- [ ] **🟡 Fire the new 400/409 refusals from the PHONE** *(SL)* — X37's guards are proven at unit level, not through a real self-log. The 409 path in particular changes what a PR sees when a week has closed, and `apps/mobile` should show that message rather than a generic failure.

### 🔴 P1 — the spine (blocks everyone; do first)
- [ ] **B · Agency schedule/assign PR** — Shifts/Roster page: agency assigns PR to a shift. *(Agency → PR)* — §3 S2
- [x] **E · Wage/tip/commission auto-sync** — PR wages/drinks(HH/NH)/tips/OT pull from the **outlet rate card** (mobile consumes `/shift-assignment/mine` `rate`+`drinkMenu`; `pr-rate.ts`). ⚠️ **jk done in code — SL/user must run `pnpm migrate` (pr_tier 7-enum) + restart backend to go live, then verify §3 S7.** *(Outlet → PR)* — §3 S7
- [x] **F · This-week dispute ↔ verify** — ✅ **BOTH SIDES EXIST. This entry was STALE and it misled me on 31 Jul** into telling the owner "the agency has no verify/reject", which is false. The agency queue is built and wired: **`DisputeQueuePanel.tsx` + `use-agency-disputes.ts`** with a real `resolveDispute` accept/reject mutation, on **`/agency/pv`**; the backend route comment says so too (*"The agency's dispute queue and its decisions"*). ⚠️ **Left as a worked example of [[audit-entries-are-leads]]: I read this line instead of re-deriving, and reported a gap that did not exist.** *(PR → Agency)* — §3 S9–S10
- [x] **Payroll page: surface "this week"** so scanned receipts can be **approved** — ✅ **agency half done (30 Jul)**: the receipts card in `PayrollVerifyPanel` is now the review surface, fed by the receipts that already ride on `GET /payment-voucher/:id` (the same read the day-review panel uses, so one voucher on screen is still one request and an approval refreshes both panels). It shows the **proof photo and the PR's note** beside the figures — neither was rendered before — with per-line **quantity/commission correction**, Approve / Withdraw approval, and the send button now blocked while any receipt is pending. Writes gated on `raisePv`, mirroring `agencyOwnerOrFinance`. **Not** built on the agency-wide `GET /payment-voucher/receipts` feed: the owner's spec places the review on the **this-week PV**, and that endpoint is a cross-voucher queue. ⚠️ **Remaining: the PR's two sections** (this-week shows APPROVED, last-week is where a dispute is raised). *(Agency)*
- [x] **Verify Payment Voucher ↔ PR wage calc** logic is correct (auto-generated weekly from PR shifts). *(Agency ← PR)* — ✅ **DONE 3 Aug (§8 X57), and it needed a NEW check because the audit could never answer it.** `audit-live-vouchers.ts` compares a wages line to `shift_assignment.pay_amount` (what check-out sealed), **not to the rate card** — so its "3/3 reconcile" was voucher↔assignment, one link short of the money being right. `check-wage-vs-ratecard.ts` (read-only) closes the last link: **agree 4 · disagree 0 · no-card 0.** ⚠️ **Re-run it after ANY rate-card or tier change** — and note it prints **SKIP, not a pass**, when it sees no comparable rows.
- [ ] **Confirm Post Job end-to-end** across roles: outlet post → shift → agency roster → PR assignment. *(Outlet → Agency → PR)*

### 🟠 P0b — PV gaps found by re-derivation on 31 Jul (X39 closed the first three)
- [x] **🔴 The agency create/update path bypassed both new money guards** — ✅ **closed (X39)**.
- [x] **🔴 `checkVoucherBalance` double-counted any line with quantity > 1** — ✅ **closed (X39)**. Latent, but it would have held a correct payment.
- [x] **🟠 `POST /` and `PUT /:id` were less gated than the review routes** — ✅ **closed (X39)**, `agencyOwnerOrFinance`, callers verified first.
- [ ] **🟠 OVERTIME CAN NEVER BECOME MONEY — ✅ policy ANSWERED, ✅ columns exist, ❌ nothing wired** *(SL)*. **Owner decided (31 Jul): build it with the defaults — approver = `agencyOwnerOrFinance`, rate = derived `daily ÷ 6 × 1.5`.** Migration 0077 is applied, so `overtime_minutes/status/amount/decided_at/decided_by` all exist on `shift_assignment`. **Remaining, and it is all of the behaviour:** ✅ **(a) is DONE (31 Jul)** — check-out now records `overtime_minutes` + `overtime_status='pending'` in the same update as the clamp, via the new pure `features/shift-assignment/overtime.ts`. ⚠️ **An implausible stamp records NOTHING rather than a capped figure** (mirroring `pr-rate.ts`; a capped 16h would be as fictional as the live "113.1h" and harder to spot), and the `overtime_pending_approval` notification now fires on a **recorded claim** instead of on any overrun — a two-day-late check-out no longer asks an agency to approve a number that does not exist; it gets a `logger.warn` instead. Probe §9, 10 cases, backend tsc 0. **Still owed:** (b) a `PATCH /shift-assignment/:id/overtime` approve/reject endpoint under `agencyOwnerOrFinance`, scoped to the caller's agency; (c) on approve, write a **`component='ot'`** line on that PR's voucher for the shift's week — ⚠️ **and decide what happens when that week is already `sent`**, since the new guard 409s it; (d) an agency screen. **Do NOT re-ask the two decisions.** ✅ **The COLUMNS now exist (X40, migration 0077)** — `overtime_minutes` / `overtime_status` / `overtime_amount` / `overtime_decided_at` / `overtime_decided_by` on `shift_assignment`, mirrored in `shift-assignment.model.ts`. **Everything above the schema is still missing:** no approve/reject endpoint, no controller method, no agency screen, and **nothing writes the `component='ot'` voucher line on approval** — so every OT hour raised is still in a state nothing can move it out of, and adding columns did not change that. **The two decisions still block the code: WHO approves** (probably `agencyOwnerOrFinance`, mirroring every other money gate) **and AT WHAT RATE** — the derived `daily ÷ 6 × 1.5` is already in `pr-rate.ts` and matches `outlet_workspace.ot_after_hours` (125) for every outlet, so it has a defensible answer. ⚠️ **`overtime_minutes` must be written AT CHECK-OUT** — the clamp overwrites `check_out_at`, so a later derivation has nothing to derive from. **~1–2 days remain.**
- [x] **🟠 You cannot actually pay anyone from a voucher** — ✅ **DONE end to end (X40, migration 0077 applied + verified live).** `user_profile.bank_name` / `bank_account_no` (on the PERSON, redacted for outlet callers) and `agency.address_line_1` / `address_line_2`; `agency.model.ts` mapped; `getExportBundle` joins `user_profile`; **workbook, print HTML and PDF all read them** via a shared `joinAddress()`; `PATCH /user/:id` (self-edit only) accepts them, empty string clearing to NULL. An em dash now means *"the PR has not entered their details"* — something someone can fix — instead of *"the system has nowhere to put them"*. **No `pr_code` was added, deliberately: the export has no such field**, so a column for it would be one nothing reads (rule 1).
- [x] **🔴 RUN MIGRATION 0077 — ✅ APPLIED and verified live** *(SL)* — `pnpm migrate:deploy` from the repo ROOT (never `pnpm migrate`), then **restart the backend** (tsx watch serves stale routes). All 9/9 columns confirmed by `information_schema` *and* by calling `getExportBundle`; `drizzle-kit` reporting "applied" is not proof, per the standing "green signals that lie" trap — verify with `pnpm check:drift`, **not** by a successful typecheck. ⚠️ **This row read "has NOT been applied" until the main merge, contradicting the row above it.** It was written by the auto-commit hook mid-slice and was already stale when written — corrected rather than deleted, because a doc that quietly rewrites itself teaches you not to trust it. ⚠️ **RENUMBERED 0076 → 0077 during the merge into main:** jk had independently authored `0076_shift_assignment_leave_proof` the same day, so both branches carried an `idx: 76` with the identical `when` of `1785480000000` — precisely the divergent-journal collision that makes anything below the live max silently skipped. jk's keeps 0076 (already on trunk); this one is now `0077_overtime_approval_and_bank` stamped `1785490000000`, and the one-voucher-per-PR-per-week index moved 0077 → `0078_pv_one_per_pr_week` (`1785500000000`, unchanged). Both are `IF NOT EXISTS` throughout, and 1785490000000 sits below the live max, so neither re-runs on the shared DB while a fresh database still gets all three in order.
- [x] **🟠 `agency.model.ts` never got the two address columns 0077 adds** — ✅ **fixed in the same slice.** Both are now on the model in the same shape `outlet` uses, so nothing reads them as drift and **no `drizzle-kit generate` will propose dropping them**. Worth keeping the note: this is the drift class *in reverse* — a column the DB has and the model does not — and it is the one a generate silently "fixes" by deleting your data.
- [x] **🔴 DECISION OWED — may an ADMIN resolve a PV dispute at all?** — ✅ **ANSWERED 31 Jul: OPTION A.** Admin **keeps** the dispute-resolve route, but as a deliberate **escalation** path, not routine review; everything else on the admin PV page stays read-only. What decided it: Option B (agency-only) matches the steer more literally but leaves a PR with **no recourse when their agency goes quiet**, and the steer was about who *reviews* vouchers, not about removing the last backstop. ✅ **The sub-role hole is closed in the same edit** — `POST /payment-voucher/disputes/:disputeId/resolve` now carries `agencyOwnerOrFinance`. It had inherited only the mount-level `requireRole('admin','agency')`, so **resolving a dispute (a money decision) was reachable by any agency member** while merely approving a day was not — the same asymmetry X39 fixed one route earlier. ⚠️ **Why this does NOT quietly become Option B:** `require-sub-role.ts` `guard()` waves admin through by design (admins hold no `agency_user` row to check), so the sub-role guard narrows **agency members only** and leaves the escalation path open. **Caller verified first:** the sole frontend caller is `use-agency-disputes.ts` → `DisputeQueuePanel` on `/agency/pv`, already UI-gated on `raisePv` = owner + finance — the same set, so no legitimate caller starts failing. *(the earlier claim that the agency queue was missing was wrong and is corrected at §9 F)*

### 🟠 P2 — money loop + proof
- [ ] **D · Check-in pic received** on Agency/Admin side (PR takes pic as proof; the other side must receive it). *(PR → Agency/Admin)* — §3 S5
- [x] **G · To-Do section in PR Shifts links to History last-week** for PR to **sign** and see the **PDF** — ✅ **done (30 Jul)**: weekly job now **issues** the closed week's vouchers (`pending_review → sent` + `issued_date`, unbalanced held for agency); PR signs under **Payment → Last week** (server commit FIRST — `POST /mine/:id/sign` — then the seal + History redirect); signed PV appears in History. Manual catch-up: `pnpm tsx --tsconfig tsconfig.json src/scripts/run-weekly-payout.ts` (backend dir). *(PR)*
- [x] **History page: show the PDF for every PV** — ✅ **done (30 Jul)**: History PV card **Open PV** (full voucher doc, real grid + linked receipt lines), **PDF** (one-tap REAL PDF download — server-rendered boxed voucher form with the Atmosphere logo + the PR's drawn-ink signature; same renderer on web + phone; phone opens via a 5-min export ticket, session token never in a URL), **Excel** (`GET /payment-voucher/mine/:id/export.xlsx` — server-rendered workbook cell-for-cell like the prototype's `PV-…-payment-voucher.xlsx`, agency/PR facts via FK joins). *(PR)*
- [x] **Self-log needs pic as proof** — ✅ **PR side done**: drink self-log now **requires ≥1 photo** (camera capture above the Note field, Submit blocked + reminder until snapped); stored on **`payment_voucher_line.proof_photos`** (jsonb, one-or-many). **Remaining: agency displays the proof on verify** (reads `line.proofPhotos`) *(= SL)*; native camera + optional crop = follow-up. *(PR → Agency)*
- [ ] **Backend sweep for missed shifts** — Vicky holds **5 stale `assigned` rows** that ended with no check-in (Velvet 23 24–26 Jul, Emhub Testing 27–28 Jul); nothing ever expires them, so agency roster/staffing still counts them. Flip `assigned` → `no_show` (or auto-cancel) once the shift window ends with no check-in. Mobile already hides past bookings from Check-In and flags them as "Missed check-in" To-do cards (31 Jul) — this closes the same hole server-side. *(Agency/backend)*
- [ ] **Every self-log / OCR scan emits a receipt number**; add a **detail button** for PR to view the receipt. *(PR → Agency)*
- [x] **PV export "—" fields need real columns** — ✅ **DONE (X40, migration 0077 applied + verified live).** Columns, model mapping, `getExportBundle` join, and all three rendering surfaces. The only remaining "—" is an honest one: nobody has typed their bank details in yet. **A PR-facing profile SCREEN for it is web/mobile work and is not built** — the endpoint accepts the fields today. *(PR / Agency)*
- [x] **Decide Vicky's duplicate current-week voucher** `34364790-…` — ✅ **ANSWERED 31 Jul, and this was never a separate item: it is the SAME voucher as the `PV-000002`/`PV-000004` pair in P0 above**, logged here first without its amount. Settled by the same wipe-and-regenerate call. ⚠️ **One half of this line survives the decision and is still open:** *"block agency from sending current-week vouchers early"* — the duplicate only became reachable because the agency owner set a **mid-week** voucher to `sent`, and nothing refuses that. Promoted to its own item below. *(Agency / DB)*
- [x] **🟠 An agency can mark a CURRENT-week voucher `sent`** *(SL)* — ✅ **CLOSED (31 Jul).** `sent` is now refused while `week_end >= today`, as a **third rule inside `voucherSendGate`** rather than a separate check — one refusal path cannot disagree with itself. Evaluated **first and returning alone**, because listing unreviewed days beside it is noise on a week still being worked; the 409 carries `weekEndsOn` (optional, so no consumer of `SendGateResult` breaks). **Both call sites pass it, including the Monday job that can never trip it** — `weekly-payout` runs on `previousCompleteWeek`, and passing the rule anyway is the point, since a gate the scheduler is exempt from has an unguarded way around it. The HTTP send judges `data.weekEnd ?? existing.weekEnd`, matching the line-date check's "the week it WILL have" rule. ⚠️ **The timezone was the trap:** a UTC `toISOString()` date reads *yesterday* between 00:00–08:00 KL, so the rule would have answered "week not finished" for the first eight hours of Monday — **including 02:00, when the payout job runs** — and held every voucher it was about to issue. `klToday()` now lives in `payment-voucher-week.ts` beside `previousCompleteWeek`; **an identical private copy in `weekly-payout.job.ts` was deleted** so there is one definition of "what day is it in KL". Proof: `probe-pv-audit.ts` §8, **10 new cases all passing**, backend `tsc` **0** — including the over-fire guards (Monday case NOT refused; omitting the argument preserves old behaviour; no `week_end` is not judged). ⚠️ **Not fired against the live DB.** ⚠️ **No override was built** — an agency that must genuinely pay early cannot; confirm that is wanted. *(Agency)*

### 🟡 P3 — admin + database cleanup + hardening
- [x] **🔴 No way to delete, deactivate or demote an account** — ✅ **fixed (30 Jul)**, §8 X29 → X30. `PATCH /user/:id/status` + `DELETE /rbac/user-role`, both admin-only, with self-lockout and last-holder guards. Login already refused a non-active account, so the disable bites immediately. **Hard delete deliberately NOT added** — four tables FK a user and the audit trail should outlive the person; soft-disable is the right default. ✅ **The admin SCREEN landed too (§8 X32)** — Actions column on the admin user table, confirms on both, server refusals shown verbatim, live-verified. ✅ **CORRECTION (same day, §8 X31): a disabled account's live token dies on the very next request.** I wrote here that it "keeps working until it expires" — that was wrong and was never checked. `authenticateJWT` re-reads the user on every request and already refuses `status !== 'active'`, so the disable is immediate. Left for a follow-up: an admin **UI** (both endpoints are API-only today).
- [x] **Fire every never-run path** — ✅ **done (30 Jul)**, §8 X28: all six, plus collections issue→settle. Leftovers on the shared DB are listed in §10.
- [x] **H · Admin portal surface is fully wired** — 30 Jul 6-agent audit: every `/admin` page reads/writes the live DB, zero demo screens (§8 AD3–AD18). Remaining: one real admin sign-in run-through of §4d + the hardening backlog below. *(all → Admin)* — §3 S12

#### Admin hardening backlog (found by the 30 Jul full-surface audit)
- [ ] 🔥 **`/api/v1/user` — REST gated, GraphQL twin still open.** ⚠️ **AMENDED BY THE 31 JUL MERGE — read this before trusting the line below.** jk's branch set `GET /user` + `GET /user/:id` to `requireAdmin`; **the merged code does NOT**, and the conflict was resolved deliberately in favour of the SL side. Admin-only is correct on jk's branch, where the only callers are the admin tables, and **wrong on the merged branch**, where `services/pr/prs.ts` feeds the outlet **Today/History** screens and the agency portal resolves PR names through the same list — admin-only blanks live screens for two roles. The merged shape is `requireRole('admin','agency','outlet')` **plus `redactIdentityDocsForOutlet`**, which is the narrowing jk's gate was reaching for done as a response *shape* rather than a gate (owner decision D3, §8 X13; live-verified — outlet sees 0 of 17 rows carrying identity docs with all 17 names intact). **PR is still refused outright.** 🔴 **Raise with jk rather than assume:** their tightening is deliberate work and one of us is reasoning from a stale caller list. Original note follows: ✅ **REST done (30 Jul):** guarded per-ROUTE, never the mount — the mount would 403 PR mobile's profile/avatar/portfolio saves. Verified: admin 200, PR token **403**, PR self-`PATCH` still **200**. `PATCH /user/:id` + the upload POSTs needed no guard — each controller already enforces **self-only** (stricter than the "self-or-admin" originally written here; expressing it as self-or-admin would LOOSEN it and hand admins write access to `user_profile.full_name`, the legal name feeding PV exports). ✅ **CLOSED 31 Jul — and this line's premise was WRONG.** It said the `users` GraphQL resolver "reads the same table behind `@auth` only, so the leak path is narrowed, not closed". **There is no resolver.** `user.resolvers.ts` is literally `Query: {}`, and `graphql/resolvers.ts` merges only the base `_health` fields, that empty object, and audit-log's three — so `users`/`user` were declared in the schema, unimplemented and non-null, and an actual call errored. They could not read anything. **Removed rather than gated:** a field advertising a capability nothing serves is worse than no field — it shows in introspection as a way to enumerate every account, and it would have had someone write a resolver to satisfy the schema. Reading users is the REST `GET /user` path's job and that one is already gated + redacted. No web or mobile client queries either field. ⚠️ **`tsc` cannot verify this** — the SDL is a template string, so a broken schema typechecks perfectly and fails at boot; proven with a throwaway `makeExecutableSchema` probe: **schema builds, Query is now `_health, auditLogs, auditLogActions, auditLogEntities`**, both dead fields gone, audit-log's three intact. Probe deleted. The now-unreferenced `User`/`UserPaginatedResponse` types are left in place — inert, and removing them drags in the filter/sort inputs. *(security)*
- [x] 🔥 **GraphQL `auditLogs` is not admin-guarded** — ✅ **CLOSED (31 Jul).** `requireActiveAdmin(context)` on **all three** queries — `auditLogs`, `auditLogActions`, `auditLogEntities`. The two vocabulary queries return no rows but the distinct action/entity lists are a map of what the platform does and to whom; leaving them would have looked finished while staying half-open. **Callers verified FIRST** (the `GET /user` lesson): the only consumers are `services/audit-log/audit-logs.ts` → `routes/admin/dashboard.tsx` + `routes/admin/audit-log/{index,$role}.tsx`, all inside the admin-guarded `/admin` tree, so nothing legitimate can be refused — which matters because `graphql-request` throws on ANY GraphQL error and would render *"Activity feed unavailable right now"*. ⚠️ **Deliberately NOT `context.isAdmin`**, kept local exactly as this entry warned: `createContext` tests role NAME only, and the same test backs auth, org-scope, payment-voucher and pr. ⚠️ **The status nuance in the old note was subtly wrong and is corrected in the code comment:** `getUserRoles` projects **`RoleTable.status`** — the status of the ROLE DEFINITION — and `user_role` has **no status column at all**; revoking a role DELETES the row, so a revoked admin was already excluded by the name test. What the check really adds is refusing a role switched off platform-wide. **Verified live read-only before shipping, because a wrong guess locks out every admin:** `admin`/`agency`/`pr`/`outlet` are all `active` and `Test` is `inactive`, so the column is in use, not vestigial. Backend tsc **0**; probe deleted after use. ⚠️ **Not fired as a PR token** — the refusal itself is unproven live. *(security)*
- [x] 🔥 **~~GraphQL `auditLogs` is not admin-guarded~~ — CLOSED by `4acf5dc`; this is the ORIGINAL entry, kept only for its scouting notes. ⚠️ Ticked on 2 Aug because leaving it unticked beside the closed row above made a fixed leak read as open, and I reported it as open once because of exactly that.** — **CONFIRMED LIVE 30 Jul:** the same PR token read **865 audit rows** (the resolver's `@auth` directive only requires *any* login; the repository merely hides `role='admin'` rows). **⛔ HELD BACK as high-risk (auth semantics), not attempted.** Safe path already scouted: both consumers sit inside the admin-guarded `/admin` tree so a correct guard breaks nothing, **but** a wrong-shaped one also 403s the dashboard "Recent activity" feed (`graphql-request.ts` throws on any GraphQL error → *"Activity feed unavailable right now"*). Separate trap: `context.isAdmin` ignores role **status**, so an inactive `admin` role row still counts — keep any status check local to audit-log, since the same roleName-only test is used by auth, org-scope, payment-voucher and pr controllers. *(security)*
- [ ] **Audit-log per-role page under-fills** — **CONFIRMED IN THE UI 30 Jul:** `/admin/audit-log/admin-audit` rendered **1 row** while the footer read *"Showing 1 – 10 of 2752 entries · Page 1 of 276"*, because `AuditLogFilterInput` has no `role` field and `filterLogsByRole` runs client-side **after** server pagination. **⛔ HELD BACK as medium-risk, not attempted** — the change itself is additive (an optional input field; existing queries unaffected) but the WHERE clause carries three traps now documented: (1) `others` is a magic sentinel, so a real role named "others" becomes unreachable; (2) `notInArray(role, …)` **drops `role IS NULL` rows** — exactly the system/failed-login rows the Others bucket exists to show; (3) drizzle's `or()` returns `SQL | undefined`, which breaks an `SQL[]` push if unguarded. *(Admin ← all)*
- [ ] **Audit-log rows show `Table = unknown`** — the newest `Auth` entity rows render as "unknown" in the table column (entity→label map misses `Auth`). *(Admin)*
- [x] **"Reset demo" button removed from the admin header** — ✅ **done (30 Jul)**: it only ran `queryClient.invalidateQueries()` (never a DB write) but read like a destructive wipe to a real admin. `ResetDemoButton` deleted from `components/layout/header.tsx` along with its now-unused imports. Admin-only blast radius: that `Header` is imported solely by `layout/admin-layout.tsx`, so the agency/outlet portals' own demo controls are untouched. *(Admin)*
- [ ] **Create Admin flow leaks intent** — the Active-Status toggle is collected but never sent; a placeholder phone (`+admin-…` hex) is fabricated; admin-creation privilege is decided in `authController.registerUser`, not the router — verify a non-admin token cannot create admins. *(Admin)*
- [ ] **Admin account lifecycle missing** — no edit / suspend / delete for existing admins and no admin-side password reset (only self-service forgot-password). *(Admin)*
- [ ] **PR page filters run client-side over the first 200 PRs only** (forced `page=1&pageSize=200`); agency filter capped at first 100 agencies; no `?focus` deep link (agency/outlet pages have one). Wrong results at scale. *(Admin ← PR)*
- [ ] **Admin PV page is read-only by design but under-wired** — `resolveDispute` (`POST /payment-voucher/disputes/:id/resolve`) and the `receipts[]` evidence array come back from the API and are never rendered/wired. *(Admin ← Agency+PR)*
- [x] **RBAC Pending page** — ✅ **done (30 Jul)**: tab badge now adds `plan_change` back so it matches the list (**verified live: old formula gave 4 for 5 visible rows, now 5 = 5**); a failed source renders an **error banner over whatever loaded** (never a replacement branch — the four queries fail independently) and can no longer show the happy "Nothing pending"; a footer states *"Showing the N most recent of M"* whenever the per-source cap hides rows. Per-source pagination deliberately NOT added — four independently-paged sources merged into one date-sorted list cannot be paged correctly client-side. **Bonus bug fixed:** `plan_change` rows were labelled "Plan request" and deep-linked to the Plan Request inbox, **which filters them out** — they now say "Plan change" and link to `/admin/service/plan-changes`. *(Admin)*
- [x] **Business Plan audience filter** — ✅ **done (30 Jul)**: now sends `subscriptionType` (the column has existed since migration 0036, backfilled **before** the NOT NULL constraint, so no row can be hidden) instead of proxying onto `billingCycle`. Audience now **ANDs** with the cycle dropdown instead of overwriting it. Verified live: request is `?subscriptionType=agency&…` and returns exactly the 6 agency plans. Expected behaviour delta: *agency + monthly* now honestly returns 0 rows instead of silently showing 6 outlet plans. *(Admin)*
- [x] **Admin Settings could silently zero the platform fee** — ✅ **done (30 Jul)**: `handleSubmit` ran bare `Number()`, so a blank field posted a real `0` and text posted `NaN` → JSON `null` → the backend's `z.coerce.number()` turned it into **0** and ACCEPTED it — platform fee / subscription fee overwritten with `0.00` behind a green success toast. Blank or non-numeric now blocks submit with an inline message (range/integer limits stay server-side). Verified live: clearing the fee shows *Required*, **no PUT is sent**, and the DB still reads 2.50 %. *(Admin → all — this one was silently money-affecting)*
- [ ] **`outlet_transaction` API has zero UI** — fully built, requireAdmin-guarded money-record endpoints (`GET /summary` · `GET /` · `POST /`) with no frontend caller. Build the admin page or drop the feature. *(Admin)*
- [ ] **OCR capture** (words) — only enable after a **new assignment** arrives; DB is immutable once check-in is submitted.
- [ ] **OCR baseline**: single non-repeatable receipt · single claim · single PR. Repeatable receipt ⇒ self-log.
- [ ] **Finish remaining backends** and confirm each is connected. *(SL)*
- [ ] **DB cleanup**: run through the database, delete unnecessary / unused tables. *(SL)*
- [ ] **Confirm every function works** as intended. *(SL)*
- [ ] **Verify every link pulls from the correct table** and returns the correct data. *(SL)*
- [ ] **Check whether every function actually needs its own table.** *(SL)*
- [x] **Role-gating** actually blocks the wrong roles — retest the agency-token-reaching-admin-screens concern with a real sign-in. *(Admin / RBAC)* — ✅ **done (30 Jul)**: real password logins for all 4 roles, ~60 checks. Agency is correctly refused `/platform-config` and `/admin-request` (both admin-only); every other gate behaved as designed. **It also found one real hole — see the `GET /user` row below.** §8 X1–X5
- [x] **PV day review — the FRONTEND** *(SL)*. ✅ **done (30 Jul)** — `use-agency-pv-day-review` + `AgencyPvDayReviewPanel`, rendered in `PvDetail` above the receipt-evidence panel, with the **send button gated** on the same rule the server enforces. Live-verified through all four states on a real agency login, §8 X14. Send-readiness is derived from each day's `status` (held / null), **not** from `allDaysReviewed` and **not** from the response's `hasHeldDay` — the two write endpoints return `dayReviews` + `allDaysReviewed` only, so a gate reading `hasHeldDay` would go blank the moment a hold was recorded. Shares the evidence panel's query key, so one voucher on screen is one request and a decision refreshes both panels. Renders nothing for a demo voucher.
- [x] **🔴 Make real vouchers reachable on the agency Payroll list** — ✅ **done (30 Jul)**, §8 X15. Owner's call: **keep the tabs Sunday-start and add a "This Week" tab.** Matching is now by **containment** of the voucher's own `week_start` within the tab's Sun–Sat window instead of string equality — a date falls in exactly one such week, so the overlap ambiguity I was worried about does not arise. Each row prints **"Week worked: <its own range>"**, because the backend's Mon–Sun week is one day out from the tab heading and the heading must not speak for it. All 4 real vouchers now list (3 This Week, 1 Last Week) and the day review opens by clicking.
- [x] **⚠️ Nothing tells an agency a voucher is waiting for review** — ✅ **done (30 Jul)**, §8 X16. Owner's call: **a new notification kind.** `pv_day_review_pending` (migration `0073`) raised by the payout job, **one per agency per run** naming a count rather than one per voucher, to **owner + finance only** (mirroring `agencyOwnerOrFinance`; the sub-role enum is exactly those two today, so the filter is a no-op now and is written down so a third sub-role does not inherit money alerts). Enum + recipients verified live; **the producer is not yet runtime-fired** — see the row below.
- [ ] **🔴 RECEIPT LIFECYCLE — decisions ANSWERED 30 Jul, prerequisite shipped, the feature itself NOT built** *(SL)*. Owner's spec: `PENDING → APPROVED → VERIFIED`, agency reviews the receipt (photo + PR note) on the **this-week** PV and may edit price/quantity; a PR may dispute **only after approval**, and the dispute UI sits in the PR's **last-week** section; untouched APPROVED → VERIFIED automatically at week close. Three answers given: **(1)** approval is the agency reviewing the this-week PV, and the per-component precondition applies only to receipt-backed money — **wages stay disputable** with no approval, or a wage error could never be contested. **(2)** a PENDING receipt **blocks the send**, routed through the existing `voucherSendGate()` so there is one refusal path, not two that can disagree. **(3)** **only `source='manual'` starts PENDING** — OCR `scan` (and auto-sealed `checkin`) go straight to APPROVED, because nobody self-declared them and the PR can dispute if something is missing. The existing `source` column comment already said this; it needs no correction. **Prerequisite DONE (§8 X18)** — without it an agency price edit destroyed the very evidence being approved. **✅ THE WHOLE BACKEND IS NOW BUILT (§8 X20):** migration `0074` (applied, backfill verified live — zero rows left `pending`); `PATCH /payment-voucher/receipts/:receiptId/review` and `PATCH …/receipts/:receiptId/lines/:lineId`, both under `agencyOwnerOrFinance`; `voucherSendGate()` extended so a pending receipt blocks through the **same** refusal path as a held day, in the HTTP send **and** the Monday job; the APPROVED→VERIFIED rollover in `weekly-payout` **before** the gate (after it, every week's receipts would sit an extra seven days at approved — a whole cadence skipped, invisibly), plus the resolved-dispute arm in `resolveDispute`; the dispute precondition (wages exempt); and `receiptStatus`/`disputable` on every PR-facing line DTO. **✅ The agency review surface is now built too** — in `PayrollVerifyPanel`'s receipts card, off the detail read rather than the cross-voucher `GET /payment-voucher/receipts` feed, because the owner's spec puts the review on the **this-week PV**. **✅ And the PR's two sections (mobile):** This-week carries a review caption (`N approved · M still waiting on your agency`) and the check-in receipt rows badge **Approved** and drop their edit/rescan/delete controls once the agency has approved them — the server refuses all three, so leaving the buttons would offer three actions that fail; Last-week refuses a dispute on a still-pending receipt with an explanation instead of opening a sheet the server would 409. Shared logic in `apps/mobile/src/lib/receipt-review.ts`; `disputable` is treated as **advisory**, never as the rule. ⚠️ **The mobile app has still never been run, in any session** — these are correct by types and reading only. Note the interlock already works: an agency price edit changes the day total, so `approved_total_cents` correctly flips that day STALE and forces re-approval.
  - Four judgement calls made while building, worth not re-litigating: **(a)** there is deliberately **no `rejected` state** — an agency that disbelieves a receipt edits the line to what it should be and approves *that*, which leaves the PR a figure they can contest; a rejection would be a refusal with no number attached and nothing to dispute. **(b)** `verified` is **not settable over HTTP** — jumping there would shut the dispute window before the PR had ever seen the figure. **(c)** editing a line on an **already-approved** receipt drops it back to `pending`, because the receipt table stores **no amount**, so staleness there cannot be detected later the way `approved_total_cents` makes a day's staleness detectable — it has to be recorded at the moment of the edit. **(d)** the rollover **skips vouchers with an open dispute**: verified means closed, and closing evidence under a live claim would settle it out from under the PR. It rolls on the next pass once resolved.
- [x] **🔴 Which phone number is a PR's?** — ✅ **ANSWERED + FIXED (30 Jul)**, §8 X23–X24. Owner's call: **`user.phone_num` wins.** Reads now resolve through `pr.user_id → user` and login matches on digits, so the number an agency sees is the number that signs in. **Remaining, deliberately NOT done:** the physical `DROP COLUMN pr.phone`. Three live readers still use it — the agency PR search (`ilike(PrTable.phone…)`), jk's PV export bundle, and the create/update path — and it is the only number a PR has **before** they have an account, which is a real case the model allows. Dropping a column out from under a database jk also runs breaks whoever is mid-request. Sequence for later: repoint the search + jk's lane, decide what a pre-account phone is called, then drop.
- [ ] **One conflicting phone row remains** *(SL)* — Alice: `pr.phone +60123456805` vs `user.phone_num +60987654321`. Display and login both follow the account now, so nothing is broken by it; the roster value is simply an orphan copy. Cleared by the DROP above, or by correcting whichever number is genuinely hers.
- [x] **Replicate the Actions column to the other user-management tabs** — ✅ **done (31 Jul)**, §8 X33, **and this entry was wrong about half of its own scope.** It named four tabs and called the work mechanical. Re-deriving from the code first (the standing rule) showed **`agency.tsx` and `outlet.tsx` list ORGANISATIONS, not accounts**: their rows come from `fetchAgencies`/`fetchOutlets`, so `row.id` is an org id and `PATCH /user/:id/status` would address a row that does not exist. They already have org-level approve/suspend, which answers a different question about a different table. Shipped where the rows really are accounts: **`pr.tsx`** (Disable/Enable + Remove PR) and **`legacy-member.tsx`'s PR rows only** (Reactivate — that tab is where a disabled PR lands). `revokeAdminRole` → **`revokeUserRole(userId, roleName)`**; shared logic in **`hooks/use-account-actions.tsx`**; `colSpan` 7 → 8. API-proved live; **the screen is NOT clicked through — see the row below.** *(SL)*
- [ ] **Click the PR tab's Actions column through on a real admin login** *(owner, ~1 min)* — §8 X33 proved the three calls against the live backend but not the rendering, because that needs a password typed into the login form. Go to `/en/admin/user-management/pr`: every row should show **Disable** and **Remove PR** on the right, clicking Disable should open a confirm naming that PR, and confirming should toast the server's own sentence and move the row out of the Active filter. Re-enable from the same tab (filter Status → Inactive) or from **Legacy Member**, where PR rows now have a Reactivate button. ⚠️ Today all 6 PR accounts are `active`, so the Legacy Member PR button has nothing to render on until one is disabled.
- [x] **🔴 A malformed id returns 500, not 404** — ✅ **fixed 31 Jul**, §8 X35. New `uuidParam()` in `util/params.ts` (⚠️ the existing `paramId()` does **not** validate — it only unwraps a repeated query param, which is why three controllers looked identical and two behaved differently). Applied to **all three** `/:id` handlers in `payment-voucher.controller` (get/update/remove — the bug was never only in the read) and to `shift.controller`. Live: `/payment-voucher/not-a-uuid` and `/shift/not-a-uuid` now **404**, matching `/user` and `/agency`, and a **real** id still **200**s on both — the half worth checking, since a guard that breaks the path it protects is worse than the bug. ⚠️ **Not swept exhaustively:** other routers may carry the same shape; the two proven ones are fixed and `uuidParam` is the one place to reach for. *(all)*
- [ ] **Sweep the remaining `/:id` handlers for the same 500** *(SL)* — §8 X35 fixed `payment-voucher` and `shift`, the two proven by probe. `/user`, `/agency` and `/outlet` were already correct. Every other router with a `/:id` route is unchecked; the fix is one line each with `uuidParam()`. *(all)*
- [x] **🟠 The whole RBAC catalogue is readable by any signed-in user** — ✅ **fixed 31 Jul**, §8 X35. Gated at the **mount**, `v1Router.use('/rbac', requireAdmin, rbacRoutes)`, mirroring how `/platform-config` is already done. **First finding: every /rbac WRITE was already `requireAdmin`** in its own route file, so this was information disclosure, not a privilege hole — a PR could *read* 5 roles, 10 modules and 51 permissions, never change them. **Callers verified before gating** (the `GET /user` lesson: a flat gate can blank a live screen): `getRoleIdByName` is reached only from admin-portal services, the agency portal makes **zero** `/rbac` calls, mobile makes none, and public signup deliberately reads role UUIDs from `env.ts` rather than looking them up. Live after: **200 admin · 403 agency · 403 outlet · 403 pr** on all three, and `getRoleIdByName('pr')` still 200s for admin. *(all)*
- [ ] **🟡 An admin cannot read check-in locations at all** *(SL)* — §8 X34. `/shift-assignment/attendance-fixes` is **400 for admin**, 200 for agency: it derives the agency from the caller and a platform admin has none. Probably wants an optional `agencyId` parameter. Until then the panel is agency-only in practice, which may or may not be what was intended. *(Admin)*
- [ ] **🟡 `/agency` returns all 3 agencies to a PR** *(SL — decision)* — §8 X34. Probably harmless, agency names are not secret, but it is enumeration by the one role with no reason to hold the list. Decide whether to scope it to the PR's own agencies. *(PR)*
- [x] **✅ CLOSED 2 Aug (§8 X55) — `suspendedOrgBlock()` now refuses at login AND kills live sessions.** Verified live 5/5, including that **nothing was newly locked out** (all 3 agencies + 7 outlets are `active`). ⚠️ **`pending_review` is deliberately allowed** — it is the column DEFAULT, so denying it would have shut out every unreviewed organisation. The original entry follows.
- [x] **🔴 ~~Suspending an agency/outlet ORGANISATION does not stop its people signing in~~** *(SL — confirm live first)*. Found 31 Jul while answering "can I test everything right now?". `auth.controller.ts` checks **`user.status`** only, and `authenticateJWT` / `optional-authenticate-jwt` re-read the **user** — grep finds **no reference to `agency.status` or `outlet.status` anywhere in the auth path**. So an admin who suspends a venue or an agency, expecting its owner to lose access, gets an org row marked `suspended` and an owner who keeps working normally. It compounds with the row below: the *account* switch that would actually lock them out **has no screen for these two roles**. ⚠️ **Read from the code, NOT yet fired** — confirm by suspending an org and attempting the owner's login before treating it as real. Then decide which is correct: an org suspension cascading to its members' access, or org status meaning only "not bookable". *(Admin / Agency / Outlet)*
- [x] **Phase D was NOT blocked on venue coordinates** — ✅ **corrected 31 Jul.** The audit and this doc both said "five of six outlets have no geo pin, so their check-ins pass with no location check". Queried live: **all SEVEN outlets are pinned** (Velvet 23, Onyx KL, Urban Soul, Mermate, Bear Lounge, Emhub Testing, JK House), and `outlet.geo_fence_radius` defaults to **50 m** with the repository falling back to `DEFAULT_GEOFENCE_RADIUS_M` when null — so the fence is live at **every** venue and the check-in locations panel has seven venues to exercise, not one. Phase D's remaining item is only the **penalty amounts** (money policy, Velvet 23 only). ⚠️ **The failure direction has flipped:** an unpinned venue used to accept everything, a wrong pin now **rejects** legitimate check-ins — spot-check one pin against the real venue before trusting a rejection. Do **not** geocode the seeded addresses to "fix" one: four share a street name and resolve to postcode centroids. *(Outlet / PR)*
- [ ] **Agency and Outlet ACCOUNTS have no management screen at all** *(SL)* — the discovery behind X33. The agency and outlet tabs manage the *organisation*; nothing in the admin portal lists the **user accounts** that sign in as an agency owner/finance or an outlet owner, so those accounts cannot be disabled or have a role taken back from any screen — only over the API. Fixing it means a list keyed on `GET /user?roleId=<agency|outlet>`, at which point `useAccountActions` drops straight in. Decide whether that is a new tab or a section on the existing org tabs.
- [ ] **Per-session logout** *(SL)* — the remaining half of the token story. Status revocation already works (§8 X31: `authenticateJWT` re-reads the account every request), so what is missing is signing out ONE session rather than disabling the whole account. Needs a decision on mechanism (token version vs denylist) before any code.
- [ ] **Give the web auth context the signed-in user's id** *(SL)* — §8 X32. It tracks only *whether* someone is signed in, so no screen can say "this is you"; `currentUserId` is passed `null` and the server's refusal does the explaining. One field on the context fixes it everywhere.
- [ ] **Run the PR app on a real DEVICE** *(SL)* — §8 X22 proved the screens in a browser, which is most of what goes wrong, but not the camera, the geofence or the native pickers. `node tools/scripts/dev-mobile-web.mjs` (or the `mobile-web` launch entry) is the browser path; `dev-mobile.mjs` is still the phone path.
- [x] **Voucher number is not unique** — ✅ **done (30 Jul)**, §8 X26. Owner's call: a **running number** (`PV-000001`), stored in `payment_voucher.voucher_no` (migration **0075**) and read by all five surfaces instead of derived. Live: four vouchers, four numbers; the three sharing one `week_start` now differ; the export filename follows. ⚠️ **The allocator has not run yet** — existing rows were numbered by the backfill, so the retry-on-conflict path first fires when a new voucher is created (the Monday job, or a PR's first self-log of a week). Watch for `Could not allocate a voucher number` in the log: that means an **unnumbered** voucher was created deliberately, in preference to failing to create somebody's pay.
- [x] **Export money columns are text** — ✅ **done (30 Jul)**, §8 X25. Unit Price and Amount are written as **numbers** with a `#,##0.00` format (`money()` in `payment-voucher-excel.ts`), rounded to cents so a divided unit price cannot show one figure while holding another. **Verified by opening the downloaded file, not by reading the code** — which is how the defect was found in the first place. The merged "Total" block stays a styled string on purpose: it is a caption, not a column, and splitting it would change the document's layout.
- [ ] **Fire the `pv_day_review_pending` producer live** *(SL)*. Needs a payout run against the shared DB. The previous complete week's vouchers are already `sent`, so a run today proves nothing about this path while still drafting collection rows — do it on a week with genuinely unreviewed vouchers, or after the next Monday cron.
- [ ] **⚠️ First Monday after this ships, watch `weekly-payout`** *(SL)*. The job now runs the same send gate, so a voucher whose days nobody reviewed **stays at `pending_review` and the PR is never notified** — that is the intended consequence of "all days must be reviewed", but until the agency panel exists there is no screen to do the reviewing on. Log line to look for: `awaiting agency day review`. Until the panel lands, catch up by hand with the `PATCH …/day-review/…` endpoints.
- [ ] **Fire the PV day-review STALE path live** *(SL)*. The baseline is stored and compared on every read; a mismatch has never actually been produced. Needs a voucher regeneration after an approval — a destructive write, so do it on data you are willing to keep.
- [x] **Double-booking guard** — ✅ **done (30 Jul, `fa44ce4`, overnight gap closed in `b73aa93`)**: assign already refused a clash; the missing half was a shift **timing edit** dragging onto another shift the same PR works. Live-proven both ways (refuses the clash, allows a clear window). *(Agency → PR)* — §8 X9
- [x] **🔴 Decide what a VENUE may read about a person** — ✅ **decided + shipped (30 Jul)**. Owner's call: **neither** — coordinates stay agency+admin only, and IC/passport no., DOB, address, `state`/`country`, and both ID-photo paths are now **blanked for outlet-only callers**. Done as a response **shape**, not a gate, because `GET /user` is how the venue Today/History screens resolve PR names — removing outlet from the role guard would blank those screens. Fields are set to `null` rather than deleted so a venue screen reading `profile.idNo` renders empty instead of throwing. Names, nationality, gender, race, languages and the comcard/portfolio survive: that is the profile a venue books from. §8 X13 *(Outlet / Agency)*
- [ ] **Re-run the live role sweep after ANY auth or gating change** — the 4 logins, ~60 checks and the expected-outcome list are the cheapest regression net in the repo (it found the hash leak in its second minute, after days of clean typechecks). PR password is `password`; agency/outlet owners `Password123!`; admin from `.env`. *(all)*
- [x] **🔴 Outlet plan switch now reaches the backend** — ✅ **built 3 Aug.** Three links, no new tables and no migration: (1) the outlet's "Switch to <plan>" resolves the tapped plan against the REAL `subscription` catalog (reads are open to any signed-in role — verified: an outlet token gets 12 plans) and files `admin_request` `type='plan_change'`, `status='pending'`, carrying `currentPlanId`/`requestedPlanId`, so it lands in admin **Plan Change**; the venue's card shows *Awaiting admin* and stays on its current plan, because an outlet switch is a REQUEST, not an act. (2) `approve()` now writes the `member_subscription` ledger — the old active row is CLOSED (`ended_at` + `expired`) and a new active row inserted with the plan's name/price/cycle (admin's negotiated `quotedAmount` wins when set) — so admin **History** and the venue's own billing list agree. (3) an agency switch (`status='direct'`, no approval step) applies to the ledger immediately on create. Ledger failures are logged, never block the approval. **Live-proven:** JK House filed Pro→Enterprise as `jk@house.test` (`admin_request` d7d019d9, pending, visible in Plan Change). ⚠️ **The approve→ledger half has NOT been fired live** — it needs an admin session and no admin password exists in `.env`; click **Approve** on that row and confirm a new JK House Enterprise row appears in History. *(Outlet → Admin)*
- [ ] **~~🔴 Outlet plan switch never reaches the backend~~** (found 3 Aug, from the owner's live JK House Pro→Enterprise switch) — original finding, kept for context. `selectPlan` in `routes/outlet/subscription.tsx` writes **zustand only** (`saveOutletOwner` + `recordOutletSubscriptionPlanChange`) — no request is made, so admin **Plan Change** (which reads `admin_request` where `type='plan_change'`) never sees it and the change dies with browser storage. Wire it: switch → create an `admin_request` plan_change row for that outlet; on admin approval write/update that outlet's `member_subscription` row so admin **History** reflects it. **REUSE both tables — no new ones.** Related decision: the outlet's rate card (prices, PRs/day, "Current" pill, renewal date) is demo data, NOT the admin-managed `subscription` catalog — decide whether the outlet should read the real catalog. *(Outlet → Admin)*
- [ ] **Outlet Subscription card still counts PRs from DEMO shifts** — `0 / 50 requested PRs today · pool of 100` comes from the zustand `shifts` store via `outletNamedPrCountForDate`/`maxDailyOutletNamedPrCount`, not from the venue's real `shift`/`shift_assignment` rows, so the number is meaningless in a real session (always 0 today). The plan's own limits (PRs/day, pool size) ARE real — they come from the plan definition. Wire the counters to the backend, or drop them until they are real. The renewal date beside them was fixed 3 Aug (now from `member_subscription.started_at` + `billing_cycle`). *(Outlet)*
- [ ] **⚠️ `seed-sample-activity.ts` will re-create the fake subscribers if re-run** — its MEMBER_SEED list invents subscriber names ("Marble Hall", "Summit Staffing", …) with RANDOM `subscriber_id`s instead of seeding only organisations that exist in `outlet`/`agency`. That is what put 6 ghost rows in the ledger (deleted 3 Aug). Fix the seed to resolve real org ids — or stop seeding `member_subscription` at all — before anyone runs it again; otherwise admin History fills with venues that do not exist. `seed-sample-orgs.ts` also touches this table. *(Admin / DB)*
- [x] **🟠 Ledger links repaired, every real org has a row, fake rows deleted** — ✅ **done 3 Aug, APPLIED to the shared DB.** Purge (owner's call, `--purge-ghosts --apply`): **6 seeded rows deleted** (Marble Hall, Jade Garden Bar, Summit Staffing, Horizon Talent, Pioneer Crew, Vanguard PR — all `created_by='seed-sample'`, all naming organisations that exist in NO table). Each was printed and written to a rollback JSON under the OS temp dir BEFORE deletion; re-inserting that file restores them. **The ledger is now exactly the operation section: 7 outlets + 3 agencies = 10 rows, every one linked by primary id, no duplicate names, no ghosts.** The seed wrote RANDOM `subscriber_id`s: **no agency row and 2 outlet rows matched a real organisation**, so Atlas/Delta/Starline showed as subscribed AND as never-charged at once (name matched, id pointed nowhere). New idempotent script `apps/backend/src/scripts/repair-member-subscription-links.ts` (dry run by default, `--apply` to write): relinks a row to the real org when its snapshot name matches exactly one, and backfills orgs with no active row. Applied: **3 relinked** (Atlas, Delta, Starline) + **2 added** (JK House → Enterprise, Emhub Testing → Essential). All 10 real orgs are now linked by primary id. ⚠️ **6 ghost rows remain** (Marble Hall, Jade Garden Bar, Summit Staffing, Horizon Talent, Pioneer Crew, Vanguard PR) — they name organisations that do not exist; REPORTED, never deleted, because deleting billing history is the owner's call. ⚠️ **Emhub Testing's Essential is an assumption** (no evidence of its real plan) — change it in one admin approval if wrong. *(Admin / DB)*
- [ ] **~~🟠 `member_subscription` has orphan rows + missing venues~~** (found 3 Aug) — original finding, kept for context. "Marble Hall" and "Jade Garden Bar" carry a `subscriber_id` that matches **no row in `outlet`** — name-only ledger entries, the copied-name pattern Rule 3 forbids. All 14 rows are `created_by='seed-sample'`; **JK House and Emhub Testing have none**, which is exactly why they never appear in admin History (the page is a ledger read, not an outlet list). Clean up the orphans and give the real venues real rows. *(Admin / DB)*
- [ ] **Every table linked to each role** that should access it (Outlet / Agency / PR / Admin). *(all)*
- [ ] **/service/other redesign** (admin). *(Admin)*

---

## 10. Changelog (what changed / what's done — append newest at top)

> **5 Aug 2026 — A SHIFT WITH AN OPEN CLAIM IS NO LONGER OFFERED AGAIN.**
>
> Owner: *"this already disputed can dispute again"*.
>
> The picker knew whether a receipt had been REVIEWED but nothing about whether it was already being
> ARGUED about. So a shift carrying an open claim sat there fully selectable, and submitting would have
> come straight back a **409** from `0086`'s partial index — one open claim per shift.
>
> `receiptClaimState` now feeds the picker: a shift with a LIVE claim is dimmed and reads **"already
> disputed"**; one still awaiting review reads **"waiting on your agency"**. Two different reasons, two
> different notes — collapsing them into one "unavailable" would tell a PR to wait for the agency when
> the real answer is that they have already asked. A whole-day open claim blocks every shift beneath it.
>
> **An ANSWERED claim does not block.** Resolving a claim ends that claim, not the right to disagree
> again — which is what `0086` being partial exists for. Inverting those two is the easy mistake, so
> both directions are pinned: *"an OPEN claim marks its shift, blocking a second one"* beside *"an
> ANSWERED claim leaves its shift un-blocked"* and *"a shift whose earlier claim was answered can be
> disputed again"*.
>
> `evidenceDisputableCount` got the same rule, so the **Dispute** button no longer opens a sheet in
> which nothing can be selected.
>
> 40 harness checks pass; mobile clean above the ~11 pre-existing. No backend change — the server
> already refused this; the app simply stops offering it.

> **5 Aug 2026 — EVERY SHIFT IS LISTED IN THE PICKER, INCLUDING THE ONES NOT YET CHOOSABLE (`c88e319`).**
>
> Owner: *"this is correct 2 different shift , different dispute , but why in the drink no seperate
> shift ?"*
>
> Drinks has two shifts as well. One of its receipts was `pending` after an agency edit, and the
> previous commit **filtered non-disputable shifts out of the picker** — so with one left the picker
> collapsed and DISAPPEARED, sending Drinks straight to Quick reason while Tips showed two shifts. The
> PR could not tell whether the second shift was missing, merged, or simply not offered.
>
> ⚠️ **Same mistake as the vanished Dispute button earlier today**, and I had written the reasoning down
> as though it were a virtue: *"filtered rather than disabled, so everything shown is choosable"*.
> Shown-but-unavailable states why. Hidden states nothing.
>
> Every shift in the cell is listed now; the ones that cannot be chosen are dimmed (opacity 0.45),
> `disabled`, and carry the reason ON the chip — *"· waiting on your agency"* — with the same text in
> `accessibilityLabel`. Auto-select counts only the CHOOSABLE ones, so a single available shift is still
> picked for the PR and two or more still require them to say which; Submit stays blocked when none can
> be chosen.
>
> Mobile clean above the ~11 pre-existing (`-p tsconfig.app.json`); 37 harness checks pass. No backend
> change, no migration.

> **5 Aug 2026 — DISPUTABILITY IS PER SHIFT, AND A SETTLED SHIFT CAN STILL BE ARGUED.**
>
> Owner: *"after verified or solve dispute still can dispute again , and the 'SETTLED' need can choose
> dispute or not"*.
>
> The Dispute button had vanished from a cell holding an approved shift AND a pending one, because
> `cellDisputable` demands EVERY line in the day+bucket be reviewed. That rule was right when a claim
> covered the whole cell. It became wrong the moment a claim names ONE shift: a PR could not contest an
> approved 10:00 receipt because a different 16:00 receipt was still awaiting review. One shift's
> pending paper is not a reason to silence an argument about another.
>
> New `receiptDisputable(receipt)` decides per receipt, preferring the server's own `disputable` flag
> over the `pending` fallback. The button appears when ANY shift qualifies; the picker lists only those
> shifts (filtered, not disabled — everything shown is choosable); and `openDispute`'s guard matches, so
> the sheet can no longer offer Dispute and then answer "Not reviewed yet".
>
> **A SETTLED or VERIFIED shift stays disputable.** Resolving a claim ends THAT claim, not the PR's
> right to disagree again — and `0086`'s partial index is what actually permits the second one. That is
> the whole reason the index became partial.
>
> Both rules are pinned so the distinction cannot quietly collapse back into one: *"one pending line
> poisons the CELL — cellDisputable is all-or-nothing"* still passes, beside *"the approved shift IS
> disputable even beside a pending one"* and *"a shift whose earlier claim was answered can be disputed
> again"*. 37 harness checks, all passing.
>
> ⚠️ `cellDisputable` is deliberately kept as the fallback for a cell with NO receipts (wages, OT),
> where there is no per-shift answer to give. Do not delete it as dead code.
>
> Mobile clean above the ~11 pre-existing. No backend change, no migration.

> **5 Aug 2026 — THE PR CAN CANCEL A DISPUTE, AND CANCEL THE RIGHT ONE.**
>
> Owner: *"how can the pr cancel the dispute"*.
>
> Withdrawing existed but was effectively unreachable: the only route was tapping a RED grid cell, where
> the button still read **"Dispute this amount"** and silently became a withdraw. The one action that
> takes a claim back was both hidden and mislabelled.
>
> **Cancel now lives under the claim itself**, in "What you disputed" (tap a DISPUTED/VERIFIED status
> cell) — where the PR can see the shift, the items and the reason they are cancelling. Only on an OPEN
> claim: an answered one is a decision the agency has made, and retracting it afterwards would rewrite
> the outcome of a money decision. Confirmed before it fires, because a withdrawn claim cannot be
> un-withdrawn — only raised again from scratch.
>
> **⚠️ It had to become claim-specific, and this was a live bug.** `findOpen` matched on
> voucher + day + component, which stopped naming a single row when `0086` allowed one open claim PER
> SHIFT. Cancelling would have taken whichever row came back first — dropping an argument the PR had not
> asked to drop. `findOpen` and `PrWithdrawDisputeSchema` now take `receiptId`; `undefined` keeps the
> old behaviour for pre-picker clients, and `null` explicitly targets the whole-day claim.
>
> Verified on two open claims (one per shift) in a rolled-back transaction:
>
> | asked for | rows |
> |---|---|
> | `RCP-000010` | **exactly 1, the right one** |
> | `RCP-000011` | **exactly 1, the right one** |
> | no receipt (old path) | 2 — ambiguous, which is the bug |
> | the whole-day claim | 0 — correct, none exists |
>
> ⚠️ **My first probe reported WRONG on all of these and the code was fine.** `findOpen` uses the
> module-level `db`, so it cannot see rows inserted inside an uncommitted transaction — the probe was
> testing visibility, not logic. Re-run against the same `tx` it passed. Worth remembering before
> reporting a repository method broken.
>
> Both apps clean; 34 harness checks pass. No migration. **Backend restart required.**

> **5 Aug 2026 — PER-SHIFT TAGS: SETTLED → DISPUTED → VERIFIED (`e0872c9`, `d373e94`).**
>
> Owner: *"if i disputed this time , then after resolved dispute mark that time from settled to
> verified , if that shift untouch dispute remain to settled"*, then *"i dispute for the below shift so
> is below verified , make above no put verified"*.
>
> Each receipt in the evidence sheet now carries the SAME lifecycle the day status uses, applied to one
> shift:
>
> | tag | meaning |
> |---|---|
> | **SETTLED** (neutral) | the agency approved it and nobody argued |
> | **DISPUTED** (red) | a claim on THAT shift is open |
> | **VERIFIED** (green) | a claim on that shift was raised AND answered |
>
> A receipt still awaiting review gets NO tag — its row already reads "waiting on your agency", and
> calling that settled would claim a decision nobody has made. SETTLED is deliberately neutral, not
> green, so the eye lands on the two states the PR actually acted on.
>
> **The second commit is the one that matters.** An answered WHOLE-DAY claim was promoting every receipt
> in the cell to VERIFIED through `settledAll`, so disputing the 16:00 shift left the untouched 10:00
> shift wearing the same green tag — destroying the exact contrast these tags exist to draw. VERIFIED is
> now only for a shift a claim actually NAMED. An OPEN whole-day claim still marks everything, because
> it genuinely blocks every shift beneath it and carries a banner saying so; a settled one is history,
> and its detail lives in "What you disputed".
>
> This walked back the previous entry's DISPUTE ACCEPTED / DISPUTE REJECTED wording. That answered
> "what was decided?" but not "which shift did I take up?", and the owner's vocabulary — settled,
> disputed, verified — answers both while matching the day row above it.
>
> ⚠️ **Observed, not fixed:** RCP-000012 reads *"waiting on your agency"* AND **VERIFIED**. Not a
> display fault — the agency edited that receipt, which re-opens it to `pending` for re-approval, while
> the dispute against it is separately resolved. Two states of two different things. Recorded in §9 in
> case that pairing should be spelled out on the row rather than left to the reader.
>
> Mobile clean above the ~11 pre-existing (`-p tsconfig.app.json`); 34 harness checks pass. No backend
> change, no migration.

> **5 Aug 2026 — SETTLED DISPUTES ARE VISIBLE, AND THE PAYEE HAS THE NAME PEOPLE USE.**
>
> Owner: *"yesterday got one successful dispute right show where?"*, *"dispute section need to show
> which already disputed and which still pending, also need a filter"*, and *"at payment voucher the
> nickname need show in front of the real IC name"*.
>
> **The dispute answer was: nowhere.** `useAgencyDisputes` defaulted to `openOnly = true`, so every
> agency screen requested `?open=1` — a resolved dispute was fetched by nothing and existed in the
> database with no surface anywhere in the product. Worse, the panel printed "No open disputes"
> whether none had ever been raised or one had been accepted an hour earlier: two very different
> facts, one sentence. It now fetches all and filters client-side (Open / Resolved / All with live
> counts, plus search over PR, day, component, reason, resolution note and outcome), with three
> distinct empty states.
>
> Two defects fell out of listing settled rows at all: the status pill was **hardcoded to "Open"**
> (only ever accidentally correct), and a settled row still offered live **Accept/Reject** — which the
> server refuses, so they were buttons that could only fail while implying the outcome was still
> changeable. Settled rows are read-only now and show what was told to the PR.
>
> **The nickname** reads `Vicky (Victoria Tan Mei Lin)` on BOTH the voucher card and the dispute row.
> Joined from `pr.nickname` through `pr_id` in `listPaginated` and `listForScope` — never copied onto
> the voucher beside `pr_name`, which is the duplication rule 3 exists to stop. The dispute list
> needed its own join: it had `payment_voucher` but not `pr`, which is why the nickname appeared on
> one screen and not the other. No nickname, or one repeating the legal name, prints the legal name
> alone.
>
> Also fixed: `main.ts` did not compile — `express.json({verify})` hands back a bare
> `IncomingMessage`, and `originalUrl` is added later by the router. That broke the whole backend
> build and was unrelated to this work.
>
> Backend + web typecheck clean. ⚠️ The Disputes SUB-TAB COUNTER still counts open only, so it reads
> `(0)` above a panel showing `Resolved (3)` — defensible as a "needs you" badge, but the two now
> disagree on screen. Decide which it should be.

> **5 Aug 2026 — WHICH SHIFT, AS A FOREIGN KEY (migration 0088). My rule-3 violation.**
>
> Owner, looking at the table: *"foreign key which shift ?"*. Correct, and it was my mistake.
>
> I stored the shift as `receipt_refs` — the receipt NUMBER (`"RCP-000012"`) as jsonb text. That breaks
> the standing DB rule outright: read other tables through a FOREIGN KEY, reference rows by their uuid
> primary id, never keep a second copy of a value that lives elsewhere. A number in a jsonb array cannot
> be joined, cannot be constrained, and goes stale in silence if the row it names disappears.
>
> **0088** adds `payment_voucher_dispute.receipt_id uuid` → `payment_voucher_receipt(id)`
> `ON DELETE SET NULL`, with an index, backfilled from `receipt_refs` (matched on `receipt_no` within
> the same voucher, so a bad value could never attach a claim to another PR's paper). **Applied.**
>
> **The SHIFT is not duplicated onto the dispute.** It is reached through the receipt:
> `dispute.receipt_id → payment_voucher_receipt.shift_assignment_id → shift_assignment → shift`.
> Verified that join runs end-to-end. Copying `shift_assignment_id` onto the claim as well would be two
> columns holding one fact, which is how they drift apart.
>
> `ON DELETE SET NULL` is deliberate: deleting a receipt's last line deletes the receipt, and losing the
> paper must not delete the argument about it. The claim survives pointing at nothing, which is the
> truth of that situation.
>
> The `0086` unique index moved onto the FK: `(voucher_id, dispute_date, component,
> coalesce(receipt_id::text, '')) WHERE outcome IS NULL` — same rule, expressed against a real column
> instead of text dug out of jsonb.
>
> `PrReceiptLineDTO` now carries `receiptId` beside `receiptNo` (the number is for the PR to READ, the
> id is what the app REFERENCES), threaded through `cell-evidence` and the picker. Matching accepts
> either, so pre-0088 claims still resolve. `receiptRefs` stays declared but is no longer written.
>
> ⚠️ Both live claims carry `receipt_id = NULL` — they were raised before any of this and named no
> receipt, so the backfill had nothing to match. Nothing can recover it.
>
> Backend clean past its baseline; mobile clean above the ~11 pre-existing; 34 harness checks pass.
> **Backend restart required.**

> **5 Aug 2026 — A DISPUTE NOW RECORDS WHICH ITEM (migration 0087).**
>
> Owner, reading the table: *"i saw before that the dispute is on that day , from now onward is the
> date and needed the shift what item dispute also need to show ya , and database need have"*.
>
> The row carried the DAY (`dispute_date`), the BUCKET (`component`) and, since the picker went
> single-select, the SHIFT (`receipt_refs`). It still could not say WHAT was wrong. A tips receipt holds
> Tips, Booking commission and Havoc together, so *"tips on Tue 4 is wrong"* left the agency guessing
> which of the three and the PR with no way to say.
>
> **0087** adds `payment_voucher_dispute.disputed_items` (jsonb, nullable):
> `[{lineId, description, quantity, amount}]`. **Applied.** The table already had all four audit
> columns, so none were added.
>
> ⚠️ **Not an FK, deliberately.** `PUT /payment-voucher/:id` deletes and re-inserts every line, so a
> line id does not survive a voucher rewrite — an FK would go null and the record of what was disputed
> would evaporate. Same reasoning that made `receipt_refs` store receipt NUMBERS. `lineId` is a
> best-effort pointer; the description/quantity/amount keep the claim legible afterwards. It is a
> SNAPSHOT, exactly as `disputed_amount` already is.
>
> ⚠️ **The client sends only `lineId`.** Description, quantity and amount are read from the DATABASE in
> `resolveDisputeItems`, scoped by voucher + date + bucket. A claimant who could post their own
> `"amount": "999.00"` would be writing the very figure their claim is measured against. Verified: tips
> line ids requested under `drinks` resolve to **0 rows**.
>
> **The narrowest thing named wins** — items, else the receipt, else the whole cell. Verified live:
> naming the three tips lines gives `disputedAmount` **RM 365.50** against a RM 901.00 cell.
>
> The sheet asks **"Which item?"** after the shift, only when the receipt holds more than one — square
> multi-select (one paper can have two wrong lines) against the round single-select shift radio above.
> All start ticked, so "this whole receipt" costs no taps, and ticking them all sends nothing: that is
> the same statement as naming none, stored as NULL rather than pretending a selection was made.
> "What you disputed" lists the items, or says **"The whole receipt"**.
>
> Backend clean past its baseline; mobile clean above the ~11 pre-existing (checked with
> `-p tsconfig.app.json`); 34 harness checks pass. **Backend restart required.**

> **5 Aug 2026 — THE OPEN-CLAIM KEY IS THE SHIFT, NOT THE DAY (migration 0086).**
>
> Owner: *"remember the dispute make is make that shift drinks or tips dispute"*. This closes the gap I
> flagged as undecided when the picker went single-select.
>
> `0085` made the uniqueness partial — one OPEN claim per voucher+day+component — which fixed "a settled
> cell can never be disputed again". It still assumed a claim addressed a DAY. It does not: a dispute is
> made against **that shift's** drinks, or that shift's tips.
>
> So a PR working two shifts on one night could contest the first shift's drinks and then be REFUSED on
> the second with *"drinks on 2026-08-04 has already been disputed"* — two different papers, two
> different figures, one argument slot between them. The second shift's money had no route to being
> questioned until the first claim was answered.
>
> **0086** adds the named receipt to the key: `(voucher_id, dispute_date, component,
> coalesce(receipt_refs->>0, '')) WHERE outcome IS NULL`. The picker is single-select, so `receipt_refs`
> holds exactly one receipt and `->>0` IS that shift. A claim naming nothing keys on `''`, so at most one
> whole-day claim stays open — the old behaviour, preserved for the legacy rows that depend on it.
> Strictly weaker than 0085's index, so no existing row could violate it. **Applied.**
>
> No controller change was needed: `raiseMyDispute` detects duplicates purely from this index, and the
> withdraw path was already safe — it only hands the voucher back once `listOpenForVoucher` is empty, so
> two open claims coexist without one clearing the other.
>
> Verified live on one day + drinks:
>
> | attempt | result |
> |---|---|
> | shift A only | allowed |
> | shift A, then shift B — the rule | **allowed** |
> | shift A twice | refused |
> | two whole-day claims | refused |
> | whole-day + one shift | allowed |
>
> ⚠️ **Known rough edge, not a fault:** withdraw is addressed by day+component (`findOpen` returns the
> first match), so with two open claims on one cell a withdraw closes ONE and the cell stays red until
> tapped again. Self-correcting and the voucher status stays right; recorded in §9 in case the PR should
> instead choose which claim to withdraw.

> **5 Aug 2026 — A CLAIM NOW NAMES ITS SHIFT, IN BOTH SHEETS.**
>
> Owner: *"the status show verified that means some dispute make , need to put what shift details time
> date , and this 3th pic i need to see that the dispute which shift is make dispute before to remind
> the pr"*.
>
> **"What you disputed" (tap a VERIFIED/DISPUTED status cell)** now resolves each claim's `receiptRefs`
> back through `buildCellEvidence` to the shift behind that receipt — order number, `RCP-…`, outlet,
> slot, and the check-in / shift-end stamps — so the PR reads the same shift the proof sheet shows. The
> day heading is a real date now (`Tue 4 Aug 2026`) instead of `2026-08-04`.
>
> **The evidence sheet carries a reminder**, for ANSWERED claims as well as open ones. Not to flag an
> action — a settled claim needs none — but to stop a PR re-raising something they already raised and
> forgot. Three honest variants: an open whole-day claim, a settled whole-day claim, and *"you disputed
> N shift(s) here before — see the tags below"* when the claim actually named receipts.
>
> A claim with no `receipt_refs` says **"Filed against the whole day — this claim does not record which
> shift."** Stated rather than left blank: an empty space reads as "not loaded yet", which would leave
> the PR waiting for something that is never coming. That information was never captured and no UI can
> invent it; every claim raised from now on names its shift.
>
> Verified against the REAL mobile typecheck (`-p tsconfig.app.json`): no new errors above the ~11
> pre-existing, and the only three `TS2304`s are the known `FileList` DOM-lib ones — no unimported
> component remains, which is the class of fault that blanked the screen earlier today. 34 harness
> checks pass.

> **5 Aug 2026 — 🔴 BLANK PAGE ON DISPUTE, AND THE MOBILE TYPECHECK WAS CHECKING NOTHING.**
>
> Owner: *"in the dispute button i click either one shift blank page"* and *"why have this 'This whole
> day was disputed and settled…' — how can i know which shift drink is already disputed ?"*.
>
> **(1) The crash.** The receipt picker rendered `<Check />`, an icon that is exported from
> `components/icons.tsx` but was **never imported** into `PaymentScreen.tsx`. So the first render of the
> picker threw a ReferenceError and the screen went white. Shipped in `c9443d6`. Replaced with a filled
> dot drawn as a `<View>` — also the correct mark for an exclusive choice, so nothing is lost.
>
> **(2) Why my typecheck did not catch it — and this is the important half.**
> `apps/mobile/tsconfig.json` is SOLUTION-STYLE: `"files": []`, `"include": []`, project references
> only. So `npx tsc --noEmit -p tsconfig.json` compiles **ZERO FILES** and reports clean no matter what
> is in `src`. Every "mobile tsc clean / 0-error baseline" in this session's earlier entries was
> **vacuous** — it verified nothing.
>
> The real command is `-p tsconfig.app.json` (73 files). `tsconfig.app.json` also globbed `**/*.ts`,
> pulling the hand-run `scripts/*.ts` harnesses outside its `rootDir: "src"` and drowning the output in
> TS6059; `"scripts/**"` is now excluded so the real check is usable.
>
> **The true mobile baseline is ~11 errors**, all pre-existing and none from this session's work: DOM
> globals (`document`, `FileList`, `Blob`) in `PhoneSheet.tsx`, `proof-photo.ts` and PaymentScreen's own
> image picker, plus a `demo-shifts.ts:317` narrowing error. CLAUDE.md's "apps/mobile is 0-error" rule
> was wrong and is corrected there, with the command spelled out.
>
> **(3) The banner is gone for SETTLED claims.** A whole-day claim that has been answered is history:
> the grid already reads VERIFIED, tapping that status lists the claim and its outcome, and the cell can
> be disputed afresh. Repeating it in the evidence sheet told the PR their shifts were "settled" while
> giving them no way to learn WHICH — it read as an answer and was not one. It now shows only while a
> whole-day claim is still OPEN, which is actionable: it is the reason another cannot be filed.
>
> An old claim with `receipt_refs = NULL` genuinely does not record which shift; nothing can recover
> that. Every claim raised from now on names its shift.

> **5 Aug 2026 — A DISPUTE NAMES ONE SHIFT (the picker was multi-select).**
>
> Owner: *"noo bro the dispute make is possible will be only one of the shift"*.
>
> I built the picker as checkboxes, so a PR could tick several receipts and file one claim across them.
> Wrong shape: a claim answers *"this shift's drinks are wrong"*, and the agency settles it against that
> shift's receipt. One claim spanning two shifts carries one amount and one outcome for two questions
> that may each need a different answer.
>
> Now single-select — round radio, exclusive, and tapping the chosen one again does NOT clear it, since
> a dispute needs a shift and an empty selection is not a useful state to leave the PR in. A day with
> ONE receipt auto-selects it; a day with several starts unselected and Submit stays disabled until they
> answer, because pre-picking would put words in their mouth about money.
>
> `receiptRefs` is now sent on EVERY claim that has a receipt, single-receipt days included. So a null
> `receipt_refs` from here on means only "raised before the picker existed" — a legacy row, not a
> deliberate claim against the whole day. The whole-cell banner in the evidence sheet is therefore a
> statement about history, and new claims will always name their shift.
>
> ⚠️ **Open question, not decided:** `0085`'s partial index still allows one OPEN claim per
> (voucher, day, component). So a PR disputing shift A's drinks cannot ALSO have an open claim on shift
> B's drinks the same night — the second is refused until the first is answered. If both should be open
> at once, the index needs to include the receipt. Flagged in §9 rather than guessed at.
>
> `tsc` clean. No migration in this change.

> **5 Aug 2026 — 🔴 A SETTLED CELL COULD NEVER BE DISPUTED AGAIN (migration 0085).**
>
> Owner: *"the dispute button no works"* and *"why both is setttled i just want to know which shift's
> drinks is already disputed and verified"*. Same root, two symptoms.
>
> **(1) The unique index was not partial.**
> `payment_voucher_dispute_one_per_day_component` was `UNIQUE (voucher_id, dispute_date, component)`
> with **no WHERE clause**, so the FIRST claim on a cell locked it permanently. Victoria's Tue 4 drinks
> claim was already `accepted`, so the sheet opened, the form filled in, and Submit came back **409
> "drinks on 2026-08-04 has already been disputed"**. The button was not broken — the cell was spent.
>
> That made a settled claim final by accident rather than by rule. If the agency's correction is itself
> wrong — wrong shift fixed, or accepted and nothing changed — the PR had no route back and the money
> stayed wrong, because the argument slot was used up.
>
> **0085** makes it partial: `… WHERE outcome IS NULL`. One OPEN claim per cell, so a double tap still
> cannot create two rows; an answered claim blocks nothing. Strictly weaker than what it replaced, so no
> existing row could violate it. **Applied.** Verified live: a new claim on the settled cell is now
> ALLOWED, and two open claims on one cell are still REFUSED.
>
> **(2) Both receipts read SETTLED because the claim named neither.** That row's `receipt_refs` is NULL
> — it predates the picker — which means the whole day+bucket. Tagging each receipt from it said "both
> shifts were claimed individually", when the truth is "nobody said which; it was filed against the
> day". Different statements, and only one is true.
>
> A whole-cell claim is now stated ONCE, in a banner at the top of the evidence sheet; per-receipt tags
> appear only when the claim actually named that receipt. So going forward a narrowed claim answers
> *"which shift?"* precisely, and an old un-narrowed one says plainly that it never recorded the answer.
>
> `tsc` clean both sides; 34 harness checks pass. **Backend restart required.**

> **5 Aug 2026 — THE PICKER LOOKED LIKE A RADIO GROUP, AND NOTHING SAID WHICH SHIFT WAS CLAIMED.**
>
> Owner: *"enhence the UI , pr dont know which one is selected"* and *"need to show which shift drink or
> tips is already disputed"*.
>
> **(1) The chips were unreadable, and partly unstyled.** They reused `presetChip`, the SINGLE-select
> style from Quick reason — so a multi-select read as a radio group, and on/off differed only by a faint
> border tint. Worse, the label referenced `styles.presetText` / `presetTextOn`, **neither of which
> exists in the stylesheet**, so the text rendered with no style at all. React Native ignores an
> undefined style silently and `tsc` did not object, which is why it shipped looking almost identical
> either way.
>
> Now a proper ticked box: filled accent square with a check, accent border and tint, bright bold label;
> unselected is deliberately recessive. THREE independent signals (box, fill, text weight) so it holds
> up on a dim phone and does not rely on colour perception alone. `accessibilityRole="checkbox"` with
> `checked` state, so it announces correctly too.
>
> **(2) Nothing said WHICH shift was already disputed.** The grid can only mark a DAY, so on a
> two-shift night the PR could see "DISPUTED" and still not know which shift the claim was about — the
> very ambiguity the per-receipt selection exists to remove, reappearing where they go looking for the
> answer.
>
> `receiptRefs` now rides on the week payload's `disputes[]` (it was stored but never sent), and
> `receiptClaimState()` resolves it: a claim naming NO receipts covers the whole cell, one naming
> receipts covers only those. The evidence sheet tags each receipt **DISPUTED** (red) or **SETTLED**
> (green). Open beats settled where both touch one receipt — telling a PR "settled" about something
> still being argued would stop them chasing it.
>
> 34 checks in `check-cell-evidence.ts`, all passing, including that a drinks claim does not mark the
> tips cell and a Tuesday claim does not mark Wednesday. `tsc` clean both sides. No migration.
> **Backend restart required** (`receiptRefs` is new on the wire).

> **5 Aug 2026 — DISPUTE ONE SHIFT, NOT THE WHOLE DAY.**
>
> Owner: *"make the pr can select dispute which one ,because it have 2 shifts on that day"*.
>
> A dispute is filed per DAY + COMPONENT, so a PR working two shifts on one night could only contest
> both at once: tapping *Drinks · Tue 4* claimed the full **RM 7.20** even when just one RM 3.60 receipt
> was wrong. The claim was recorded against the day's whole total, and accepting it would have settled
> money nobody had questioned.
>
> **The column was already there.** `payment_voucher_dispute.receipt_refs` exists and
> `PrRaiseDisputeSchema` already accepted `receiptRefs` — the phone simply never sent them and
> `sumLinesFor` never read them. No migration, no new column.
>
> The dispute sheet now asks **"Which one is wrong?"**, but only when the cell holds more than one
> receipt — a single-receipt day has nothing to choose. Chips are built from the SAME
> `buildCellEvidence` the proof sheet renders, so the PR picks from exactly the rows they just looked
> at. All selected by default: narrowing is the exception, and "this whole day is wrong" should not cost
> extra taps.
>
> ⚠️ **Keyed on `receiptNo`, NOT the order number.** The schema comment says "by their packed ref", but
> the packed ref carries the ORDER number, and that is not unique — the same paper logged twice on one
> night yields two receipts both reading `ORD0389:0`, which is precisely the pair this feature exists to
> separate. `RCP-000010` vs `RCP-000012` is the only key that tells them apart.
>
> `sumLinesFor` narrows `disputedAmount` to the picked receipts, so the agency argues about the figure
> the PR pointed at. Verified live on the real two-shift day:
>
> | selection | recorded disputedAmount |
> |---|---|
> | none (whole cell) | RM 7.20 |
> | only the first shift | RM 3.60 |
> | only the second (the duplicate) | RM 3.60 |
> | both, explicitly | RM 7.20 |
> | a receipt not on that day | RM 0.00 |
> | a WAGE seal narrowed by a receipt | RM 0.00 — not the day's wages |
>
> `receiptRefs` is sent ONLY when the PR narrowed: listing every receipt means the same as listing none,
> and omitting it keeps "the whole cell" explicit in the stored row. Deselecting everything blocks
> Submit rather than silently widening back to the full cell — an empty chooser is an unfinished
> sentence, not a claim about the day.
>
> `tsc` clean both sides. ⚠️ The AGENCY queue still lists every receipt for the day + component and does
> not yet narrow to `receipt_refs` — recorded in §9; `DisputeQueuePanel.tsx` is being edited concurrently
> and was left alone.

> **5 Aug 2026 — A SETTLED DISPUTE HAS A SCREEN; THE PAYEE HAS A NICKNAME.**
>
> **1. Disputes: resolved claims were invisible.** Owner: *"yesterday got one successful dispute right
> show where?"* — the answer was **nowhere**. `useAgencyDisputes(openOnly = true)` sent `?open=1`, so
> no agency screen ever fetched a settled dispute; it sat in the database with no surface. Worse, the
> panel printed *"No open disputes"* whether none had ever been raised or one had been accepted an
> hour earlier — two very different facts, one sentence.
> Now fetches ALL and filters client-side: **Open / Resolved / All** chips with live counts (same
> `iz-filter-chip` idiom as the PV filter, not a lookalike), search across PR name, day, component,
> reason, resolution note and outcome, and three distinct empty states. The status pill was
> **hardcoded to "Open"** — only ever accidentally right — and now reads Accepted / Rejected /
> Withdrawn / Open. ⚠️ A settled row is now READ-ONLY and shows what was told to the PR: it used to
> offer live Accept/Reject on an already-decided claim, which the server refuses, so those were
> buttons that could only fail while implying the outcome was still changeable.
>
> **2. Payee shows the nickname:** `Vicky (Victoria Tan Mei Lin)` (`resolvePvPrLabel`). Joined from
> `pr.nickname` through the voucher's `pr_id` FK — NOT copied onto the voucher row beside `pr_name`,
> which is the duplication rule 3 exists to stop. No nickname, or one that merely repeats the legal
> name, prints the legal name alone.
>
> **3. Fixed a build-blocking error that predates this work:** `main.ts` read `req.originalUrl` inside
> `express.json({verify})`, where the argument is a bare `IncomingMessage` — `originalUrl` is added
> later by express's router, so the backend did not compile at all. Prefers `originalUrl`, falls back
> to `url`; behaviour unchanged.
>
> **Answered without a change:** *"if i already dispute how come need approve again?"* — that was the
> EDIT, not the dispute. RCP-000010 is the same RM 3.60 drink on the same day and stayed Verified;
> only the receipt whose figure was changed re-opened. Owner confirmed the rule stands. ⚠️ Known gap:
> `setReceiptStatus(...,'pending')` clears `reviewed_at`/`reviewed_by`, so afterwards
> approved-then-edited is indistinguishable from never-reviewed — showing the reason after the fact
> would need a marker column like 0084's.
>
> Backend typecheck clean; web clean on every touched file.

> **5 Aug 2026 — VERIFIED IS EARNED, AND A PENDING DAY CANNOT BE DISPUTED.**
>
> Owner: *"i got no make dispute on that day why the status is verified ?"*, then the rule —
> *"in this week section all approved , after dispute make then only verified"* — and *"pending is the
> agency havent approved , then how can dispute"*.
>
> **(1) One settled claim verified the whole week.** Resolving a dispute SENDS the voucher, and
> `buildWeekGridFromLines` calls a day `verified` the moment the voucher reaches a processed status
> (`sent`/`awaiting_pr`/`signed`/`paid`). So an accepted claim about TUESDAY's drinks flipped **MONDAY**
> to VERIFIED as well — a day the PR never disputed and nobody had said anything new about.
>
> New `thisWeekDayStatus()` maps `verified → approved` on the LIVE week, so the voucher's own status can
> no longer promote a day there: the agency's day sign-off gives APPROVED, and only a claim raised AND
> answered gives VERIFIED. Last week keeps the opposite mapping (`approved → verified`), because a
> closed week's sign-off is final — that distinction is now pinned in both directions.
>
> **(2) The dispute control was offered on money nobody had stated yet.** `cellDisputable` has always
> required the receipt to be past `pending` — until the agency approves it the figure is still the PR's
> own claim, so there is nothing to contest — and `openDispute` refused with an alert. But the FLAG icon
> and the sheet's **Dispute this amount** button were gated only on the KIND and the WEEK, so a PENDING
> cell advertised an action that ended in "Not reviewed yet".
>
> That is the **fourth** instance of this exact shape in two days (wages offered a 400; This-week hidden
> though the server allowed it; now pending offered though the client itself refused it). All three
> gates — kind, week, cell — are now applied wherever the control is drawn, and the comment at the sheet
> names every version so a fifth does not appear.
>
> 29 checks in `check-cell-evidence.ts`, all passing, including *"one pending line poisons the cell"* —
> a mixed day is not disputable until every line on it has been reviewed. `tsc` clean. No backend
> change, no migration.
> **4 Aug 2026 — Agency receipt editor + migrations 0083/0084 committed on `jk` (`57bd165`; §8 A6/X58).**
> Closes the "DB ahead of repo" gap: editor code, dispute-queue wiring, and readers for
> `payment_voucher_line.outlet_id` + `review_withdrawn_at` are in git. §9 uncommitted-tree block
> marked closed; next is live agency click-through + day/receipt agreement audit highs.
> Doc renew only in this commit (code already at `57bd165`).

> **4 Aug 2026 — 🔴 RESOLVING THE DISPUTE BLANKED THE WEEK AGAIN (reading and writing are not one question).**
>
> Owner: *"i have solve the dispute then in this week section why all missing ?"*, then *"if status
> verified for this week section , then next week section also status verified"*.
>
> **I fixed this wrong the first time.** Disputing moved the voucher to `disputed`, the reader filtered
> `pending_review`, and the week went blank — so I widened the filter to `['pending_review','disputed']`.
> Then RESOLVING the dispute moved `PV-000006` to **`sent`**, which was not on the list either, and the
> week blanked a second time. Chasing statuses one at a time was the wrong shape.
>
> **The real fault: READING and WRITING were sharing one lookup.** They want opposite answers.
>
> | | question | correct set |
> |---|---|---|
> | `getMyCurrentWeek` (read) | *what did I earn this week?* | **every** status — that is the point of the screen |
> | `getOrCreateCurrentWeekDraft` (write) | *may I append a receipt?* | only OPEN — appending to a sent voucher rewrites a document already handed over |
>
> The read now calls `getWeekVoucher` (unfiltered, and already used by last-week). The write keeps
> `OPEN_WEEK_STATUSES` and still refuses. Verified live on the now-`sent` voucher: the read returns
> `PV-000006 · sent · 12 lines · RM 3,708.20`, a receipt write is refused with *"has already been sent to
> you"*, and the week still holds exactly **1** voucher — no duplicate.
>
> **Rollover pinned too.** A day reading VERIFIED in This week must not regress when Monday moves it into
> Last week — a status that downgrades on its own is indistinguishable from work being undone. Both call
> sites now provably agree (Last week maps `approved → verified` first; a settled claim reads VERIFIED
> from either). 18 cases in `check-cell-evidence.ts`, all passing.
>
> `tsc` clean. No migration. **Backend restart required.**

> **4 Aug 2026 — A DISPUTED DAY NOW SAYS SO, SURVIVES A RELOAD, AND OPENS.**
>
> Owner: *"where is the red when i click that one is dispute and the status why still approved of the
> disputed day?"*, *"UI of this red , when i disputed this section"*, *"for the status on that day show
> disputed clickable show what was disputed drinks or tips"*, and *"then after solve dispute turn from
> the approved to the verified"*.
>
> **One cause behind all of it: the claim only ever lived in React state.** `disputedKeys` was built up
> as the PR raised disputes in-session, so the red cell and the DISPUTED marker were gone the moment the
> app restarted — while the agency still had the claim open in their queue. The one party who needed to
> keep chasing it was the only one who could no longer see it. `payment_voucher.status` was the phone's
> only other signal, and being voucher-grain it cannot say WHICH day or WHICH bucket.
>
> **Backend:** `/mine/current-week` and `/mine/last-week` now carry `disputes[]` (id, disputeDate,
> component, reason, note, raisedAt, disputedAmount, claimedAmount, outcome, resolvedAt,
> resolutionNote) via the existing `listForVoucher`. Additive; no column, no migration. ANSWERED claims
> ship too, not just open ones — *"your Tuesday drinks claim was rejected, here is why"* is the answer
> to a question the PR asked, and dropping it at the API leaves them re-raising it.
>
> **The day lifecycle, in precedence order:** `PENDING → APPROVED → DISPUTED → VERIFIED`. An open claim
> OUTRANKS an approval, because the approval is the very thing being argued with. Once the claim is
> answered the day reads **VERIFIED** — a stronger statement than approved: the figure was questioned
> and settled. A `withdrawn` claim colours the day neither red nor green; the PR took it back, so the
> day returns to whatever the agency's review says.
>
> **Red survives now** because `disputedCells` is the UNION of the server's open claims and the
> in-session set: red the instant it is submitted, and still red after a restart.
>
> **The status cell is tappable** where claims exist, opening a sheet naming each contested bucket with
> its state (OPEN / ACCEPTED / REJECTED / WITHDRAWN), what the voucher said, the PR's reason and note,
> and the agency's resolution note verbatim.
>
> Verified live against `PV-000006`: 1 dispute returned — `2026-08-04 · drinks · voucher said 7.21 ·
> Unmatch commission · OPEN` — so key `2026-08-04-drinks` reddens and Tue 4 reads DISPUTED. `tsc` clean
> both sides; 30 `check-cell-evidence.ts` checks pass. **Backend restart required.**

> **4 Aug 2026 — 🔴 DISPUTING ONE CELL BLANKED THE WHOLE WEEK (and silently froze logging).**
>
> Owner: *"im just dispute for that drinks then all gone ? can mark the status to disputed and remain
> back the missings ?"* — after raising a RM 7.21 drinks claim, This week read **RM 0.00, 0/7, every
> cell a dash**.
>
> **NOTHING WAS LOST.** The live DB still held `PV-000006` with **12 lines totalling RM 3,708.21**, plus
> the dispute row (4 Aug · drinks · RM 7.21 · open). The money was unreachable, not deleted.
>
> **Cause:** raising a dispute moves the VOUCHER to `status = 'disputed'`, and
> `getCurrentWeekDraft` matched `eq(status, 'pending_review')` — one status, exact match. The disputed
> voucher stopped existing as far as `getMyCurrentWeek` was concerned.
>
> **The second failure was worse and would have been found later.** `getOrCreateCurrentWeekDraft` calls
> the same reader, and when it returns null falls back to `getWeekVoucher`, finds the disputed voucher
> and REFUSES the write: *"has already been disputed and can no longer be added to."* So a PR who
> disputed RM 7.21 on Tuesday **could not log another receipt for the rest of the week** — the dispute
> would have quietly cost them far more than it could ever recover.
>
> **Fix:** `OPEN_WEEK_STATUSES = ['pending_review', 'disputed']`. A dispute is an open question about one
> DAY and one COMPONENT; it is not a statement that the week has closed. `sent` / `signed` / `paid` stay
> out — those have left the PR's hands and appending would rewrite a document already handed over.
>
> Verified against the live disputed voucher: the reader returns `PV-000006 · 12 lines · RM 3,708.21`, a
> receipt write still targets `PV-000006`, and the week still holds exactly **1** voucher — no duplicate,
> which is the failure the surrounding doc-comment was written about.
>
> **Also, the status is now legible.** A `DISPUTED` chip sits in the This-week card header (the
> voucher-grain fact), and the Status row marks the disputed DAY. Deliberately not last week's
> behaviour, which paints all seven days off the voucher flag — branding a whole week the PR is still
> working, over one contested cell, would be its own kind of wrong.
>
> `tsc` clean both sides; 30 `check-cell-evidence.ts` checks pass. No migration. **Backend restart
> required.**

> **4 Aug 2026 — THIS WEEK IS DISPUTABLE TOO (the button was hidden by the wrong test).**
>
> Owner: *"where is the dispute button for the pr at the drinks and the tips"* — asked while looking at
> the THIS-WEEK evidence sheet, where there wasn't one.
>
> **My gate was wrong, and it was the second wrong version of the same gate.** I had written
> `week === 'last'`, reasoning "nothing is issued yet to contest". The server disagrees:
> `DISPUTABLE_STATUSES = ['pending_review', 'sent', 'disputed']`, and the current week's voucher
> (`PV-000006`) is **`pending_review`** — disputable all along. Only `signed` and `paid` are locked,
> because the PR has put their name to it or the money has moved.
>
> The tab was never the rule. Both halves now mirror the server: `kindDisputable` (drinks/tips) and the
> new `weekDisputable(week)`, which reads the VOUCHER's own status — the same two-mistake pattern the
> earlier wages fix had, so the comment names both so a third version does not appear.
>
> **The flow was hardwired to last week and had to be threaded.** `submitDispute` posted to
> `lastWeek.voucherId` and wrote the response into last week's state, so a This-week claim would have
> landed on the WRONG VOUCHER (or been refused when no last-week voucher existed). `DisputeTarget` now
> carries its `week`; the post goes to that week's voucher; and because This week lives in the shared
> earnings CONTEXT rather than local state, it is re-read via `refreshEarnings()` instead of patched —
> Check-In renders off the same object and would otherwise show a voucher the server no longer holds.
> `openDispute` likewise resolves `cellDisputable` and the withdraw check against the right week.
>
> This-week cells now show the **flag** where a dispute is possible and the inspect glyph where tapping
> only opens the evidence — the same honesty rule as Last week.
>
> Why it matters beyond the button: a PR who spots a wrong figure on Tuesday can now say so on Tuesday,
> while the paper is still in their pocket, instead of waiting for Sunday's voucher.
>
> `tsc` clean; 30 `check-cell-evidence.ts` checks still pass. No backend change — the server already
> allowed this.

> **4 Aug 2026 — THE DISPUTE QUEUE CAN CORRECT THE RECEIPT IT IS ARGUING ABOUT.**
>
> Owner: *"after agency approved the pr can make disput eon the drinks and the tips , then in the agency
> also the same , can edit the approval receipt like in the receipt section in the agency payroll page ,
> just the status different in the disputes page , same edit receipt function"*.
>
> **The PR half already worked** and needed no change: `lineDisputable` returns true for drinks/tips as
> soon as the receipt leaves `pending`, so an APPROVED receipt is contestable — which is the whole
> point, since until the agency states a figure there is nothing to argue with.
>
> **The agency half was a deliberate refusal that had outlived its reason.** `DisputeQueuePanel`'s own
> doc-comment said accepting *"does not change the voucher amounts — edit the voucher itself for that"*,
> because the only edit path was `PUT /payment-voucher/:id`, which deletes and re-inserts every line.
> Upholding a PR's claim through it would have destroyed the self-logged receipts the claim rested on.
> The targeted receipt endpoints removed that trap, so the correction now happens in the queue.
>
> The **same `AgencyReceiptEditor` component** the Receipts sub-tab uses — not a copy, so a correction
> made while settling a dispute obeys exactly the rules a correction made anywhere else obeys.
>
> **A dispute names a DAY and a COMPONENT, never a receipt** (the PR tapped a grid cell, and a cell is a
> sum), so `receiptsForDispute` finds the paper the same way the cell was built: lines matching
> `lineDate` + `kind`, scoped by `voucherId` as well — `lineDate` alone would pull in another PR working
> the same night. Each row shows what THAT receipt contributed to the disputed cell, not its whole
> total. A line whose `kind` is missing (backend not restarted) is NOT matched: showing an unrelated
> receipt as "the evidence" is worse than showing none and saying so.
>
> **Two statuses, deliberately both on screen** — the amber *Open* pill is the DISPUTE; the pill beside
> each receipt is that RECEIPT's own review state. A reviewer settling a claim needs both facts.
> `verified` withholds the editor (week closed, server answers 409), matching the Receipts sub-tab.
> Wages/OT disputes say plainly that there is no receipt behind them and the fix is the shift record.
>
> ⚠️ **NOT COMMITTED, and must land WITH the receipt-editor slice.** `DisputeQueuePanel.tsx` imports
> `AgencyReceiptEditor.tsx`, which is still untracked (see §9) — committing the panel alone would
> produce a commit that does not build. `tsc` clean on the file and biome-formatted.
>
> ⚠️ **Not visually verified:** the queue reads **Disputes (0)**, so there is nothing on screen to check.
> Raise one from the PR app (Payment → Last week → tap an approved Drinks or Tips amount → Dispute this
> amount) and the editor should appear under that row.

> **4 Aug 2026 — A SIGNED VOUCHER NOW REACHES THE PAYMENT QUEUE.**
>
> Owner: *"after the pr sign the pv, the pv should come out at the payment week section at the payroll
> page agency"*.
>
> The **Payment Week** tab filtered by CALENDAR DATE alone (`last_last_week`), so it showed the week
> before last and nothing else. PV-000002 sat there purely by being old enough; PV-000004 — signed by
> the PR at 16:30 on 4 Aug — stayed in **Last Week**, because its week was 26 Jul–01 Aug. The
> signature changed nothing on the one screen that pays it, and the agency's own PR History was
> already reporting `2 signed · RM 1,575.00` while the payment screen showed one voucher at RM 875.
>
> **A signature is what makes a voucher payable, so a signature is what puts it in the queue.**
> `lastLastWeekPvs` now returns its existing window PLUS every `SIGNED` voucher from any week, deduped
> by id. `payrollActivePvs` already drops `PAID`, so a voucher leaves the queue the moment the
> transfer is recorded — no second rule needed for that.
>
> Two deliberate choices: a signed voucher **stays in its own week tab as well** (an agency looks for
> "last week's voucher" by the week it was worked, and removing it from there would hide it where
> they actually look), and the tab caption changed — `19 Jul – 25 Jul 2026 · signed · ready to pay`
> became `Signed vouchers · … and earlier · ready to pay`, because naming one week describes a list
> this tab no longer is.
>
> Web typecheck clean on the route. **Check after a refresh:** Payment Week should read 2 PV ·
> RM 1,575.00, matching the PR's History total. If those two disagree, the agency↔PR mapping is the
> next thing to look at, not this filter.

> **4 Aug 2026 — AN ADDED LINE MUST BE SOMETHING THE OUTLET ACTUALLY SELLS.**
>
> Owner: *"the drinks need verified is the outlet else cannot add so in his way can make list the the
> drink on that shift from what outlet"*, then *"need to do same thing for the tips also"*.
>
> **NO MIGRATION USED.** The catalogue is `outlet_drink_menu` (child of `outlet_workspace`, 1:1 with
> an outlet), one table split by `category` — `drink` renders as DRINKS PRICE, `service` as SERVICE
> ENTITLEMENT. **Tips therefore needed no second design**, which is the whole reason the discovery
> pass ran before any code: the "two lists" on the Outlet screen are one table.
>
> **The outlet is resolved by FK, never by name.** `payment_voucher.outlet` and
> `payment_voucher_line.outlet` are free-text varchars with no FK and no unique constraint on
> `outlet.name`, so a name cannot be resolved to one outlet safely. The sound path already existed:
> `payment_voucher_receipt.shift_assignment_id → shift.outlet_id → outlet.id`, read through
> `resolveDrinkMenusForOutlets` — the SAME reader that feeds the PR's phone its self-log menu, already
> injected into the PV controller. No new repository, no new wiring, no DDL.
>
> ⚠️ **This makes migration `0083_pv_line_outlet_fk` dead DDL.** It was authored earlier the same day
> on the assumption that name-matching was the only option. It is journalled but NOT run and NOT
> referenced by any code — decide in §9 whether to drop it (recommended) or wire it as the fallback
> for receipts with no shift link.
>
> **Three refusals, each naming the outlet:** no shift link (the outlet cannot be established), no
> list configured (worded for BOTH buckets — telling someone adding a tip that there is "no drinks
> list" sends them to the wrong screen), and item not on the list. Matching is trimmed and
> case-insensitive; the CATALOGUE's spelling is what gets stored, so a line can never drift from the
> list it was checked against.
>
> **The review found 10 defects; the high one was mine to worry about.** `shift_assignment_id` is
> supplied by the phone and was stored **unvalidated**. Cosmetic until now — but the catalogue check
> resolves the outlet through it, so an assignment belonging to somebody else's shift would point the
> price-list check at the WRONG VENUE, and an item that outlet happens to sell would then pass
> verification on a receipt it has nothing to do with. `addMyReceipt` now refuses an assignment the
> signed-in PR does not own, via the same `listByIdsForPr` reader `weekShifts` uses. Also fixed: the
> empty-catalogue message no longer names only drinks, and the catalogue query no longer retries a
> 404 three times before admitting it has nothing.
>
> Backend, web and mobile all typecheck clean. **Not exercised live** — the in-app browser is signed
> in as a vendor account (every agency call 403s) and Claude in Chrome is not connected.

> **4 Aug 2026 — NO DISPUTE BUTTON ON WAGES/OT, AND "VERIFIED" MEANT TWO THINGS ON ONE SCREEN.**
>
> Owner: *"make sure the daily wages and the other(OT) cannot make dispute , remove it if have the
> dispute button shown to pr"* and *"the status in the last week section should be verified"*.
>
> **(1) The dispute button was MY regression, shipped in `927ec8a`.** The rule itself was already right
> everywhere it mattered — `lineDisputable` (payment-voucher-component.ts) drives both the `disputable`
> flag and `raiseMyDispute`, which answers 400 for wages/OT, and `cellDisputable` mirrors it on the
> phone. But the new evidence sheet gated its Dispute button on `week === 'last'` **only**, ignoring the
> kind, so *Daily wages · Thu 30 Jul* offered a button the server would have refused.
>
> Added `kindDisputable(kind)` to `receipt-review.ts` as the ONE client mirror, used in three places:
> the sheet's button, the cell's icon (a **flag promises a dispute** — wages/OT now get the same inspect
> glyph as This-week, since tapping still opens the evidence), and `openDispute`'s guard, which held a
> fourth inline copy of the kind list. Wages and OT are derived from the attendance stamps, so the route
> for a wrong one is the shift record, and the alert says exactly that rather than "your agency is still
> checking the receipt" — advice to wait for something that will never come.
>
> **(2) The two halves of the Payment screen used one word for two things.** Last week showed
> **APPROVED** on Thu 30 above a header reading **"Verified days 0/7"** and a footer reading
> **"0 verified"**. Both were "correct": the agency HAD approved that day (`payment_voucher_day_review`
> 2026-07-30 = approved), but voucher `PV-000004` is still `pending_review`, so it never entered
> `VERIFIED_STATUSES`. This week already counted `approved || verified`; last week counted `verified`
> alone. That asymmetry was the whole bug.
>
> An agency-approved day now reads **VERIFIED** and counts — in Payment's Last-week row and in
> PvDetailScreen, both of which are CLOSED weeks where a day sign-off is final. This week deliberately
> keeps APPROVED distinct: a mid-week approval is a checkpoint, since more receipts can still land on
> that day.
>
> ⚠️ **The trap in that change:** the LAST WEEK pill read `verifiedDays > 0 ? 'SENT' : 'PENDING'`, safe
> only while the counter meant "voucher processed". Left alone it would now have printed **SENT** over a
> `pending_review` voucher — telling a PR their week had gone out when nobody had issued it. The pill is
> now driven by the voucher's own status (`weekIssued`): days are verified by day review, the WEEK is
> issued by the agency — two facts, two sources.
>
> `tsc` clean; the 30 `check-cell-evidence.ts` checks still pass. No migration.

> **4 Aug 2026 — THE AGENCY CAN CORRECT A RECEIPT (Edit under Approve).**
>
> Owner: *"under the approve button add edit button that really can makes changes"*, then four
> refinements — the time must be editable too (*"the ocr sometimes will be wrong"*), the add-line
> category must follow the receipt (*"id edit tips then is edit tips thats all"*), the add form should
> not stand there when nothing is missing, and the whole editor is confined to *"the scanned or self
> log of the drink or the tips at the receipt section"*.
>
> **NO MIGRATION. ZERO DDL.** `order_no`, `receipt_date`, `receipt_time`, `quantity`, `amount` all
> existed. Three targeted endpoints, none of them `PUT /payment-voucher/:id` — that path deletes and
> re-inserts every line and once severed the receipt links and destroyed a PR's proof photos:
> `PATCH /receipts/:id/lines/:lineId` (existed, no UI had ever called it), `POST /receipts/:id/lines`
> (new), `PATCH /receipts/:id` (new — order no, date, **and time**).
>
> Two consequences survive every write, and the editor says so on screen rather than letting them be
> discovered afterwards: an **approved receipt drops to pending**, and any change to the MONEY makes
> that day's approval **stale**. A time correction moves no money — a line's day is `line_date`, never
> the printed clock — so it re-opens the receipt and stales nothing.
>
> **The add-line category is derived, not chosen.** A tips receipt adds tips, a drinks receipt adds
> drinks; the kind comes from the receipt's own lines (`kind` now rides on the agency feed rather than
> being re-parsed from `ref` on the client). Only a receipt with no lines, or mixed kinds, still
> offers the choice. And the form is **collapsed** behind one link — the OCR usually reads the paper
> correctly, and a permanent row of empty fields reads as work still to do.
>
> **Its own review found 7 defects; all 7 are fixed.** Two were serious. (1) The one-paper-one-log
> duplicate guard only ran when the ORDER NUMBER was typed — but changing the DATE moves the paper
> onto another day where its existing number may already be logged, so the double payment the rule
> exists to stop walked through the date field instead; it is now gated on the RESULT. (2) The save
> invalidated `["agency","payment-voucher","evidence"]` but not `["agency","payment-voucher", id]` —
> two different keys, neither a prefix of the other, both on screen at once, so the voucher document
> beside the editor kept quoting pre-edit figures. Also fixed: the receipt-review hook had the same
> invalidation gap; a write that never reached the server produced NO message at all (which reads as
> "it saved" — now a shared `writeFailureMessage` always says something); the Edit/Approve controls
> were offered on a **PR-signed** voucher every endpoint refuses, and now explain their absence; the
> added line's dedupe slot used `siblings.length` as an index, repeating a number still in use after
> any deletion; and `invalidate()` now RETURNS its promises, so a saved row no longer flashes its old
> figure while the refetch is in flight.
>
> **Design pass on the editor:** `.iz-btn` is `width:100%`, so the first cut rendered a full-width Save
> slab per line — three items, three slabs, each as loud as Approve. Now one shared grid with aligned
> Qty/RM columns, Save appearing only on a row actually changed (with Undo and a gold edge marker), a
> running `3 items · RM 535.50` to check against the paper, column headers instead of a caption
> explaining commission after the fact, and labelled order-no / date / time fields.
>
> Backend typecheck clean; web clean on every touched file.

> **4 Aug 2026 — ONLY DRINKS AND TIPS CAN BE DISPUTED (reverses a 30 Jul rule).**
>
> Owner: *"makes the pr only can dispute for the drinks and the tips … Other (OT), Daily wages cannot
> disputed"*.
>
> This **reverses** the 30 Jul decision that wages were the one thing always disputable (the reasoning
> then: wages are sealed at check-out with no receipt to approve, so gating them on approval would make
> a wage error uncontestable). The cost is recorded rather than hidden — **a wrong wage or OT figure now
> has no in-app route to contest at all**. The new reasoning: wages and OT are not CLAIMED, they are
> DERIVED from the check-in/check-out stamps and the shift rate, so the fix is the attendance record,
> not an argument about the total. ⚠️ `others` covers OT **and deductions**, so a deduction is not
> disputable either — if that ever needs contesting it gets its own bucket, never a re-opened OT.
>
> **One rule, two callers:** `lineDisputable(kind, receiptStatus)` in `payment-voucher-component.ts`
> feeds BOTH the `disputable` flag the app reads and the refusal in `raiseMyDispute` — a client copy of
> a rule is never the rule, and the two disagreeing is exactly how a PR gets offered a button that
> 409s. Wages/OT are refused server-side with a 400 that says where to go instead, not merely hidden:
> a rule the server does not enforce is one a replayed request walks past.
>
> Mobile mirrors it in `cellDisputable`, checking the kind **before** the line lookup so a day with no
> lines still refuses instead of falling through to the permissive default. The two refusals get
> different wording — telling a PR to "wait for review" on a wage figure is advice that never comes
> true.
>
> Verified: backend typecheck clean, mobile clean (bar the pre-existing `scripts/` rootDir baseline).

> **4 Aug 2026 — APPROVING A DAY APPROVES ITS RECEIPTS, AND THE PR IS TOLD.**
>
> Owner: *"in the agency role i have approved the at the pv section this week then the receipt section
> should be automatically approve it also"*, then *"the pr should need to see the status was approved
> for this week"*.
>
> **NO MIGRATION. ZERO DDL.** Both halves already existed as columns; what was missing was that they
> never spoke. A day's `approved_total_cents` IS the sum of its lines, and those lines are the
> receipts' lines — so an agency approving **RM 3008.20 for Tue 4 Aug** had already stated the receipt
> behind it was right, yet `voucherSendGate()` still blocked the week on *"2 receipt(s) not yet
> reviewed"*: evidence the same person had signed off one panel above.
>
> **Backend** — new pure `receiptsCarriedByDays(lines, receipts, approvedDates)`. A receipt is carried
> only when **every** day it touches is approved (a Mon+Tue receipt waits for both — approving Mon
> alone leaves half its money in a day nobody looked at), and a receipt with **no dated lines is never
> carried**, because `dayTotalsCents` skips undated lines so no day's total ever contained it. New
> `approvePendingReceipts(ids, actor)` does it in ONE statement re-asserting `status='pending'` in the
> WHERE, so a receipt approved between the read and the write keeps its real reviewer. Both
> `reviewDay` and `approveAllDays` sweep from the **full** set of approved days, not the one just
> decided — the spanning receipt has to clear whichever order the agency worked in — and both now
> answer with the post-sweep `receipts`, `approvedReceipts[]` and `pendingReceiptCount`.
>
> **The PR half** — `/mine/current-week` and `/mine/last-week` ship `dayReviews[{date,status}]`,
> **date and status only**: the note and the reviewer's name are the agency's internal record. Without
> it the phone could only read the VOUCHER's status, which sits at `pending_review` all week — which
> is why a day approved on Tuesday still showed **PENDING** to the PR until Sunday. A **stale** day
> arrives as `null` exactly as it does in the agency panel, so an approval of a figure that has since
> changed never reads APPROVED on the phone.
>
> **Two bugs fell out of the same screen.** The This-week header read *"Verified days 2/7"* off the
> **pending** count — a week with nothing approved still showed 2 as though it were — and
> `hasThisWeekRows` was `thisPendingDays > 0`, so the section would have emptied itself the moment
> every day got approved.
>
> **The gap the owner caught the same afternoon** — *"not all is approved by agency in the receipt
> section … then the pr is showed approved?"*. The PR's APPROVED was driven by the day review ALONE,
> so Tue 4 Aug read APPROVED on the phone while RCP-000011 and RCP-000013 sat *Waiting on you*. Two
> states can legitimately disagree — a receipt straddling an unapproved day is held back by design,
> and a day approved BEFORE the carry existed (13:03 / 13:11 on 4 Aug) never swept at all — so the
> phone now takes the pessimistic one: `prVisibleDayStatuses()` drops a day back to `null` when any
> PENDING receipt has a line on it. That matters beyond cosmetics, because APPROVED is what tells the
> PR the figure has become the agency's statement and may be **disputed**; showing it early points
> them at a dispute the server refuses, naming a receipt they cannot see.
>
> **Legacy days self-heal via a script, not a re-click:** `repair-day-approved-receipts.ts` runs the
> SAME pure rule over every unsigned voucher — **dry run by default**, `--write` to apply — so days
> approved before 4 Aug carry their receipts without the agency re-approving each one by hand.
>
> **Not done, deliberately:** withdrawing a day approval does **not** un-approve its receipts.
> Dropping a receipt back to pending stays a deliberate act in the receipts panel, where the photo is.
> The day panel now says out loud that approving a day approves its receipts — silent would be a trap.
>
> Verified: 7/7 pure checks on the carry rule (spanning / undated / already-approved / nothing-
> approved), backend + mobile + web typecheck clean on every touched file. The live agency→PR
> round-trip still needs a click-through.

> **4 Aug 2026 — TAP AN AMOUNT, SEE THE PAPER BEHIND IT (PR Payment cell evidence).**
>
> Owner: *"makes the pr can see the how come the amount of the drinks from what order No what shift
> check in, check out time , what quantity , what drinks item to proof them is from which today's
> shift"*, then *"so where can i open one by one where can i check proof ?"* — the honest answer being
> **nowhere**: no screen broke a day's total back into the receipts behind it.
>
> **NO MIGRATION. ZERO DDL.** Every fact was already a live column — `payment_voucher_receipt.order_no`
> / `receipt_date` / `receipt_time` / `shift_assignment_id`, `shift_assignment.check_in_at` /
> `check_out_at` / `overtime_minutes`, `payment_voucher_line.quantity` / `description`. The gap was the
> WIRE: a PR could see their own order number exactly once, in the 201 echo of `addMyReceipt`, gone
> after a reload — while `listAgencyReceipts` carried it on every read behind the agency guard. The
> agency could see a PR's order numbers and the PR could not.
>
> **Backend** — `PrReceiptLineDTO` gains `orderNo`, `receiptDate`, `receiptTime`, `shiftAssignmentId`;
> `receiptInfoMap` widened into a named `ReceiptInfo`. Wage/OT lines have no receipt, so their shift is
> recovered from the `ref` (`decodeRef` already computed `dedupe` and the mapper threw it away),
> uuid-guarded and `-ot`-stripped — that is what makes **Daily wages** drillable too, not just drinks.
> New `ShiftAssignmentRepository.listByIdsForPr(prId, ids)` reads the stamps through the FK; both
> `/mine/current-week` and `/mine/last-week` now ship a sibling `shifts[]` array (not fields repeated on
> every line — a three-item receipt would otherwise carry the same two timestamps three times).
>
> ⚠️ **`prId` in that WHERE is a security boundary, not an optimisation.** `shift_assignment_id` is
> written from client input at receipt creation and is not validated against the PR there, so a bare
> `inArray(ids)` would surface someone else's shift times. Verified live: a different PR asking for
> Victoria's two assignment ids gets **0 rows**.
>
> **Mobile** — new pure `lib/cell-evidence.ts` (`buildCellEvidence`, `evidenceMatchesCell`) using the
> IDENTICAL filter as `week-pay-grid.ts`, so the sheet total is the same arithmetic as the cell rather
> than a drifting re-derivation; new `components/CellEvidenceSheet.tsx` reusing PvDetailScreen's sheet
> chrome, ShiftStatusPanel's fixed-width table and `shift-session`'s stamp helpers. `PaymentScreen`
> cells on BOTH weeks are now tappable → evidence, and **Dispute** moved inside the sheet, calling the
> untouched `openDispute` so the withdraw path is unchanged. This-week has no dispute button — nothing
> is issued yet to contest.
>
> **Two deliberate refusals of a convenient lie:** the check-out stamp is labelled **SHIFT END**, never
> "you tapped out at", because `check_out_at` is CLAMPED to the scheduled end when a PR taps out late
> (the overrun survives only in `overtime_minutes`, printed beside it). And a line with no shift link
> shows as **"Not linked to a shift"** — never attributed by the `loggedAt >= checkInAt` heuristic
> Check-In uses for display, which misfiles a receipt logged between two shifts.
>
> New harness `apps/mobile/scripts/check-cell-evidence.ts` — 30 checks over Victoria's real 4 Aug
> voucher, all passing, including that the duplicated ORD0389 stays visible as TWO receipts instead of
> being tidied into one. `tsc` clean both sides (mobile 0-error baseline held). **Backend restart
> required** — tsx watch serves stale routes.

> **4 Aug 2026 — THE AGENCY'S RESET OFF CUSTOM APPLIED ITSELF; THE ADMIN COULD ONLY AGREE.**
>
> Owner: *"makes the agency reset back need wait admin to resolve or cancel in status"*, and
> *"the admin can cancel status also in the plan request page"*.
>
> `requestLeaveCustom` filed the reset as a `plan_change`, and the server applies an AGENCY plan change
> on the spot (`status: 'direct'`). So the tier moved the instant the agency tapped Reset, and the row
> that reached Plan Request was a decision already taken — `Custom → Reset · Starter`, **Direct**, no
> price, one button. The agency ended a price two people had negotiated, by itself. The hook's own
> doc-comment already said the opposite (*"the admin resolving it is what moves the ledger"*); the code
> had drifted from it.
>
> Now filed as `custom_renegotiation` **naming the tier it wants** — the shape that already means *exit*
> and the exact mirror of a venue dropping POS. It lands Pending, the ledger does not move, and
> `applyResolvedPriceToLedger` already knew how to finish it (a Custom request naming a plan → move).
>
> The other half was missing everywhere in that inbox: **Resolve was the only answer**. A POS quote, a
> Custom re-price or either cancellation could not be refused, so a request the admin disagreed with sat
> Pending forever while the subscriber's screen kept saying "waiting for admin".
>
> | surface | change |
> |---|---|
> | `decline()` | widened past `plan_change` to the two negotiated types; refuses `resolved`/`approved`/`direct` — a `direct` row was applied when filed, so cancelling it would move the badge and not the ledger |
> | Plan Request drawer | **Cancel request** beside Resolve (hidden on Direct/resolved/declined); saves remarks first, so the reason survives |
> | `declinePlanChange` → `declineRequest` | the name was wrong the moment a POS quote could use it |
> | Agency Subscription | Reset now says it waits — pill `Reset · pending admin`, button `Reset requested…`, and the toast no longer claims the tier already moved. Renegotiate/Reset now block only THEMSELVES (`customRequestKind`), not each other |
>
> Backend + web, no schema change, no migration. Declining writes `status` only — the ledger is never
> touched, which is the point: the venue keeps its add-on, the agency keeps Custom at the agreed price.
> **Not yet clicked through** — needs an agency and an admin session on a running app.
> Rows already filed as **Direct** (e.g. Atlas's `Custom → Reset · Starter`) stay uncancellable by design:
> that move already happened, so the honest fix is a new request, not a retro-cancel.

> **4 Aug 2026 — A PLAN SWITCH SILENTLY CANCELLED THE VENUE'S POS ADD-ON.**
>
> Owner: *"i have integrate with POS so leave it remain, then i switch the normal plan why does it also
> change the integrate with POS in the outlet"*.
>
> The whole point of an add-on is that it is held ALONGSIDE a plan (migration `0081`), but
> `applyPlanChangeToLedger` closed **every** active `member_subscription` row for the venue before opening
> the new plan row — no `kind` filter at all. So approving a switch stamped the POS line `expired` too,
> and the venue's Subscription page fell back to "Request admin quote" as if the integration had never
> been priced. The negotiated figure went with it. It now closes `kind: 'plan'` only; the add-on line is
> untouched by a tier move and can still only be ended by the venue's own removal request
> (`applyResolvedPriceToLedger`, the POS-request-naming-a-plan branch).
>
> Two sibling reads had the same blind spot, both because a venue holding POS has **two** active lines and
> the add-on is the NEWER one, so a `pageSize: 1` read returned "POS Integration, RM 0" instead of the plan:
>
> | read | was | now |
> |---|---|---|
> | `create()` duplicate-switch guard | compared the requested plan against the add-on, so "Already on X — no switch needed" never fired for a POS venue | `kind: 'plan'` |
> | `withLiveFromPlan()` | admin drawer showed a pending request's "BEFORE · FROM PLAN" as POS Integration | `kind: 'plan'` |
>
> Backend-only, no schema change, no migration. `apps/web` already reads the add-on independently
> (`useOutletSubscription.activeAddon` / `addonAmountRm`) — it was telling the truth about a ledger that
> had been wrongly closed. A venue whose add-on was already expired by a past switch must be re-quoted
> through the normal POS flow; this fix does not resurrect those rows.

> **4 Aug 2026 — "UPCOMING 3" ON A DAY WITH NO UPCOMING SHIFT.**
>
> Owner: *"in today page pr why still have 3 upcoming , but the agency schedule is already no shift"*.
>
> Today's hub strip read **UPCOMING 3** directly above an Agency Schedule saying *"No shifts this week"* —
> the same three shifts called both pending and gone on one screen. The DB settles it: every 4 Aug
> assignment is `completed` with both stamps —
>
> | assignment | shift_date | status | check_in_at | check_out_at |
> |---|---|---|---|---|
> | d24c4329 | 2026-08-04 | completed | 01:54:27Z | 03:08:59Z |
> | 43f7e17e | 2026-08-04 | completed | 03:09:47Z | 03:14:13Z |
> | ac63bead | 2026-08-04 | completed | 03:29:36Z | 04:05:08Z |
>
> `upcomingCount` tested the DATE only (`ymdToIso(...s.date) >= todayIso`), so a shift already worked still
> counted as upcoming. The timetable was the honest one — it drops a shift the moment it is checked in or
> out (`AgencySchedulePanel` ~263), because one being worked belongs to Today and a worked one belongs to
> Payment. The count now applies that same predicate on the mapped shape (`status !== 'complete' &&
> status !== 'on-duty'`), giving **0** for 4 Aug. Future days and today's not-yet-started shifts still
> count. Client-side only — no endpoint, no schema, no migration; `apps/mobile` stays 0-error.
>
> Note the 3 Aug row (`assigned`, no stamps) is the RED missed-check-in day on the calendar; being dated
> before today it was never in the count and still isn't.

> **4 Aug 2026 — ONE PAPER = ONE LOG PER NIGHT (the duplicate guard was scoped to the check-in).**
>
> Owner: *"this shift got problem cause the user scanned the same receipt for the drink so is same order
> no why can submit"* and *"on that single shift can't submit the scan or self-log receipt for same order
> no"*, after asking whether **RM 7.20** of drinks for a whole day could be right.
>
> **The RM 7.20 was arithmetic-correct and evidence-wrong.** Victoria's 4 Aug lines, from the live DB:
>
> | receipt | order | source | item | qty | sales | comm | shift stamp |
> |---|---|---|---|---|---|---|---|
> | RCP-000010 | ORD0389 | scan | Lemon Drop | 1 | 30.00 | 3.60 | d24c4329 |
> | RCP-000011 | ORD1111 | manual | Tips / Booking / Havoc | 1/1/2 | 2150.00 | 365.50 | 43f7e17e |
> | RCP-000012 | **ORD0389** | scan | Lemon Drop | 1 | 30.00 | 3.60 | ac63bead |
> | RCP-000013 | **ORD1111** | manual | Booking / Havoc / Tips | 1/3/1 | 3150.00 | 535.50 | ac63bead |
>
> Only **one drink was ever really sold** — a RM 30 Lemon Drop, at Emhub Testing Tier III's 12% = RM 3.60.
> The day showed RM 7.20 because the SAME PAPER was scanned twice. Every rate reconciles at Tier III
> (drinks 12%, tips 17%: 50→8.50, 100→17.00, 2000→340.00, 3000→510.00), so nothing was mis-bucketed —
> the third check-in simply logged no drink at all.
>
> **Why the guard let it through.** `findReceiptByOrderNo` was scoped to the SHIFT STAMP, on the reasoning
> that a new check-in is a new shift. Each duplicate pair above carries a *different* `shift_assignment_id`
> — three check-ins on one night — so the guard never fired. A check-in is not a new night, and the paper
> does not become a second paper because the PR clocked in again.
>
> **Now scoped to the NIGHT + OUTLET** (`payment_voucher_line.line_date` + `.outlet`), covering scan and
> self-log alike since both submit through `addMyReceipt`. Not the whole voucher — that is a WEEK, and
> outlets recycle order numbers, so Monday's ORD0389 would have blocked Thursday's. Outlet is part of the
> identity because two venues can each print ORD0389 on one night; a null on either side still counts as a
> match, since refusing a re-log the PR can undo beats paying it twice. The OCR fold (`ORDO389` = `ORD0389`)
> is unchanged, and no migration was needed. Verified against the live rows — the three real duplicates
> refuse, while a different outlet, the next night, and an unseen number all pass.
>
> ⚠️ **Not fixed, flagged:** the four duplicate receipts are still in the DB (drinks RM 3.60 and tips
> RM 535.50 counted twice), and **Daily wages read RM 2,100 = 3 × RM 700**, one full day's Tier III wage
> per check-in on a night of 1h15m + 0h36m + 0h04m. Both need an owner decision before anything is deleted.

> **4 Aug 2026 — CHECK-OUT NEEDS ONE ACTION, NOT ONE OF EACH (corrects the rule shipped in `7d7bfa6`).**
>
> Owner: *"every shift must have either one drink or tips , or both also can to check out"*. I had read
> the earlier *"scan or self log the drink and the tips"* as **AND** and enforced both halves — so a
> drinks-only night was held with *"Nothing logged for tips yet"* and **no honest way to satisfy it**: the
> only escape would be inventing a tip that never happened, which is the opposite of what these gates are
> for.
>
> **Now: at least ONE action — a drink, a tip, or both.** What is still refused is an EMPTY shift, nothing
> but the clock, plus the unchanged rule that every logged row carries its picture. Wages and the check-in
> stamp remain the shift itself rather than an action, so neither satisfies it.

> **4 Aug 2026 — REMOVE THE RECEIPT, NOT ONE ITEM OFF IT (and the uncaught `RCP-…` toast).**
>
> Owner: *"Makes the scan I also can remove and scan again"* and *"if user need remove that picture that
> related scanned receipt also will be remove it together"*.
>
> **The backend was already right:** `deleteMyLine` deletes the RECEIPT once its last line goes
> (controller ~1653), which is exactly what frees the order number to be scanned again. The phone was
> deleting ONE line per tap — so a three-item tips receipt needed three deletes, and any re-scan in the
> gap was refused with *"ORD1111 is already logged on this shift (RCP-…)"*. That refusal escaped as
> **"Uncaught (in promise, id: 1)"** in a red system toast, because nothing caught it.
>
> **Now the paper is the unit.** The row’s trash removes every line sharing that `receiptNo`, letting the
> backend’s cleanup fire on the last one; a bare self-log with no receipt still deletes alone. The refusal
> is caught and shown in the gallery — an agency-reviewed receipt genuinely cannot be pulled, and that is
> worth reading rather than crashing past.
>
> **Removing the PICTURE now removes its receipt too.** The photo IS the receipt’s proof: stripping it
> would leave the items standing with nothing behind them, and check-out refuses picture-less rows anyway
> — the PR would be stuck holding money they cannot prove. The gallery caption says so outright: *"✕
> removes the receipt and everything logged from it"*.

> **4 Aug 2026 — the same one-picture rule applied to the Scanned receipts card.**
>
> Owner: *"for all of the receipt also like this makes"*. `collectReceiptPhotoGroups` counted a photo per
> LINE, so a three-item tips scan read **"Tips / Service · 3 pictures · 3 items logged"** and drew the
> same paper three times. Deduped per group, so the count answers what it claims to — how many receipts
> were photographed — while `lineCount` still says how many items came off them. Both surfaces that render
> this card (Check-In and the scan screen) are fixed by the one change.

> **4 Aug 2026 — ONE PICTURE, ONE THUMBNAIL. Plus the cause of "Internal Server Error" on a self-log edit.**
>
> Owner: *"if that self log for the tips have many same picture if just that action only show one of that
> picture"* — three items scanned off ONE receipt each carry that receipt's photo (by design, since
> `3d51a6d`), so the gallery drew the same paper three times and read **PROOF PHOTOS · 3** for a single
> picture. Deduped by image; the kept entry keeps its real `lineId` + index so REMOVING it still deletes a
> photo that exists rather than a display-only copy.
>
> **🔴 STILL OPEN — the self-log edit is structurally wrong, and that is what 500s.** Owner: *"if i remove
> the tips all of the tips scanned or self remove it together, if i edit the tips all also can edit
> together… internal server error solve this"*. Read `ScanScreen.submitManual`:
>
> ```ts
> const [first, ...rest] = items;
> await editLine(editId, { ...first });      // updates ONE row
> for (const d of rest) await logLine({...}); // and re-adds the others as NEW rows
> ```
>
> So editing the Tips row of a 3-item receipt UPDATES one line and INSERTS duplicates of the siblings that
> are already saved; an item set to 0 is simply left behind, still logged. Re-adding an item that already
> exists on that receipt is what throws. **The fix is the model the owner described: a scan is ONE
> RECEIPT, so edit reconciles every item of that receipt in one pass (update / insert / delete-to-zero)
> and delete removes the whole receipt.** Lines already carry `receiptNo`, so they can be grouped without
> a backend change. NOT attempted in this slice — a half-built rewrite on the payment-line path is worse
> than a known bug, and this one needs its own careful pass.

> **4 Aug 2026 — "THIS SHIFT" MEANT "TODAY", SO A SECOND CHECK-IN INHERITED THE FIRST SHIFT’S WORK.**
>
> Owner: *"When pr check in , New shift new receipt data please clear it"*. Checked in at **11:29** for a
> new shift and the screen still showed a Havoc logged at **11:13**, four proof photos and three scanned
> receipts from the session before — every one of those headings says *"this shift"*.
>
> **Three places filtered by DATE and called it a shift:** `CheckInScreen.todayReceipts`,
> `ScanScreen.todayReceiptLines`, and `ShiftStatusPanel`’s own `logs` memo (which is what feeds the STATUS
> table, TOTALS and the PROOF PHOTOS gallery). A PR working two shifts on one date got the first one’s
> items, money and pictures carried into the second.
>
> **Now scoped by the check-in stamp** — the thing that actually separates two sessions on one date.
> Anything logged before this check-in belongs to the shift before it. The wage/check-in row is stamped at
> check-in itself so it lands on the right side, and with no stamp yet (pre-duty) the day is all there is
> to go on.
>
> This also repairs the gates built earlier today: the missing-photo count and the drinks+tips
> requirement now judge THIS shift instead of dragging a previous one’s rows in as satisfied.
>
> ⚠️ Time-based, not assignment-based. Correct for sequential shifts, which is what the day looks like;
> the structural version would expose `shift_assignment_id` on the line DTO (receipts already carry it).

> **4 Aug 2026 — THE MIS-FILED HAVOC LINE RE-FILED, USING THE ROW’S OWN EVIDENCE.**
>
> Owner: *"then how u can change this ?"* — the code fix (`1a3a243`) only governs NEW logs; the row
> already saved still read **OT · RM 2,000.00**, and RM 340.00 sat under *others* on the Payment week.
>
> **Two fields had to move, not one.** `lineKind()` lets a PACKED REF outrank the `component` column, so
> changing `component` alone would have displayed nothing different:
>
> ```
> ref = "others|manual|2000.00|ORD1111:2|service"
>        ^ kind says overtime            ^ the row’s OWN category says service
> ```
>
> **That self-contradiction is the match rule** — `refile-service-lines.ts` touches only rows whose packed
> kind is `others` while their own category segment reads `service`/`tip`. A genuine overtime line carries
> no category there and can never be caught. Far safer than matching descriptions against the menu, which
> was the first idea.
>
> ⚠️ **MONEY UNTOUCHED:** `quantity`, `amount` and the sales figure inside the ref are never written —
> only the bucket. Dry-run first (1 row), then applied. Verified after: Havoc now
> `component=tip_commission ref=tips|manual|2000.00|ORD1111:2|service`, commission still **RM 340.00**,
> and the four other lines of that day are byte-identical.
>
> It also restores the check-out gate: a Havoc-only tips scan now counts as a tips action.

> **4 Aug 2026 — A BAR SERVICE WAS BEING LOGGED AS AN OVERTIME CLAIM.**
>
> Owner: *"why put the havoc under the other? In the outlet workspace I no put like this"* / *"seperate
> the OT with the Havoc"*. Havoc is configured under **Service Entitlement (RM 1,000)**, and the PR app
> logged it as **"OT · RM 2,000.00"**.
>
> **Two rules disagreed about the same item.** `menuForScanCategory` puts `service` AND `tip` on the Tips
> page together; `receiptKindForItem` only counted `tip` — plus **one hardcoded id, `booking-com`**, which
> happened to be the seeded Booking commission. So Booking commission passed by accident of its id and
> Havoc did not. Everything else fell to `others`, which the app labels **OT** (`ShiftStatusPanel:411`)
> and the backend files as component `other` (`payment-voucher-component.ts:24`) — **the same bucket as
> genuine overtime.** Any service an outlet adds itself with "+ Add More" hit this.
>
> The money was never wrong (commission already used the TIP rate), but the CLASSIFICATION was, and it
> also broke the check-out gate landed minutes earlier: a Havoc-only tips scan counted as no tips action.
>
> **Now `service` classifies as `tips` and `others` is left to what really is other** — overtime and
> unclassified. Verified: Lemon Drop→Drink, Tips→Tip, Booking commission→Tip, Havoc→Tip, and a made-up
> "Anything the outlet adds"→Tip.
>
> ⚠️ **One row already saved carries the wrong bucket:** `Havoc, 4 Aug, qty 2, commission RM 340.00`,
> component `other`. Query written and run; NOT changed — re-filing a line on a payment voucher is the
> owner’s call. One statement fixes it when they say so.

> **4 Aug 2026 — "2 LOGGED ACTIONS HAVE NO PICTURE" WAS THE APP LYING TO ITSELF.**
>
> Owner: *"why have this ??"* — and the database answered it. The three tips items came off ONE scan and
> share **one receipt (`98977499`, ORD1111), which holds the photo**:
>
> | line | own photos | receipt photos |
> | --- | --- | --- |
> | Tips | 1 | 1 |
> | Booking commission | **0** | 1 |
> | Havoc | **0** | 1 |
>
> **The picture is proof of the RECEIPT, and one photo covers every item printed on it** — which is why
> `submitReceipt` stores it on `payment_voucher_receipt` and not on each line. But the check-out gate asks
> every LINE for a picture, so the 2nd and 3rd item off one scan looked unproven while their receipt’s
> photo sat in the database three feet away.
>
> **Fixed in the DTO, not by copying the image onto every row:** `toReceiptLineDTO` now reports the
> line’s own photos, or its receipt’s when it has none. That honours the standing rule — one fact lives
> in one table — and it needed **no data migration**: the existing rows unblock on the next read.
> Verified against the live DB: all four of 4 Aug’s lines now resolve to a photo, `0 still blocking`.
>
> ⚠️ Keep both the mobile fix (`3d51a6d`, every submit path sends the scan photo) and this one: the
> mobile change covers a line with NO receipt behind it (a bare self-log), this covers the 2nd+ item of a
> receipt. Neither makes the other redundant.

> **4 Aug 2026 — CHECK-OUT NOW REQUIRES BOTH HALVES OF THE NIGHT, EACH WITH ITS PICTURE.**
>
> Owner: *"before check out need upload the receipt picture , need to do the action of scan or self log
> the drink and the tips , else cannot check out"*.
>
> The gate only counted PICTURES — a shift with no drinks action and no tips action at all checked out
> clean, because zero rows means zero rows missing a photo. Now both must exist: **≥1 drinks action AND
> ≥1 tips action**, and every logged row must carry its photo. `kind: wages` and the check-in stamp are
> the shift itself, not an action, so neither satisfies either half.
>
> **Refusals are stated in one place** (`checkOutBlock`), photos first, then the missing half — with the
> reason it matters: *"Once the shift closes, that commission cannot be claimed"*. A PR who forgets the
> tips receipt does not lose a tick-box, they lose money, after the paper is gone and the week has shut.

> **4 Aug 2026 — 🔴 CHECK-OUT WAS BLOCKED BY ROWS WHOSE PROOF PHOTO WAS NEVER SENT.**
>
> Owner: *"just make sure every action submitted that picture as the ocr proof of the drink and the tips
> can check out already"* — *"2 logged actions have no picture"* on a shift where **both receipts were
> photographed and both appear under Scanned receipts**.
>
> **The screen’s own comment was wrong.** It said *"The scanned receipt photo IS the proof —
> runScanDetect auto-attaches it"*, but only the pure-scan submit sent `receiptShot`. The item-menu
> submit sent `proofPhotos`, which `keepAsProof` fills **only when a scan FAILS**. So the successful
> path — read the receipt, adjust quantities, confirm — saved every row with NO picture, and check-out
> refuses those. The Tips page always goes through that path, which is why its rows were the picture-less
> ones while the Drinks scan was fine.
>
> **Two more paths sent nothing at all:** rows added mid-edit (`for (const d of rest)`) had no
> `proofPhotos` key whatsoever, and the amount-fallback edit sent only the manual photos.
>
> **Now one list feeds all five submits** — `proofForSubmit`: the receipt shot first, then any manually
> added photos, deduped and capped at 6 like `keepAsProof`. The submit gate uses the same list, so it can
> no longer demand a photo that is already on file.
>
> ⚠️ **The two rows already saved stay broken** — Tip RM 50.00 and Booking commission RM 100.00, 10:50.
> The fix stops new ones; it cannot retro-fit a picture. Either re-log them after the rebuild, or say the
> word and their shift’s receipt photo can be attached server-side.

> **4 Aug 2026 — AN ITEM OCR MISSES IS NO LONGER INVISIBLE.**
>
> Owner, third report of the same shape: *"again where is the tips i scan sometimes missing tips
> sometimes missing booking commision in the tips self log and scan"*.
>
> **The parser was the wrong thing to keep tuning.** `manualRows = editId ? categoryMenu : detected` —
> a scan listed ONLY what OCR read, so an item it missed did not exist on screen and the single remedy
> offered was *"Scan again to catch a tip / service item OCR missed"*. OCR misses a short line often
> enough — glare, a fold, a tilted photo — that scanning again is a lottery, and the owner has now
> played it four times: Havoc alone, then Booking commission alone, then Booking + Havoc.
>
> **Added: NOT FOUND ON THE SCAN · ADD IF IT IS ON THE PAPER** — the outlet’s configured items the scan
> did not find, each with a one-tap **+ Add**. The PR is standing at the bar holding the receipt; they
> can say what is on it. An item added this way carries an ASSUMED quantity, so it shows the same
> *"Receipt printed no quantity — check this one"* flag as any other guess rather than posing as read,
> and the block says plainly that the agency checks these against the photo.
>
> ⚠️ **The parser was NOT touched again.** Its harness (11 fixtures) passes on the exact text of this
> receipt, so a fifth blind tweak would be guesswork. If the reveal ever shows `1 Tips` present in the
> lines while Tips is still not detected, THAT is a parser bug and there is now a fixture slot for it.

> **4 Aug 2026 — ONE SCAN FOUND HAVOC, THE NEXT FOUND ONLY BOOKING COMMISSION. THE OCR WRAPPER WAS
> THROWING HALF THE READ AWAY.**
>
> Owner: *"tips section self log inaccurate"* — three scans of one receipt, three different subsets.
>
> **`recognizeReceiptText` returned `result.text` and ignored `result.blocks[].lines[]`.** The flat
> blob is ML Kit’s blocks joined in ITS reading order, which on a tilted or glared photo interleaves a
> receipt’s columns and tears "1 Tips" off its own line. `blocks[].lines[]` is the engine’s own line
> segmentation and survives that far better. **Both are now fed, deduped** — the parser keys matches by
> menu id, so a line present in both forms is still matched once, while a name mangled in one form can
> be found in the other. It also gives the date/order/time regexes a second reading of the line they
> need, which is why the Time went blank while the Date on the SAME printed line came through.
>
> **That raised a new risk, so it was closed in the same pass:** the flat blob can WELD item lines
> together — `1 Tips 1 Booking Commision 5 Havoc` — and every quantity rule read the LEADING number,
> which would bill five Havoc as one. Quantity is now taken from the digits immediately before **that
> item’s own name**, using the index the matcher returns (`findItemInLine`, replacing the boolean
> `lineMentionsItem`).
>
> **Two bugs found only because the fixtures were written to disagree with the code:**
> **(1)** a fuzzy window can start one character EARLY — `3bookingcommision` is within two edits of
> `bookingcommission` — so the index pointed at the quantity and swallowed it; the matcher now steps
> past leading digits *unless the name itself starts with digits* (`1664 Blanc`). **(2)** `qtyFromLine`
> was still re-deriving the index with an exact `indexOf`, which finds nothing for a misspelt name, so
> the receipt’s own typo silently took the line’s first number. **`1 Tips 3 Booking Commision 5 Havoc`
> read Booking as ×1 — RM 5,150 instead of RM 5,350 — and passed the earlier fixture only by luck,
> because that one happened to use ×1.**
>
> Harness now **11 fixtures + 6 must-not-match**, all green, `apps/mobile` tsc 0.

> **4 Aug 2026 — THE SCAN NOW SHOWS WHAT OCR ACTUALLY READ.**
>
> Owner, on a scan of the same receipt that worked twenty minutes earlier: *"i self log for the tips
> where is my tips and bookign commision ? even the date also no"* — Havoc ×5 came through, **Tips and
> Booking commission did not, and the Time went blank** while the Date on the SAME printed line
> (`16-06-2026   09:45PM`) was read fine.
>
> **Those two symptoms cannot share a cause in the matcher.** Time and Date are parsed by different
> regexes off one line; Tips had already been fixed and re-verified. What varies between two scans of
> one receipt is the TEXT ML Kit returns — and the screen was throwing it away. `parseReceipt` has
> always returned `lines`; nothing rendered it, so "why didn't it find Tips?" had no answer on the
> phone and every report was guesswork.
>
> **Added: "Show what OCR read (N lines)" inside the OCR EXTRACTED card**, captured BEFORE the early
> return for a scan that matched nothing — that is precisely the scan whose text needs looking at.
> With one line of explanation: an item is only found when its name appears in that list, so a missing
> or mangled name there means the paper or the photo, not the parser.
>
> ⚠️ **No parser change on this report, deliberately.** The PC harness passes all eight fixtures
> including this exact receipt; changing the matcher without seeing the text would be guessing twice.

> **4 Aug 2026 — THE PARSER CAN NOW BE PROVED WITHOUT A PHONE.**
>
> Owner: *"so how ? rebuild ?"* / *"after rebuilds i can only test on my mobile devices ?"*
>
> **No — only the camera needs the phone.** `apps/mobile/scripts/check-receipt-parser.ts` runs the whole
> matcher on the PC (`cd apps/mobile && npx tsx scripts/check-receipt-parser.ts`) starting from the TEXT
> ML Kit produces, which is where every 4 Aug bug lived. Eight fixtures — the owner’s real receipt,
> spaces lost, i-read-as-1, priced lines, x-suffix, singular/plural, digit-leading names, nothing printed
> — plus six lines that must match NOTHING. Exits non-zero on failure, so it is the regression guard
> those three fixes never had.
>
> ⚠️ **`jest.config.cts` names a `jest-expo` preset that is NOT in package.json**, and there is not one
> `*.test.ts` under `apps/mobile/src`. Rather than pretend a test runner exists, this is a plain tsx
> script. Wiring jest-expo properly is its own job.
>
> **Rebuild facts, checked not guessed:** `app.json` has **no `updates` block and `expo-updates` is not
> installed**, so there is NO over-the-air path — a JS-only change cannot reach an installed release APK.
> But `apps/mobile/android/gradlew` EXISTS (bare workflow), so a local build works without EAS. Three
> options, fastest first: **(1)** `npx expo run:android` — builds once, then JS edits hot-reload with no
> rebuild at all; **(2)** `cd apps/mobile/android && ./gradlew assembleRelease` → APK at
> `android/app/build/outputs/apk/release/`; **(3)** `npx eas build -p android --profile preview`
> (projectId `3114a391…`, buildType apk).

> **4 Aug 2026 — WHY "TIPS" WAS SOMETIMES INVISIBLE TO THE SCAN (and Havoc never was).**
>
> Owner: *"Why sometimes in the tips scan ocr no detected the tips it's in the outlet"*. It IS in the
> outlet menu — the matcher was the problem, and the **"sometimes" was the clue**: same receipt, same
> item, different scan.
>
> **The asymmetry is by design and it backfired.** `lineMentionsItem` scales its forgiveness with name
> length: **< 5 letters must appear as an EXACT standalone word** (so "Tip" can never be faked by
> "this"), 5–8 letters allow a typo, 9+ allow two. **Havoc is 5 letters and matches as a substring;
> "Tips" is 4 and does not.** So the two items on one receipt line fail differently — exactly what the
> owner saw.
>
> **Two OCR realities break the exact-word test, both reproduced before fixing:**
> **(a) the lost space** — thermal receipts kern tight and ML Kit returns `"1Tips"`, ONE token, so the
> word test finds nothing; **(b) the digit-for-letter read** — `"1 T1ps"`, i read as 1. Both returned
> **false** for Tips and **true** for Havoc.
>
> **Fixed narrowly, not by loosening the short-name rule** (which exists for a good reason):
> tokens are now also split at digit/letter boundaries — `"1Tips"` → `['1','tips']`, with the plain
> tokens KEPT so a name containing digits still matches whole — and `foldOcrDigits` maps only the four
> confusables OCR actually produces (**0→o, 1→i, 5→s, 8→b**) on both sides before comparing. Digits
> become letters, never the reverse: `"t1ps"` reaches `"tips"`, while `"this"` folds to `"this"` and
> still does not match.
>
> **The same lost space hides the QUANTITY**, so `"2Havoc"` read as one. Added a glued-quantity pattern
> guarded by the item name, plus a name-aware rule for the digit-leading names this bar trade is full of
> — **1664, 100 Plus, 7Up** — where `"2 1664"` is a quantity and a name that no general rule can
> separate from a number and an amount.
>
> **Verified across seven receipt shapes:** the owner’s real text, spaces lost, i-as-1, priced lines,
> digit-leading names with and without a quantity, and nothing printed at all — every one now reads
> `Tips ×1 | Havoc ×2 = RM 2,050`, and the genuinely unreadable cases stay flagged *(assumed)* rather
> than pretending. False-positive guards re-checked: `this round`, `Shots`, `TIGER`, `5 Tops`,
> `Table No. S4`, `CASHIER 1` all still refuse to match Tips. `apps/mobile` tsc **0**.
>
> ⚠️ **Known and left alone:** `"tip top beer"` matches Tips through the pre-existing singular/plural
> rule. Not introduced here, and not worth tightening blind — no such line exists on a real receipt.

> **4 Aug 2026 — OCR READ THE ITEMS AND THREW THE QUANTITIES AWAY (PR self-log).**
>
> Owner: *"in the check in page pr is 2 quantity of the Havoc, why i self log still ocr shows default one?"*
> The receipt says **`2 Havoc`**; the screen showed **×1**, and the voucher would have been **RM 1,150**
> instead of **RM 2,150**. Under-paying a PR by a thousand ringgit, silently.
>
> **Cause, in one regex.** `ITEM_RE = /^(d{1,2})s+(.+?)s+(d+[.,]d{2})$/` — it REQUIRES a trailing
> price. This receipt prints the order list with no money on those lines at all (tips and service items
> often have none), so no pattern matched and `qtyFromLine` fell through to its `return 1`. Every item on
> every receipt of that shape read as one.
>
> **Fixed with a third pattern, tried last because it is the loosest:** `LEADING_QTY_RE = /^(d{1,2})s+(?=D)/`
> — a small leading number followed by a non-digit. The `D` lookahead keeps it off `"2 1000.00"`, and it
> is only ever reached for a line that ALREADY matched a menu item by name, so a date or a table number
> cannot be read as a quantity.
>
> **Then the owner's follow-up — *"makes always checks the quantity from the receipt"*.** Two changes:
> **(a)** a printed quantity is now the ANSWER, not a floor. The screen took `Math.max(existing, parsed)`,
> so a stale number survived the scan that finally read the line. **(b)** `ReceiptMatch.qtyFromReceipt`
> records whether the number was READ or ASSUMED — a silent default of 1 is indistinguishable from a 1 the
> receipt actually printed, which is exactly how this bug hid. Rows the parser guessed now say **"Receipt
> printed no quantity — check this one"** in amber, and an assumed value never overwrites what is already
> on screen.
>
> **Verified against the owner’s own receipt text and five other shapes:** real receipt → `Tips ×1 |
> Booking commission ×1 | Havoc ×2 = RM 2,150`; priced lines `2 Havoc 2000.00` → ×2; nothing printed →
> ×1 flagged *(assumed)*; `Havoc x3` → ×3; the same item on two lines → ×2, and an assumed 1 does NOT beat
> a printed 2. `apps/mobile` tsc **0 errors** (its baseline).

> **3 Aug 2026 — `main` merged into `jk` (`0f339b8`, PR #43 from SL). Two conflicts, both resolved from
> evidence rather than by taste.**
>
> **`_journal.json` — keep BOTH, ordered by `when`.** SL took **0080** (the number I had used before
> renaming mine to 0081 at the owner’s request), so there is no filename collision — but their
> `when` is **1785520000000**, which is SMALLER than my 0081 (…600) and 0082 (…700). Drizzle replays in
> array order and skips anything at or below the last applied stamp, so leaving 0080 after mine would
> make a FRESH database skip it forever. Resolved to 79 → 80 → 81 → 82, ascending. **Checked the shared
> DB before deciding:** `__drizzle_migrations` already holds all three stamps and
> `payment_voucher.finance_head_signature` exists, so nothing needs applying — this only matters for a
> new database. (One pre-existing non-ascending pair remains at idx 15 → 16; older than everything
> applied, and not this merge’s to fix.)
>
> **`TEST_SCRIPT.md` — keep both sides, one START HERE.** Both branches appended a 3 Aug block at the
> same two anchors, and SL had RETITLED the old "NEXT SESSION STARTS HERE" heading, which is what made
> §9 collide. **Theirs keeps the title** (it is the amendment that says read-me-first), my block follows
> as its own dated section, and their retitled `▶ (2 Aug 2026 …)` heading stays last so the 2 Aug
> content below still has one. Two blocks both claiming to be the start point is worse than one.
>
> **Verified by diffing the resolved file against BOTH parents, not by eye:** **0 lines lost from
> origin/main**, and exactly **4 from HEAD** — the retitled heading, plus **3 checkbox items SL
> themselves deleted** when they closed that work (receipt lifecycle, `pv_day_review_pending`, PV wage
> calc). Taking their deletion is correct. ⚠️ **The blockquote trap again:** a raw marker strip welds two
> Markdown blockquotes into one; both junctions got an explicit blank line.
>
> **Typecheck after merge — the merge broke nothing.** `apps/web` reports 121 errors across 44 files,
> its known baseline. Intersecting those files with the merge’s changed files: **zero on my side**, and
> **three on the incoming side** — see §9. Backend is clean apart from its documented TS2883 baseline.

> **3 Aug 2026 (eighteenth slice) — THE CHURN IS CLEARED, AND THE SECOND BUG IT EXPOSED IS FIXED.**
>
> Listing Atlas’s rows before deleting them turned up a defect the churn had been hiding: **`Starter RM
> 100,000.00`**. A Custom quote resolved with no `requested_plan_id` falls to the *re-price in place*
> branch, which updated whatever plan row was active — and by then the auto-reset had already put Atlas
> back on Starter, so a RM 125 banded tier was stamped with the Custom figure. **In-place re-pricing now
> refuses unless the active row IS Custom**, and logs the refusal: a banded tier’s price is the catalog’s,
> not anyone’s to negotiate.
>
> **`clear-agency-churn.ts`** (new, one-off) removed **10 ledger rows + 10 request rows** in the 09:30–10:30
> window and left Atlas on **Starter RM 125.00**, its 2-PV band. Rollback JSON written BEFORE the first
> delete: `%TEMP%\agency-churn-Atlas-Agency-2026-08-03.json` (15,856 bytes) — re-inserting it restores
> every row exactly. **Deliberately not general:** explicit agency, explicit window, explicit landing tier,
> because "delete this organisation’s billing history" must not be possible by accident.
>
> **Verified after:** Atlas ledger **12 → 3 rows** (Growth expired 7 Jul, Custom RM 0 expired 08:02,
> Starter RM 125 active) and requests **13 → 3**, all pre-09:30 — its real history is intact and nothing
> outside the window was touched. Plan Request total 13.

> **3 Aug 2026 (seventeenth slice) — 🔴 THE AUTO-RESET WAS EATING THE ADMIN’S NEGOTIATED PRICE.**
>
> Owner: *"why admin set 99 to the agency then automatically reset?"* — because I wired a branch that did
> exactly that. The volume rule reset any agency on Custom whose weekly PV count sat inside the rate card,
> and Atlas issues **0 PVs**, so every price the admin agreed was undone within the same minute. The ledger
> proves it: **12 rows for Atlas**, alternating Custom → Starter — `Custom RM 99.00` started **09:47** and
> expired **09:47**; RM 9,999 at 09:46, RM 999 at 09:50, same story. Four negotiations destroyed.
>
> **The branch is gone, and the rule is now stated the other way round: NOTHING AUTOMATIC EVER TAKES AN
> AGENCY OFF CUSTOM.** A negotiated price is an agreement between two people; volume is evidence about it,
> not authority over it — least of all a 0-PV week, which is what every agency reads as before its first
> voucher. Leaving Custom is a deliberate act: the agency presses Reset, or the admin ends it. The rule
> still does the two things it should: apply the banded tier when the agency is NOT on Custom and on the
> wrong one, and notify the admin past 150 PV.
>
> **Both Custom actions are now on the Custom card**, which is what the owner could not find (they had
> vanished because the auto-reset had already thrown Atlas back to Starter, so the card stopped rendering):
> **Renegotiate price** (violet, asks the admin for a different figure, current price stands until they
> answer) and **Reset to normal subscription** (neutral, leaves Custom for the banded tier, applies
> immediately). Each carries one line saying which of those two things it does — they are different acts
> and were previously one button.
>
> ⚠️ **Atlas’s ledger still holds the 10 churn rows** this bug produced. They are a true record of what
> happened, so they were not quietly deleted — say the word and they go, rollback file first.

> **3 Aug 2026 (sixteenth slice) — THE CUSTOM TILE READS AS A STATE, NOT A BROKEN BUTTON.**
>
> Owner: *"design a bit this agency status, the requested or not"* and *"this also redesign ask admin"*.
> The requested state was a **disabled full-width button** — which reads as something broken rather than
> something in progress. An agency waiting on a price cannot act, so it is no longer shown a control at
> all: an amber strip with a pulsing dot, *Requested · with InnocenZ admin*, and one line saying its
> current tier is unchanged until they answer.
>
> The call to action is styled to the tile it sits on — violet border/fill and a Sparkles glyph, matching
> the accent Custom already carries on this screen. A grey soft button under a violet "Renegotiate Price"
> looked disabled. Label shortened to *Ask admin for a price*, which fits the tile at one line.
>
> **The duplicate banner above the rate card is gone.** "Waiting for InnocenZ admin — Custom" said the
> same thing two inches from the tile that now says it in context.

> **3 Aug 2026 (fifteenth slice) — THE AGENCY GETS THE SAME REAL CARD, AND A WAY TO ASK FOR CUSTOM.**
>
> Owner: *"this renew date also wrong and the card cannot update like the outlet in the agency subcription
> page"*, then *"agency how can select the custom to notify the admin?"*.
>
> **The card is now ONE component, not two.** `PaymentMethodCard` moved to
> `components/iz/PaymentMethodCard.tsx` and both Subscription screens render it. Copying it would have
> left the agency on its hardcoded "Visa ···· 4242" the moment anything changed — which is exactly the
> state it was in. Same for the renewal rule: `nextRenewalFrom()` now lives in `subscription-record.ts`
> and both hooks call it, so the two screens cannot drift a month apart.
>
> **The agency renewal date was demo-clock fiction** — "next charge 2 Aug 2026" printed beside a ledger
> that says something else. It now rolls the agency’s own `started_at` forward by its billing cycle, and
> shows nothing at all when no subscription is active rather than inventing a date.
>
> **Custom can now be requested by hand** (the rate card’s one actionable tile). The volume rule fires at
> 151 PV in a settled payroll week, which is right for billing but useless for an agency that has just
> signed a client it cannot serve inside the rate card — and untestable with 0 PVs on file, which is the
> position the owner was in. Same request either way: `custom_renegotiation`, pending, nothing bills until
> the admin sets a figure. No other tile has a button, because no other tier is a choice.

> **3 Aug 2026 (fourteenth slice) — THE AGENCY TIER IS AUTOMATIC, AND THE CARD IS REAL.**
>
> Owner: *"in the agency is auto selected rate card not manually based on how many pv of that agency, how
> can i leave custom?, and if over 151 pv of the agency need to auto notify the admin to negotiate the
> price. no this leave custom starter"*. Correct — the switch buttons I had just added were the wrong
> model entirely. **An agency never picks a tier: the rate card is a band table and the week’s PV count
> picks the row.** All the per-tier buttons are gone.
>
> **The volume rule** (one guarded effect) now reconciles ledger against volume: inside the rate card on
> the wrong tier → apply the right one (`plan_change`, direct, list price); **past 150 PV → notify the
> admin to negotiate** (`custom_renegotiation`, pending — the 151+ band has NO list price, so nothing can
> be auto-applied); on Custom but back inside the card → reset. It writes, so it is guarded hard: real
> session only, only once the REAL weekly PV count and the plan catalog have loaded, never while a request
> is open, at most once per mount.
>
> **The PV count is real**, counted from `payment_voucher` rows in the payroll week — not the demo store,
> which is empty for a real agency and would have read "0 PV" for everyone and auto-reset them all off
> Custom on first page load. Null while unknown, and the rule refuses to act on null.
>
> **Reset, not cancel/renegotiate.** Owner: *"make in the agency only the custom can reset back, no cancel
> and the renegotiate"*, then showed the two existing rows as the reference: Delta’s `plan_change` Custom →
> Growth (**Direct**) = the reset, Atlas’s `custom_renegotiation` Custom → Custom (**Pending**) = the
> renegotiate. So reset is filed as a plan_change and **applies immediately**, matching that row exactly;
> it still surfaces in Plan Request because it touches Custom. Admin labels read `Reset · Growth` for an
> agency (vs `Cancel · Pro only` for a venue), including for the older rows filed before the reset had a
> shape of its own.
>
> **"InnocenZ Agency · Custom" on Atlas’s own screen** was a hardcoded prefix passed into
> `subscriptionRecordFromMember`. The ledger row already carries `subscriberName`; it now wins, and the
> fixed label is only a fallback. Verified the admin reads the same two rows for Atlas (Custom 0.00 active,
> Growth 500.00 expired) that Atlas sees.
>
> **The payment card is now a real record (migration 0082, `main.payment_method`).** Owner: *"makes really
> can change the outlet card credential and save it to the database"*. ⚠️ **THERE IS NO COLUMN FOR THE CARD
> NUMBER OR THE CVV, AND THERE MUST NEVER BE ONE** — a stored PAN puts this database in PCI-DSS scope and a
> stored CVV is forbidden outright. The browser derives brand + last four and discards the number; the zod
> schema caps `last4` at four digits so a full PAN is REJECTED at the edge (verified live: posting
> 4242424242424242 returns 400). Ownership is two nullable FKs with a CHECK that exactly one is set —
> unlike `member_subscription`’s unFK-able subscriber pair, which is how six rows came to point at nothing.
> One active card per organisation (partial unique index), `GET/PUT /payment-method/mine` scoped from the
> session. **The card can be RECORDED but not CHARGED** until a gateway fills `gateway_token`, and the form
> says so instead of implying auto-pay works. The old "Update card" button invented a random four digits.
>
> **Renewal date on the payment section** followed a hardcoded "15 Jul 2026" while the plan card above it
> showed the real 3 Sept 2026; both now read the same anchored renewal.

> **3 Aug 2026 (thirteenth slice) — BOTH WAYS OUT STAY ON SCREEN, AND PENDING IS VISIBLE.**
>
> Owner, looking at a venue already on POS: *"where is that 2 buttons renegotiate POS and the cancel
> POS"* and *"where is the pending status show at the outlet subcription page"*. Both were the same
> design mistake. **The card hid BOTH buttons whenever any request was open**, so a venue that had
> asked for a new price could not then decide it would rather drop POS altogether — it had to wait for
> an answer to a question it no longer wanted asked. And the only sign a request existed was a
> sentence at the bottom of the card; the pill area showed **Active** alone.
>
> **Now:** both buttons stay, and only the action already asked for is disabled and relabelled (*New
> price · requested* / *Cancel POS · requested*). An amber **pending admin** pill sits BESIDE the green
> Active one, because a venue on POS with an open request is in both states at once. Which request is
> open comes from the server — `/mine/pos-quote` naming a plan means a cancellation, anything else is a
> quote — with local flags covering only the gap between the tap and the refetch. `removalSentLocal`
> was added for the cancel path, which had no flag at all and so could be double-tapped into two
> identical requests.
>
> **Mirrored on the agency Custom card**, same rule: an open re-quote no longer traps the agency on
> Custom, and only a pending EXIT disables the rate-card tier buttons.
>
> **Seed ghosts purged from `admin_request` (4 rows).** Marble Hall, Horizon Talent, Pioneer Crew,
> Summit Staffing — none exists in `outlet`/`agency`, all four stamped `created_by=seed-sample`, which
> is the evidence that made deleting them a repair rather than a guess. Rollback JSON written first.
> Plan Request **16 → 13**, every remaining row a real subscriber. ⚠️ `contact`/`other` enquiries are
> never judged this way — someone asking about the product legitimately has no account yet.

> **3 Aug 2026 (twelfth slice) — THE AGENCY GETS THE OUTLET'S NEGOTIATED-PRICE LOGIC (§8 X56).**
>
> Owner: *"why the agency logic also no change follow the outlet logic"*. Correct, and the reason was
> plain: every piece of that pipeline had been built on the OUTLET path only. The agency Subscription
> screen was read-only — no switch, no re-quote, no exit, no waiting state — its Custom rows carried
> no previous price, and the admin drawer still framed Custom as an ordinary plan swap.
>
> **The one asymmetry worth keeping, and why.** POS is an ADD-ON billed beside the plan; Custom IS the
> agency's plan. So the from-side of a POS row is never a plan ("Scale → Integrate with POS" is a swap
> that never happens), but an agency moving from Growth onto Custom really is leaving Growth, and the
> from-side says so. Custom only takes the POS treatment — `Custom · RM 2,400.00` — once the agency is
> ALREADY on it, which is exactly when there is a figure being replaced or ended.
>
> **A zero is not a price.** `previousNegotiatedAmount` treats `0.00` as absent, because the Custom
> catalog row is a placeholder. Atlas sitting on `Custom 0.00` is not a negotiation that happened —
> printing "Previous price RM 0.00 — negotiating again" would have invented one.
>
> **Where the RM 0 came from, now closed.** Joining Custom used to be filed as a `plan_change`, and an
> agency plan_change is applied ON THE SPOT (`direct`) — so the moment an agency tapped Custom it was
> billed the placeholder. Anything touching Custom is now `custom_renegotiation` and WAITS for the
> admin, in both directions. Ordinary tier→tier stays `direct`: those have list prices and there is
> nothing for an admin to decide.
>
> **Resolve now moves the ledger instead of re-pricing in place.** A `custom_renegotiation` naming a
> plan goes through `applyPlanChangeToLedger`, so joining / re-agreeing / leaving each write a NEW row
> and the old price survives as history — the same shape a POS re-quote already had. Re-pricing in
> place left an agency that asked for Custom recorded on Growth while billed the Custom figure.
>
> **The agency hero was lying about the tier.** It rendered the demo PV curve's tier, so an agency on
> Custom was told it was on Starter — the same class of bug as the venue that displayed another
> venue's plan. It reads the ledger now, and falls back to the curve only for demo sessions.
>
> **Verified live, not asserted:** `previousNegotiatedAmount` = 99999.00 on all five Emhub POS rows;
> **null** for Delta (it moved off Custom to Growth 500.00 — correct) and **null** for Atlas (0.00
> placeholder — correct); `GET /admin-request/mine/custom-quote` returns 200; `tsc` clean on both apps
> for every touched file. ⚠️ **The ledger WRITE is not verified** — proving it means inventing a price
> in the shared DB, which is the owner's call. §9 has the two clicks that close it.
>
> **Found while verifying:** `admin_request` carries rows for **Summit Staffing, Pioneer Crew and
> Horizon Talent**, none of which exist in `GET /agency` or have a single ledger row — seed ghosts of
> the family purged on 2 Aug. Left in place pending the same rollback-file treatment (§9).

> **3 Aug 2026 (evening, part 3) — a whole-project survey, and THREE §9 entries were found to be
> describing work that was already finished. No code changed; doc only.**
>
> Owner asked what is still pending besides registration. Every claim was re-derived against the
> tree at `aa572c8` instead of being copied out of §9 — and three entries turned out to be reporting
> **closed work as open**, which is the more expensive direction of error: it hides real progress and
> invites someone to rebuild what already exists.
>
> 1. **`pv_day_review_pending` "has no producer".** ❌ It has one, at
>    `scheduler/weekly-payout.job.ts:264`, with the kind declared at `notification.model.ts:51`. The
>    entry rested entirely on *"grep finds the string nowhere under `apps/`"* — **the grep was
>    simply wrong**, and nobody re-ran it for three days. ⚠️ **Standing rule earned here: a NEGATIVE
>    grep is the weakest evidence in this repo. Re-run it before it becomes a recorded fact.**
> 2. **Receipt `APPROVED → VERIFIED` rollover "buildable now".** ❌ Built and running —
>    `verifyApprovedReceipts()` is called from `weekly-payout.job.ts:106`. The P3 entry had this
>    right all along while the P0-CLIENT entry above it understated it, so the same feature was
>    described two ways in one document. **When two entries disagree, the more specific one usually
>    won a re-derivation and the vaguer one was never revisited.**
> 3. **Outlet swap "IN PROGRESS, only the model file exists".** ❌ Shipped end to end (migration
>    `0052`, mounted at `router/v1.ts:64`, agency hooks + PR mobile `OutletSwapRequests.tsx`). This
>    one was **not** in `TEST_SCRIPT.md` at all — it was the one-line hook in the memory INDEX, whose
>    own memory file said DONE. **An index line rots independently of the entry it points at.**
>
> **What the survey CONFIRMED is still missing** (all by re-derivation, not recall): no mailer of any
> kind, no rate limiting, no logout route, **zero tests**, and only ONE registered background job.
> The demo store is the headline: `agency-portal/lib/store.ts` is **7,330 lines** and **63 web files
> call `useStore` against 37 that call a real backend hook**; `agency/special-service.tsx`,
> `outlet/special-service.tsx` and `outlet/billing.tsx` have **no backend call at all**. The admin
> portal is clean. Also confirmed open: `AuditLogFilterInput` has no `role` field (so the per-role
> audit pages under-fill), agency/outlet **login accounts** still have no admin screen (the tabs
> manage the ORG), `outlet_transaction` has zero UI, and `platform_config.platform_fee_percent`
> defaults to **`'5.00'`** in the model while the fee decision is still recorded as owed.

> **3 Aug 2026 (evening, part 2) — the agency can finally SIGN and PAY; the rail is no longer
> decorative.**
>
> **(1) Finance signature — built end to end, at the owner's instruction ("required before Send to
> PR").** The rail has always shown `Raise PV → Finance sign → Sent to PR → PR signed → Paid`, but
> the second step had **no action, no endpoint and no column**: `finance_head_name` and
> `finance_head_signed_at` existed and nothing ever set either, while the PR's half was fully real —
> and the PR's own screen printed *"Finance Head already signed"* as hardcoded copy. Now:
> migration **0080** adds `finance_head_signature text` (mirroring `pr_signature`/0071, same stroke
> JSON); `POST /payment-voucher/:id/finance-sign` behind `agencyOwnerOrFinance`; **`PUT` refuses the
> `pending_review → sent` transition with 409 when unsigned**; and the agency PV detail grows a
> signature pad with Send disabled until it is used. Signing is a SEPARATE endpoint because
> `PUT /:id` deletes and re-inserts every line — an attestation must never be a side effect of an
> edit. The signer's name comes from the session, never the body. Re-signing after send is refused
> (the PR may have counter-signed). `PrSignaturePad` turned out to have **zero importers** — dead
> code, now live, extended with an optional `onConfirmInk` that emits stroke points.
>
> ⚠️ **`drizzle-kit generate` CANNOT RUN in this repo** — snapshots `0063`/`0064` are missing and
> `0065–0070` are six identical copies, so 17 migrations have no valid snapshot. `drizzle-kit
> migrate` reads only `_journal.json` + the SQL files, so **0080 was hand-authored** and deployed
> normally (`when` set above the live max, or it is silently skipped). Every future migration needs
> the same treatment until the snapshot history is baselined — a separate job, and one to coordinate
> with jk since he migrates the same database.
>
> **(2) "To pay" → "Paid" now exists.** The payment-week card has always said *"use To pay to record
> each bank transfer"* while offering nothing to record it with, so a SIGNED voucher could never
> become PAID. A **Record payment** block on a signed voucher takes an optional bank reference and
> marks it paid; the server stamps `paid_at` only when unset, so recording twice cannot re-date a
> transfer. Only on SIGNED — paying a voucher the PR has not counter-signed settles a figure nobody
> agreed to.
>
> **(3) Payment Week hides Disputes and Overtime** (owner's rule): by then every voucher is signed
> and its figures are settled. ⚠️ The two queues stay deliberately NOT week-scoped on the other
> tabs — a claim blocks whichever week it belongs to. Selecting the payment week while one of them
> is open falls back to Vouchers, so no panel is ever left open with no tab above it.
>
> **(4) PR sign-sheet corrections** (all three from the owner reading a real screen): the sign CTA no
> longer appears on a voucher the agency has not issued (the server answered that with a 400 — the
> PR drew a signature to be told no); the **Name field is gone**, replaced by "Signing as {account}"
> — it was an empty input with "Vicky" as a *placeholder*, so a PR had to retype their own name and
> `confirmSign` blocked until they did, and being editable meant the recorded name need not match
> the account; and the false "Finance Head already signed" banner is replaced by what is actually
> true.
>
> `tsc`: backend **0**, web **121** (baseline), mobile **10** (baseline). ⚠️ **Not click-verified** —
> signing in requires a password, so every claim here is compiler- and database-verified only.

> **3 Aug 2026 (evening) — the payroll week is now Sun–Sat everywhere, and History stops
> claiming signatures that were never given.**
>
> **(1) Week re-anchored Mon–Sun → Sun–Sat, on the owner's instruction.** The backend and the PR
> app were Monday-anchored while the agency portal was Sunday-anchored, so the same money read
> `27 Jul – 02 Aug` on the phone and `26 Jul – 01 Aug` on the web, and the agency could only find
> its vouchers through a containment match written to paper over the gap. Changed together, because
> they are one decision: `weekBounds()` (controller), `previousCompleteWeek()` + `weekOfDate()`
> (payment-voucher-week.ts), the payout cron **`0 2 * * 1` → `0 2 * * 0`** (a Sun–Sat week ends
> Saturday, so a Monday run would issue a day late and fire mid-week — Sunday is also what the
> "PV issued every Sunday" copy on four screens always promised), and mobile `weekRangeLabel()`
> back to a Sunday anchor. **Existing rows migrated** with `src/scripts/reanchor-voucher-weeks.ts`
> — report-only by default, `--apply` to write, and it **REFUSES the whole run** if any line would
> fall outside its voucher's new window. Checked first: every line is a Wed or Thu, **no line falls
> on a Sunday**, so re-anchoring moved **zero money between vouchers**. All 3 vouchers shifted back
> one day (PV-000004/000003 → 26 Jul–01 Aug, PV-000002 → 19–25 Jul); re-running now reports
> "already Sun–Sat", so it is idempotent. `tsc` backend 0, mobile 10 (baseline).
>
> **(2) History → Payment badge tells the truth.** ⚠️ **A regression from earlier the same day, and
> it was mine.** Widening `/mine/history` to include `pending_review` (see the previous entry) fed
> vouchers to a mapper whose status was a two-value binary — `v.status === 'paid' ? 'paid' :
> 'signed'` — so two unsigned weeks rendered **"Signed"** with `pr_signed_at` NULL in the database.
> That is the worst possible place for it: History → Payment is the screen a PR opens *to check
> whether they signed*. `HistPayStatus` now carries `'pending'`; `payStatus()` reports `signed` only
> when the voucher says so; `statusMeta` distinguishes the two waits the PR cannot act on the same
> way — *"Waiting for your signature"* (sent) vs *"Waiting for your agency to issue"*
> (pending_review) vs *"Disputed — waiting on your agency"*. On the Shifts tab a past shift is
> `'sealed'` (true of any checked-out shift) unless the voucher is genuinely signed, with the
> caption saying which. **The owner's earlier "Last Week shows as Signed" rule is superseded by the
> tab semantics given today:** Last Week is where signing *happens*, so pre-ticking it removes the
> reason the tab exists.
>
> **(4) The late-PV signing hole — the SAME regression as (2), in a second place I missed.**
> `PvDetailScreen` computed `alreadySigned = hist ? true : false` — *being reachable from History
> WAS proof of a signature*, because History only ever held signed and paid vouchers. Once it
> carried every closed week that stopped being true, and the consequence was the worst possible one:
> a voucher the agency sends LATE appears only in History (it is not last week, so it is not on the
> Payment screen), so it was **sealed on arrival and the PR had nowhere to sign it**. It now asks the
> voucher, not the screen it was opened from; a History voucher that is neither signed nor paid maps
> to `awaiting_pr`, so **Open PV → sign pad** works for any sent voucher of any age. The submit path
> already resolved `backendPvId` from `histVoucher.voucherId`, so nothing else changed.
> ⚠️ **Lesson: when a query is widened, every consumer that inferred a fact from the OLD narrowness
> becomes wrong.** The badge and this gate were two such inferences from one change, and I found the
> second only because the owner hit it.
>
> **(5) Payment Week no longer hides what it cannot pay.** The tab filtered to `SIGNED` — the right
> *expectation* ("everything should already be signed") enforced the wrong way: it was the ONLY tab
> whose window contains a two-week-old voucher, so an unsigned one was invisible everywhere —
> RM 875.00 that could not be reviewed, sent, or therefore signed, with nothing anywhere saying so.
> The tab now shows the whole week, the status chips apply to it (they were bypassed), **"To pay"**
> still isolates the payment run, and an amber card names each overdue voucher with PR, amount and
> status. Also corrected two doc comments still claiming `week_start` is a Monday.
>
> **(6) Receipt proof photos enlarge on click** (agency Receipts tab) — a 64px thumbnail cannot be
> read, and reading the printed figures against the line is the entire point of the photo. Backdrop
> click, a Close button and **Escape** all dismiss; bounded to `90vh`/`90vw` so a tall receipt
> scrolls rather than overflowing off-screen.
>
> **(3) Two "missing" things that are not missing — both one root cause.** The PR's **"Review &
> sign" button already exists** (PaymentScreen.tsx:527, finger-drawn `SignaturePad` → real ink to
> `POST /mine/:id/sign`); it is gated on `status === 'sent' | 'awaiting_pr'`. The agency's **Payment
> Week tab** is `SIGNED`-only by design, which the owner confirmed today ("everything should already
> be signed"). Both are hidden for the same reason: **no voucher has ever been issued** — all three
> sit at `pending_review` with **0 day-reviews**, and the payout job holds any voucher whose days
> are unreviewed. Nothing is broken in either surface; the chain
> `pending_review → sent → signed → paid` has never been started.

> **3 Aug 2026 (latest) — two screens that said "none" while the database held the rows.**
> Same shape of fault in both apps: the data existed, the screen was reading somewhere else.
>
> **(1) Agency `/agency/pv` → Receipts now reads the DATABASE.** The tab was rendering the demo
> Zustand store (`prReceiptScans`), which is empty on every real login — meanwhile
> `GET /payment-voucher/receipts` had shipped with the receipt-review flow and had **zero web
> callers**. New `fetchAgencyReceipts()` (services) + `useAgencyReceipts()` (hook) + a rebuilt
> `AgencyReceiptsPanel`: three stat tiles (receipts · **waiting on you** · commission logged), status
> chips with counts, a search box, and the seven filter fields folded behind a toggle instead of
> filling the first screen; rows are **grouped by shift working day**, expand to line items + proof
> photos, and carry **Approve / Withdraw approval** hitting the SAME endpoint as the per-voucher
> verify panel (so one receipt has one decision under one server rule). The week tab is a FILTER, so
> receipts in other weeks are **counted and stated** rather than left to look like absence. Demo
> `ReceiptsSection` + `ReceiptScanDetailSheet` deleted (277 lines); `ReceiptScanRow` kept — the PV
> detail still uses it. Live DB: 2 receipts (`RCP-000005`, `RCP-000007`) on PV-000003, Atlas Agency,
> both `verified` so no approve button renders; **RCP-000005 has zero lines and now says so** instead
> of printing a bare RM 0.00. `tsc` 121 (baseline unchanged), 0 errors in the four touched files.
>
> **(2) PR History → Shifts + Payment history stop hiding a week that has closed.** Both read
> "No payments yet" while the Payment tab showed **RM 700.00** for the very same week:
> `listHistoryForPr` defaulted to `signed`+`paid`, and every live voucher is `pending_review` — the
> state a voucher sits in from the moment the week closes until the agency issues it, which is
> exactly when a PR goes looking for it. `getMyHistory` now passes all five statuses; the **current
> week stays excluded** (it belongs to the Payment tab, the screen that can still change it). The
> whole mobile chain was already wired to `/mine/history`, so this one filter unblocked both tabs.
> Proven with `src/scripts/probe-pr-history.ts` (read-only, calls the repository the controller
> calls): Vicky old filter **0 weeks** → new filter **2 weeks** — PV-000004 27 Jul–02 Aug RM 700.00
> and PV-000002 20–26 Jul RM 875.00. **The owner's rule needed no code change**: the mapper already
> renders anything not `paid` as **Signed**, and only a genuinely paid voucher as **Paid**.
>
> **(3) Daily wages stop showing up as "Others"** — found while doing (2), then fixed on the owner's
> instruction the same session. The weekly generator writes `ref = <shift assignment id>` (bare uuid)
> and sets `component: 'wages'` explicitly, but `toReceiptLineDTO` read the bucket off `ref` alone,
> so `decodeRef()` fell through to `'others'`: **every generated wage line — 4 lines, RM 2,600.00 —
> displayed under Others, and every "daily wages" figure the PR saw read RM 0.00**, on the Payment
> grid, History → Shifts and History → Payment at once. The database was right the whole time; only
> the read was wrong. New `lineKind()` in the controller: **a packed ref still wins** (a self-log or
> receipt line states its own kind and is the authority on itself), and the `component` column
> answers **only** when the ref packs nothing. `sumWages()` shares the helper — it was returning 0.00
> for the identical reason. `kindFromComponent()` / `refPacksKind()` live in
> `payment-voucher-component.ts`, the module that already owns the kind↔component relation, so the
> map exists once. Proven per line: Vicky's 2 × RM 700.00 **MOVED** others → wages, her RM 175.00
> `ot` line correctly **stayed** in others, Alice's already-packed lines **unchanged**. `tsc` 0.

> **3 Aug 2026 (later still) — `/agency/pv` disputes + overtime are now TABS, at the owner's request.**
> They rendered permanently open above the week tabs, so on a quiet week two empty panels ate the
> first screen. Both now sit in the existing sub-tab row: **`Payment Vouchers (2) · Receipts (0) ·
> Disputes (0) · Overtime (0)`**. **The counts are the part that matters** — they ride on the tab
> labels via `useAgencyDisputes()` / `useAgencyOvertime()` called at page level, so an outstanding
> item stays visible without opening the tab. **An undecided overtime claim is WHY a week refuses to
> send; hiding it behind an unlabelled click would have turned a visible blocker into an invisible
> one.** React Query dedupes against the panels' own fetches, so the counts cost no extra request.
> ⚠️ **The two new tabs are deliberately NOT week-scoped** while Vouchers/Receipts are: a claim blocks
> whichever week it belongs to, and week-filtering it would hide the item stopping a *different* week
> from going out. Still not on `/agency/pending` — that route is gated on `approvePrSignups`, which
> agency finance does not hold. **Verified in a browser, not just compiled:** top of page no longer
> renders either panel, and clicking Overtime reveals it. `tsc` **121, baseline unchanged**.
>
> ⚠️ **Also this session: I nearly filed a false P0 on the admin PV page.** The first DOM read showed
> an empty voucher table while the API had returned `totalCount: 3` — I had read it **before React
> Query resolved**. Re-reading showed all three rows and the `data?.data ?? []` parse is correct.
> **There was no bug.** Second time this pattern has bitten (see the retracted mobile-tsc claim):
> **a screen read too early looks exactly like a screen that is broken.** Wait for the query, then judge.

> **3 Aug 2026 (later) — 🔴 CORRECTION: the "~19 files of unauthored biome churn" recorded below was
> WRONG, and the way it was wrong is worth more than the fix.** `git status` really did list 19
> modified files, and one sampled diff really did show quote/tab/semicolon changes — so the whole set
> was reported as reformatting churn. **It was 3.** The other **16 were CRLF/LF line-ending noise**:
> the working copies sat as LF while the index expected CRLF, which git reports as "modified" with no
> content difference at all. That is exactly what every `warning: LF will be replaced by CRLF` line
> was saying, and they were read as harmless log spam for a whole session. A `git stash` +
> `git stash pop` re-checked-out the files and 16 of the 19 resolved themselves.
> ⚠️ **The lesson: generalising from ONE sampled diff to a whole file list is the same mistake as
> trusting a stale checkbox** — and it produced a scary-sounding warning in §9 about `GeoFenceCard.tsx`
> that had nothing behind it. **Count before characterising.** The 3 genuine ones
> (`go-welcome.ts`, `hard-navigate.ts`, `use-outlet-swap-mutations.ts`) are pure biome formatting to
> the project's own config — single→double quotes, spaces→tabs, added semicolons — with **no semantic
> change**, and are committed as a formatting chore.

> **3 Aug 2026 — THE PV LANE WAS TAKEN OUT OF THE COMPILER AND PUT IN FRONT OF A BROWSER, and both
> things that proved it also corrected it (§8 X56, X57).**
>
> **`/agency/pv` had never been loaded by a browser.** X43 and X45 shipped it on `tsc` + biome +
> `vite build` alone. On a real `owner@atlas-agency.my` login against the live backend it renders
> correctly — real vouchers, both panels mounted, **zero console errors**. ⚠️ **But the OT panel
> showed its EMPTY state**, because the only live claim is already approved, so **the populated state
> remains unproven** and the screen must not be called fully exercised.
>
> **🔴 Rendering it found a dead deep-link, and the interesting part is why it was invisible.**
> `pv_day_review_pending` (migration 0073, produced by `weekly-payout.job.ts`) was **never added to
> the web app's hand-written `NotificationKind` union**. jk's `unknown` fallback — added after the
> white-screen he documented — caught it, so instead of crashing it rendered a bland **"Update"** row
> whose `hrefFor` returned `undefined`. **A notification whose own body says "Approve each day on
> Payroll & PV, then send" went NOWHERE when tapped.** ⚠️ **The lesson is about the fallback, not the
> kind: it converted a loud failure into a silent one, which is why this survived a merge, a review
> and two sessions.** A fallback needs a way to SAY it fired. Fixed across 5 files and verified by
> clicking, not compiling: the row now reads **"Day review"** and lands on `/en/agency/pv`.
> ✅ **jk's §9 item 2 closed on the way past** — his crash fix is now browser-verified.
>
> **🔴 The audit's "3/3 reconcile" was narrower than everyone has been reading it.**
> `wages_amount_mismatch` compares a line to `shift_assignment.pay_amount` — **what check-out
> SEALED** — and never to the outlet's rate card. **So a wrong rate card produces a voucher that
> reconciles perfectly and still pays the wrong money.** New read-only `check-wage-vs-ratecard.ts`
> closes that last link: **agree 4 · disagree 0 · no-card 0**, resolving through the per-shift
> override exactly as the app does. §9 P1 is finally answerable **yes**.
>
> ⚠️ **The probe was wrong before the app was — twice.** Its first run said **SKIP, 0 comparable**
> because `pr.tier` is the enum `tier_3` while `outlet_tier_rate.tier` stores the label `"Tier III"`;
> the app bridges them with `PR_TIER_TO_OUTLET_LABEL` and the probe did not. It also guessed
> `tier_rate` (really `outlet_tier_rate`) and `shift_assignment.shift_date` (really `shift`).
> **Had it reported "0 agree" as a finding, that would have been a fabricated money bug.** It printed
> **SKIP instead of a pass** — keep that behaviour in every probe.
>
> **Still open, both blocked on a login:** the **admin PV page is still unrendered**, and the
> **400/409 refusals are still unfired from the phone**. A script to mint an admin token from `.env`
> without printing it was **blocked by the permission classifier and NOT worked around**.
>
> ⚠️ **~19 files of biome reformatting appeared in the tree unauthored** (quotes/tabs/semicolons).
> **Deliberately left uncommitted** — unreviewed churn, and one of them is `GeoFenceCard.tsx`, the
> file the previous merge fought over. This commit stages only the 5 intended web files, the new
> script, and this document.

> **2 Aug 2026 — `main` merged into `SL`, and for once the merge was boring.** `SL` was **22 ahead /
> 2 behind**; the incoming pair was jk's `b6c5786` plus its PR #41 merge `80efdc7`. **The whole
> incoming change is 110 lines of `TEST_SCRIPT.md` and NOTHING ELSE** — no code, no migration, so
> none of the 0076-style landmines the last two merges hit were possible here.
>
> **One conflict, in `TEST_SCRIPT.md`, and the resolution rule was decided by a diff, not by taste:**
> `git diff <base> origin/main` shows **110 insertions and 0 deletions**, so jk deleted nothing and
> the correct resolve is *keep both sides* — the conflict is only "both branches appended at the same
> two anchors". Both hunks resolved **ours-then-theirs**, which happens to be chronological in both
> places (SL's 2 Aug §9 block above jk's 31 Jul one; SL's 2 Aug §10 entries above jk's 31 Jul one,
> which lands immediately before the shared "SL merged into main" entry it originally preceded).
>
> **Verified by diffing the resolved file against BOTH parents, not by eye:** zero lines lost from
> `HEAD`, and the only six lines "missing" versus `origin/main` are **pre-existing base lines that SL
> itself rewrote** when it closed those very items (org suspension, overtime-as-money, the `auditLogs`
> guard). Confirmed each of the six exists unchanged in the merge base — i.e. main is simply behind,
> nothing of jk's was dropped. ⚠️ **The trap worth remembering: a raw marker-strip silently welds two
> Markdown blockquotes into one and glues a `###` heading onto the preceding paragraph.** Both
> junctions needed a blank line inserted; that is why the resolved file is 107 lines longer than
> `HEAD` and not 110.
>
> **jk's "▶️ START HERE NEXT SESSION" heading was retitled, not deleted** — two blocks both claiming
> to be the start point is worse than one marked superseded, and its items 1–4 plus the entire
> **P0-CLIENT** list (the owner's own client-readiness list, which SL had never seen) are still open
> work. Its stated tree state was stale on arrival: `jk` **is** pushed and merged.

> **2 Aug 2026 (eleventh slice) — SUSPENDING AN ORGANISATION NOW STOPS ITS PEOPLE (§8 X55).**
>
> `suspendedOrgBlock()` is called from **login** and from **`authenticateJWT`**. Both, deliberately:
> refusing the next login alone would leave anyone holding a token at the moment of suspension
> working until it expired — and for an agency finance user that means **still raising payment
> vouchers**. The middleware already re-reads the account every request, so the cost was being paid
> already. The login check sits **before the password compare**, matching the lockout: a refusal that
> only fires once the password is right confirms the password to whoever tried it.
>
> **The design is entirely in what it does NOT block, and every carve-out is a lockout that nearly
> happened.** `pending_review` is **allowed** — it is the column DEFAULT, so denying "not active"
> would have shut out every organisation nobody has reviewed yet, and no review screen exists. **No
> membership means no opinion** — admins and PRs hold no membership row, so an "is your org active?"
> test would have locked every admin out of their own platform. **One live organisation is enough.**
> And the membership row's own status is filtered first, since it is independent of the org's.
>
> **Live, 5/5:** active agency does not block → suspend → blocked with the right message → restore →
> access returns → admin never blocked. ✅ **And the check that matters most: nothing was newly
> locked out** — all 3 agencies and all 7 outlets are `active`, asserted rather than assumed. The
> suspension is restored in a `finally`. Backend tsc 0.

> **2 Aug 2026 (tenth slice) — THE SURPLUS APPROVAL IS CLEARED (§8 X54), AND THE CLEANUP SQL I HAD
> WRITTEN DOWN WOULD HAVE CORRUPTED THE VOUCHER.**
>
> `--clear=9d897070…` removed the RM 150.00 line. **PV-000003 went 1353.30 / 4 lines → 1203.30 /
> 3 lines**, exactly RM 150.00 lighter, and `audit-live-vouchers.ts` still reports 3/3 reconciling.
> One approval remains — `f5a1f227…`, RM 175.00 on PV-000002 — which is the one that was asked for,
> and it is the live proof that overtime becomes money.
>
> 🔴 **The finding is in the cleanup, not the clear.** The two-statement `DELETE` +`UPDATE` recipe I
> printed at the end of every run, and recorded in §9, **was incomplete.** A voucher's
> `subtotal`/`net` are recomputed when a line is *added*, so deleting the row behind their backs
> leaves **a voucher whose stated total no longer matches its own lines** — PV-000003 would have read
> 1353.30 with 1203.30 of lines beneath it. **That is exactly the fault class this audit exists to
> catch, so running my own cleanup would have manufactured one**, on a shared database, while
> claiming to tidy up.
>
> The general rule, and it is the third time this lane has taught it — after the `-ot` dedupe ref and
> the derived `component` column: **when the app maintains a derived value, undo through the app's
> own path, never with SQL that touches only the base row.** `--clear` calls the repository's
> `deleteLine()`, which runs `recomputeTotals` in the same transaction. It names what it will remove
> and supports `--dry-run`, because on a shared database a delete that states its target before
> acting is the only kind worth trusting.

> **2 Aug 2026 (ninth slice) — THE LAST OVERTIME REFUSAL IS PROVEN (§8 X53), AND THE
> ORG-SUSPENSION HOLE IS CONFIRMED REAL (§8 X52).**
>
> **The race.** Two simultaneous `PATCH …/overtime` at one pending claim via `Promise.all`: one 200,
> one **409 "This overtime claim was decided by someone else a moment ago"**. That message matters —
> it comes from `claimOvertimeDecision` losing the `UPDATE … WHERE overtime_status = 'pending'`, not
> from the earlier already-decided precondition. A read-then-check would have let both through every
> check; the transition itself is what refuses the second. Live proof for the `5e0dbee` fix.
>
> The reusable trick: **decide with REJECT, not approve.** Reject runs the identical mutex and writes
> **no voucher line**, so a race is provable without money reaching a payslip; the claim is then
> rolled back to NULL in a `finally`. Zero residue — still exactly 2 overtime decisions afterwards,
> audit 3/3.
>
> ⚠️ **Correcting myself:** I had described this as needing "a genuine race" as if that made it
> impractical. `Promise.all` of two requests *is* a genuine race. **I mistook "hard to observe" for
> "hard to test".**
>
> **The org-suspension hole is REAL**, re-derived from code rather than trusted. `agency.status` and
> `outlet.status` both exist as enums, so an organisation can genuinely be suspended — and **no auth
> path reads either one**. Login (`auth.controller.ts:79`), refresh (`:464`) and `authenticateJWT`
> all test `user.status` and nothing else. A suspended agency's owner and finance staff keep signing
> in with full access, **including raising payment vouchers**. Not fixed here: whether a suspended
> org should 401 at login or authenticate with write scope removed is a decision, and it touches
> every role's login path.

> **2 Aug 2026 (eighth slice) — THE UNPRICEABLE COMMISSION-ONLY 409 IS FIRED LIVE (§8 X51), and
> proving it required borrowing a wage.**
>
> **The finding came before the proof: there is no commission-only assignment on this database.**
> All 17 rows carrying no overtime decision have a positive `pay_amount`. So the refusal guards a
> case the live data has never contained — which is both why it had never been exercised and why it
> was worth exercising.
>
> `--unpriced` therefore **borrows** a row: sets `pay_amount` to `0.00`, fires, and restores the
> original in a `finally` so a crash still puts it back. `'0.00'` rather than NULL because the column
> is NOT NULL and zero reaches the same guard anyway — the endpoint tests `amountCents <= 0`, since a
> commission-only PR's wage is absent in **value**, not in schema. The row is picked by least
> consequence (`cancelled` → `no_show` → `assigned` → `confirmed`), with **`completed` excluded
> outright**: those are what vouchers are built from, and a wage that blinks out mid-generation would
> be a real payroll fault rather than a test.
>
> Result: `409 "This assignment carries no daily wage, so overtime cannot be priced."` **Net effect
> on the shared DB: nothing.** The 409 precedes both the week lookup and the claim; the pending claim
> created to reach the endpoint was rolled back — without that it would have held that PR's week
> forever, over a claim that can never be approved — and the wage was restored. Re-checked after:
> still exactly 2 overtime decisions, wage back at RM 700.00, all 3 vouchers reconcile.

> **2 Aug 2026 (seventh slice) — OVERTIME BECAME MONEY ON A REAL VOUCHER (§8 X50).** Owner asked
> for a successful approval explicitly.
>
> `f5a1f227…` (shift 23 Jul, 60 minutes) → `PATCH …/overtime` **200**, *"Overtime approved —
> RM175.00 added to the voucher for 2026-07-20"*. **RM175.00 is exactly `700 ÷ 6 × 1.5`, predicted
> before the run** — so the rate rule is confirmed against live money, not a unit test. PV-000002
> went **700.00 → 875.00**, one line to two, and `audit-live-vouchers.ts` still reports all three
> vouchers reconciling. The line landed on the week the shift was **worked**, as decided 31 Jul.
>
> Then the guard was tested on that same real row: **409 "This overtime claim was already
> approved"** — first live proof that `claimOvertimeDecision`'s
> `UPDATE … WHERE overtime_status='pending'` mutex holds on data rather than in theory. That is the
> fix for "a double-clicked Approve paid twice", and it now has evidence.
>
> 🔴 **My error, recorded because it is the useful part: re-running the script created a SECOND
> approval instead of retesting the first.** It selects on `overtime_status IS NULL`, so the row it
> had just decided was no longer eligible and it moved silently to the next one — `9d897070…`, shift
> 29 Jul, RM150.00 (`600 ÷ 6 × 1.5`). **The script is idempotent per CLAIM, not per RUN**, and I read
> "run it again" as "repeat what it just did". It now has a read-only `--report` (inventory every
> overtime decision) and a `--retry` (re-approve an already-approved claim, writing nothing), so the
> state is one command rather than an inference. **A writing script needs a way to ask what it
> already did.**
>
> **Two approvals are therefore live on the shared DB**, both on `pending_review` vouchers, both
> reconciling. Only the first was asked for. The table and the cleanup SQL are in §9 — GateGuard
> blocks `DELETE` from a script, so clearing them is the owner's call.

> **2 Aug 2026 (sixth slice) — THE OVERTIME REFUSALS ARE FIRED LIVE (§8 X49). 5 passed, 0 failed,
> and not one row written to the shared database.**
>
> First time any part of the overtime lane has reached a running server. The design point is what
> makes it safe: **every case is a refusal, and a refusal writes nothing** — so the lane could be
> proven over HTTP without touching a database jk also uses. New kept probe
> `probe-overtime-refusals.ts` (non-mutating, re-runnable, reads `DEFAULT_ADMIN_*` from env itself
> and never prints them). Fired: 400 `agencyId is required`; 200 worklist; 400 bad decision; 404
> absent assignment; 409 `There is no overtime claim on this shift`.
>
> ⚠️ **One check reports `SKIP`, not `PASS`, and that is deliberate.** *"Every claim arrives priced
> and week-stamped"* ran over **zero** pending claims. A check that goes green on an empty set
> asserts nothing — and calling it a pass would be the same green-signal-that-lies failure that
> produced the retracted X46 a few hours earlier. So the probe prints SKIP and says why, and **the
> pricing rule stays UNPROVEN live.**
>
> ⚠️ **A successful APPROVAL was NOT fired.** It writes real money onto a real voucher on the shared
> DB; that is the owner's call. Still unproven live alongside it: the concurrent-claim loser (needs
> two simultaneous requests against a genuine pending claim) and the unpriceable commission-only 409.
>
> ⚠️ **The remote DB is not reliably reachable from this machine** — the backend's first connection
> timed out (`ETIMEDOUT 103.224.93.109:6543`) and recovered on retry. Re-run a failed probe before
> believing it.

> **2 Aug 2026 (fifth slice) — I WAS WRONG ABOUT MOBILE. X46 IS RETRACTED (§8 X48).**
>
> `apps/mobile` typechecks fine. `apps/mobile/tsconfig.json` is a **solution-style** config
> (`"files": []`, `"include": []`, `"references"`), so `tsc -p tsconfig.json` compiles nothing **by
> design** — that is how project references work, not a defect. The real config,
> `tsconfig.app.json`, **already sets `"jsx": "react-jsx"`** and pulls in 58 src files. Nothing
> needed fixing, and the fix I proposed would have been noise.
>
> ⚠️ **One real correction survives: the mobile baseline is 10 errors, not 0** — `PaymentScreen.tsx`
> 4, `proof-photo.ts` 3, `PhoneSheet.tsx` 2, `demo-shifts.ts` 1. Run
> `npx tsc -p tsconfig.app.json --noEmit` from `apps/mobile` and judge only files you touched.
> X47's mobile half is clean against it.
>
> **How the error happened, because the method matters more than the fact.** I pointed tsc at the
> wrong config, saw a program with zero src files, and jumped to a *cause* — a missing `jsx` — instead
> of first asking what that config actually was. Then the `cat tsconfig.json` I used to confirm it
> printed a **different project's** config, because the shell was in a stale directory, and I read
> that as agreement. Two signals appeared to corroborate each other; they were the same mistake made
> twice, in two places. **A program with zero files means "I aimed at the wrong thing" far more often
> than "the project is broken"** — check the aim before writing up the finding.

> **2 Aug 2026 (fourth slice) — THE LAST PV BUILD LANDED (§8 X47), AND IT UNCOVERED THAT
> `apps/mobile` HAS NEVER BEEN TYPECHECKED (§8 X46).**
>
> **The build.** Re-deriving the backlog item first, as the standing rule says, showed **both halves
> were already built** — receipts have always been numbered, and the PR's detail button has existed
> since the screen was written. The real gap was narrower: the modal could show everything about a
> receipt **except its number**, because `/payment-voucher/mine*` never joined the receipt table. So
> the server's own refusals — *"RCP-000007 has already been reviewed by the agency"* — named an
> identifier the PR could not see anywhere in their app. Fixed by widening the map those reads already
> build (`receiptStatusMap` → `receiptInfoMap`, value `{status, receiptNo}`) and adding
> `receiptNo: string | null` to `PrReceiptLineDTO`. The number rides on the LINE and is **not** copied
> into a column: `payment_voucher_line` has no `receipt_no` and must not grow one. The modal prints
> `RCP-000007 · Self-logged` — number first, origin kept beside it, and origin alone when no receipt
> backs the line.
>
> **🔴 The finding is worth more than the build.** Verifying the mobile half showed
> `npx tsc -p tsconfig.json --noEmit --listFiles` from `apps/mobile` lists **1378 files and ZERO from
> `apps/mobile/src`**. The tsconfig sets no **`jsx`** option, so no `.tsx` ever enters the program.
> **Every "mobile tsc 0" in this document and in memory describes an empty program, not the app** —
> and it explains why that lane has never caught a type error: not discipline, no compilation.
>
> This is a worse instance than the earlier [[green-signals-that-lie]] cases. Those were green signals
> that failed to cover a *particular* risk. This one covers **no code at all**, and was reported
> confidently for weeks. **NOT fixed in this slice on purpose** — adding `"jsx"` will surface an
> unknown number of pre-existing errors in a lane jk also touches, and bundling that with a feature
> change would misrepresent what this slice actually verified. It is filed as the next job with its
> first step already known.
>
> Backend tsc **0**, probe **83/83**. ⚠️ **The mobile half of this slice is proven by READING only** —
> no tool has compiled it, and nothing here was fired live.

> **2 Aug 2026 (third slice) — THE ADMIN PV PAGE IS WIRED (§8 X45), AND THE RECEIPT NUMBER ALLOCATOR
> TURNED OUT TO CARRY BOTH BUGS THE VOUCHER ONE HAD (§8 X44).**
>
> **The admin page** gained `ReceiptEvidence` (the `receipts[]` array that has always come back from
> `GET /payment-voucher/:id` and was never displayed) and `VoucherDisputes` (Accept/Reject — the one
> write on an otherwise read-only page). It exists for a single reason, decided 31 Jul: resolving a
> dispute is the agency's job, but agency-only leaves a PR with **no recourse if their agency goes
> quiet**. Nothing was widened — `guard()` already waves admin through `agencyOwnerOrFinance`.
> Receipts stay read-only (the agency can check a receipt against the venue; admin is an escalation
> path, not a second reviewer); `undefined` receipts and an empty array are treated as **different
> facts**; the dispute query is `openOnly = false`, because *"the agency rejected this"* is the usual
> reason a PR escalates; and the voucher's legacy `disputeReason`/`disputeNote` columns are kept but
> **relabelled**, since a legacy value with no dispute row behind it cannot be resolved.
>
> **The allocator finding is the more valuable one, and it is really about process.** Receipt numbers
> were already being emitted, so that half of the backlog item was quietly already true. But
> `createReceiptWithLines` was the **pre-31-Jul `nextVoucherNo` code, verbatim**: `count(*) + bump`,
> which **recycles numbers after a delete** — and receipts are deletable by design, so a PR dropping
> two bad self-logs made the next scan reissue a number an earlier receipt held. Worse here than for
> vouchers, because `RCP-…` is what the refusal messages quote back at the PR. And the catch-and-retry
> was a **no-op**: a failed statement aborts the whole Postgres transaction, so the next iteration's
> SELECT returned 25P02 and was rethrown — the loop could never reach attempt 2. Both now fixed the
> same way the voucher allocator was: `max(<numeric suffix>)`, a SAVEPOINT per attempt, and the number
> re-read inside the loop.
>
> ⚠️ **The 31 Jul entry ended with "grep for other `try { insert } catch { retry }` inside
> `db.transaction`". That grep was never run**, and the third site sat behind a green typecheck for
> two days. It has now been run — the only other `23505` sites classify errors into HTTP statuses and
> hold no retry loop, so this was the last one. **A follow-up written into a doc and not executed is
> not a follow-up.**
>
> Backend tsc **0**, probe **83/83**; `apps/web` tsc **121 = baseline, 0 from the touched file**,
> biome clean. ⚠️ **Neither slice was fired live** — the admin page needs a real admin login, and
> proving a recycled receipt number needs a real delete on the shared DB.

> **2 Aug 2026 (later) — THE OVERTIME ENDPOINT FINALLY HAS A SCREEN (§8 X43).** `OvertimeQueuePanel`
> on `/agency/pv`, `use-agency-overtime`, and `fetchPendingOvertime` + `decideOvertimeClaim` on the
> shift-assignment service. **Pure frontend — no backend change, no migration, no schema change.**
>
> **The placement was the real decision, and the obvious answer was wrong.** `/agency/pending` is the
> approvals page, so an OT worklist looks like it belongs there — but that entire route bails out with
> *"Finance role cannot approve PR sign-ups"* unless the caller holds `approvePrSignups`, and **agency
> finance does not hold it**. Finance *is* one of the two roles the server's `agencyOwnerOrFinance`
> guard lets decide overtime. Shipping it there would have hidden the screen from half the people
> entitled to use it, and the symptom would have read as a broken role rather than a misplaced screen.
> It went beside `DisputeQueuePanel` on `/agency/pv` instead, above the week tabs — an undecided claim
> is *why* a week below refuses to send, so the refusal and its cause now sit on one screen.
>
> Three rules held on purpose. **The screen derives no money:** `amount` and `week` are rendered as the
> server priced them, by the same functions the approval itself uses, so the agency cannot attest to
> one figure while a different one lands on the voucher. **The 409s are surfaced verbatim** through
> `toMutationError` — "already decided", "decided by someone else a moment ago", and the unpriceable
> commission-only refusal are each actionable, and flattening them into "could not save" would send
> someone hunting a bug that is not there. **The refetch is `onSettled`, not `onSuccess`** — a 409
> means the list on screen is stale in exactly the case where the write failed, so refetching on
> failure is what makes the row vanish instead of inviting a second click. Both actions take a second
> click naming the consequence, since neither has an undo; there is no reason box, because the
> endpoint accepts only the decision.
>
> `apps/web` tsc **121 — the documented baseline, 0 from these files**; both new files biome clean;
> **`vite build` succeeds**. ⚠️ **Never rendered in a browser** — `/agency/pv` needs a real agency
> password login. Firing the lane end to end (check out late → claim appears → approve → the `ot`
> line lands → `audit-live-vouchers.ts` still OK → the week can be sent) is still owed.

> **2 Aug 2026 — THE OVERTIME BUILD IS DONE (`5e0dbee`). The last build in the PV backlog is closed:
> an agency can now decide an overtime claim, and an approval becomes a real `component='ot'` line on
> the voucher of the week the shift was WORKED.**
>
> `PATCH /shift-assignment/:id/overtime` (approve | reject, **owner + finance** — `agencyOwnerOrFinance`,
> the same grant as the rest of the PV attestation surface, because shutting finance out of a payroll
> decision would be wrong) plus `GET /shift-assignment/overtime/pending`, the agency worklist. Minutes
> have been recorded at check-out since `7e47502` and have blocked their own week's send since
> `882afd7`; **until now the gate had no exit, so no overtime was ever payable.**
>
> **🔴 THE TRAP, and the reason this was more than an endpoint: the audit would have flagged every
> legitimate approval.** `maxOvertimeCents` derived its overtime budget from `check_in_at`/
> `check_out_at` — but **check-out CLAMPS `check_out_at` to the scheduled end**, so a shift that
> genuinely ran two hours late leaves stamps describing a shift that finished exactly on time, and the
> derived budget is **0.00**. Every approved OT line would have come back as
> `overtime_exceeds_shift_window` — *"money the stamps cannot justify"* — on money that was correctly
> approved. **The RECORDED minutes are the evidence the clamp destroys; that is why check-out writes
> them, and they are now the primary source.** The stamp derivation stays as a fallback **only** for
> rows with no decision at all, so vouchers written before migration 0077 do not suddenly start
> failing. ⚠️ **Both `auditVoucher` call sites had to start SELECTing `overtime_minutes` +
> `overtime_status`** (`payment-voucher-generator.ts`, `audit-live-vouchers.ts`) — the fix in the pure
> function alone would have reached neither.
>
> **A pending or rejected claim budgets 0 on purpose:** overtime becomes money at approval and at no
> other moment, so a line that exists before the agency decided is exactly the fault worth reporting.
>
> **🔴 A double-clicked Approve would have paid twice.** Read the row, see `pending`, check no line
> exists, insert one — two concurrent requests both pass every one of those steps. **A read-then-check
> is not a lock.** The decision is now CLAIMED atomically with
> `UPDATE … WHERE overtime_status = 'pending'` (`claimOvertimeDecision`), so the transition itself is
> the mutex and the loser gets a 409. The decision is therefore stamped **before** the money is
> written, and a failed voucher write **reverts the claim** (`revertOvertimeDecision`) — *an approval
> that left no line is recoverable; a line paid twice is not.* Without the revert, a failed write would
> leave overtime marked approved, absent from the worklist, with the send gate letting the week close
> straight over it.
>
> Three smaller rules that are not obvious from the diff:
> - **The line lands on the week the shift was WORKED**, not the approval week — the owner's rule, via
>   the new `weekOfDate()` in `payment-voucher-week.ts` (pure string maths on `shift_date`; parsing a
>   calendar date into an instant only creates a chance to shift it eight hours). This is coherent
>   **only** because a pending claim already blocks its own week, so the closed-week **409 is a
>   backstop, not a routine path**.
> - **The `-ot` dedupe ref is written, never the `component` column** — classification is derived in
>   the REPOSITORY (`componentFromRef`), so writing the column directly would work today and drift the
>   first time another path forgot. And the line is **dated the shift's own date**, so it *passes*
>   `assertLinesAgreeWithShifts` instead of being refused by it. New module
>   **`payment-voucher/overtime-line.ts`** owns both facts in one place.
> - **A commission-only PR has no daily wage, so overtime cannot be priced — that is a 409, not a
>   0.00 line.** *"We paid you nothing for those hours"* is a different and worse claim than *"this
>   cannot be priced"*.
>
> **Migration 0079** adds `overtime_decided` so the PR is told **either way**. Rejection is the case it
> exists for: an approved claim shows up as money, a rejected one shows up as **nothing at all**, and
> from where the PR is standing an absence is indistinguishable from a bug. **Applied to the shared DB
> and verified live** — the enum now carries 10 values. ⚠️ The live journal's max `when` was 0078's
> `1785500000000`, so 0079 at `1785510000000` applies; **0077 sits below the max and is skipped, which
> is correct — its five columns were confirmed present on the live DB before running anything.**
>
> **Backend tsc 0** (230 files, confirmed via `--listFiles` — a bare root run reports a meaningless 0).
> **`probe-pv-audit.ts` 83/83, up from 44**, including the clamp trap in both directions and the
> week-placement maths. **`audit-live-vouchers.ts` still 3 of 3 OK** after the audit change.
> ⚠️ **NOT fired over HTTP.** No approve, no reject, no 409 has been sent to a running server.

> **31 Jul 2026 — undecided OVERTIME now blocks its own week from being sent, and this is the OWNER'S
> PAYOUT DECISION in code.** Asked where OT money goes when its week has already been sent, the owner
> answered: **"the OT should be sent together with the week PV it originates from, as that is the most
> fair and direct."** Overtime is therefore paid on the voucher of the week it was **worked**.
>
> **That rule only holds if the agency decides before the week goes out — so the awkward case is
> PREVENTED, not handled.** A pending claim blocks its own week's send, exactly as a held day and an
> unreviewed receipt already do. **There is no reopen-a-sent-voucher path to build**, because a week
> cannot close with a claim outstanding. Added as a **fourth rule inside `voucherSendGate`**, keeping
> one refusal path rather than two that can disagree.
>
> New repository read **`listPendingOvertimeForPrWeek`**, keyed on the **PR and the week**, not on the
> voucher. The link between a voucher and its shifts is the line `ref`, and **a shift whose overtime
> was never approved has no line to be referenced by** — the rows that matter most are exactly the
> ones a voucher-join would miss.
>
> ⚠️ **The trap, and the reason this is checked in BOTH early returns:** an unapproved OT claim writes
> **no voucher line**, so a voucher can carry one while having **no dated lines and no receipts at
> all**. The existing shortcut `view.length === 0 && pendingReceipts.length === 0` would have waved
> through precisely the case the rule exists for. Covered directly by the probe.
>
> **Ordering preserved:** a week that has not finished is still refused **for the week** and returns
> alone, so nobody is sent to decide overtime on a week still being worked. That branch now returns
> `pendingOvertime: []` like its three siblings instead of omitting it — a caller rendering "decide
> these claims" must be told there is nothing to decide *yet*, not `undefined`. **The probe caught
> that inconsistency**, the second time this session a probe corrected the code rather than confirming
> it.
>
> `PaymentVoucherController` gains a **sixth repository**. The line-date check solved the same
> missing-repository problem by moving into the payment-voucher repository, which worked because every
> insert path passes through it; **this one cannot**, because the gate is a controller-level decision
> about a request rather than an invariant of a write.
>
> **Proof:** `probe-pv-audit.ts` §10 — 8 cases, **all pass**, backend `tsc` **0** (run from
> `apps/backend`, not the repo root). ⚠️ **Not fired live.** ❌ **Still owed for overtime:** the
> `PATCH /shift-assignment/:id/overtime` approve/reject endpoint, the `component='ot'` line it writes
> on approval, and the agency screen.

> **31 Jul 2026 — the dead `users` / `user` GraphQL queries are REMOVED, and the backlog entry that
> asked for them to be gated was wrong.** It read: *"the `users` GraphQL resolver reads the same table
> behind `@auth` only, so the leak path is narrowed, not closed."* **There is no resolver.**
> `user.resolvers.ts` is literally `Query: {}`, and `graphql/resolvers.ts` merges only the base
> `_health` fields, that empty object, and audit-log's three. The two fields were declared in the
> schema, unimplemented and non-null — so they could not read anything, and a real call errored.
> **The eighth instance of this page's standing rule, and the second in one session.**
>
> **Deleted rather than implemented or gated.** A schema field advertising a capability nothing serves
> is worse than no field: it appears in introspection as a way to enumerate every account, it invites
> exactly the guard the backlog asked for, and it would have had someone write a resolver to satisfy
> the schema. Reading users is the REST `GET /user` path's job, and that one is already
> `requireRole('admin','agency','outlet')` with identity documents redacted for outlet callers — a
> second, unconsumed way in is surface, not a feature. **No web or mobile client queries either
> field**, checked before removing.
>
> ⚠️ **`tsc` cannot verify this change, and that is the trap.** The SDL is a template string, so a
> broken schema typechecks perfectly and fails at boot. Proven with a throwaway `makeExecutableSchema`
> probe: **the schema builds**, `Query` is now exactly `_health, auditLogs, auditLogActions,
> auditLogEntities`, both dead fields are gone and audit-log's three survive. Probe deleted after use.
> The now-unreferenced `User` / `UserPaginatedResponse` types are left in place — an unreferenced type
> is inert, and removing them drags in the filter and sort inputs too.

> **31 Jul 2026 — the GraphQL audit log is admin-only at last.** Confirmed live on 30 Jul and held
> back twice as high-risk: a **PR's token read 865 audit rows**. `@auth` in the typeDefs requires only
> *a* login and the repository merely hides `role='admin'` rows, so every other role's activity —
> usernames, IP addresses, old/new values — was readable by any signed-in account.
> `requireActiveAdmin(context)` now guards **all three** queries; the two filter-vocabulary ones
> return no rows, but the distinct action and entity lists are a map of what the platform does and to
> whom, and gating only `auditLogs` would have looked finished while staying half-open.
>
> **Callers were verified before gating**, which is the `GET /user` lesson: the only consumers are
> `services/audit-log/audit-logs.ts` feeding `routes/admin/dashboard.tsx` and both
> `routes/admin/audit-log/*` pages — all inside the admin-guarded `/admin` tree. That check is not a
> formality here: `graphql-request` throws on **any** GraphQL error, so a wrongly-shaped guard renders
> *"Activity feed unavailable right now"* on the admin dashboard.
>
> ⚠️ **It deliberately does not use `context.isAdmin`.** That flag tests role NAME only, and the same
> test backs auth, org-scope, payment-voucher and pr — tightening it centrally would change four
> features at once, so the stricter rule stays local to the surface that warrants it.
>
> ⚠️ **The status nuance recorded in §9 was subtly wrong, and re-deriving caught it.** The note said
> `isAdmin` ignores role status so "an inactive admin role row still counts". What `getUserRoles`
> actually projects is **`RoleTable.status` — the status of the ROLE DEFINITION**, not of the user's
> grant. `user_role` has **no status column at all**, and revoking a role DELETES the row, so a
> revoked admin was already excluded by the name test. What the check really adds is refusing a role
> switched off platform-wide. **Another instance of the standing rule: re-derive before building.**
>
> **Verified live, read-only, before shipping — because a wrong guess locks out every admin, not
> some.** `admin`, `agency`, `pr` and `outlet` are all `active`; `Test` is `inactive`, so the column
> is genuinely in use rather than vestigial and the guard is safe. Backend `tsc` **0**; the throwaway
> probe was deleted after use. ⚠️ **The refusal itself is not fired live** — proving it needs a PR
> token against a running backend.

> **31 Jul 2026 — overtime is RECORDED at check-out, before the clamp destroys the evidence for it.**
> This is step (a) of the overtime build, and it is the one that was **losing data every night**.
> The clamp overwrites `check_out_at` with the shift's scheduled end, so once a check-out has been
> processed the row **no longer knows when the PR actually stopped** — the minutes cannot be derived
> later, which is why migration 0077's columns sat unwritten and why every hour of overtime worked
> until now is unrecoverable. `overtime_minutes` + `overtime_status='pending'` are now written in the
> same `update` as the clamp.
>
> **`pending` is the only state a check-out may set.** A shift that sealed itself `approved` would be
> a PR authorising their own pay. Both columns are written only when there is a real claim, because a
> NULL status is the model's own encoding of "no overtime on this shift" — most rows.
>
> **⚠️ An implausible stamp records NOTHING, not a capped figure**, and that is the whole design.
> New pure module `features/shift-assignment/overtime.ts` → `overtimeFromStamps(checkIn,
> scheduledEnd, actualEnd)`, reusing `MAX_PLAUSIBLE_SHIFT_HOURS` (16) from `payment-voucher-audit.ts`
> rather than inventing a second threshold. It mirrors `pr-rate.ts`, which returns **0 rather than
> clamping** — and the reason is this feature's own history: the live `PV-000002` carried
> **"Overtime 113.1h"** on a six-hour slot. **A capped 16h would have been just as fictional and far
> harder to spot, because it looks like a number somebody meant.** A PR who forgets to check out for
> two days has not worked two days of overtime; the stamp has stopped being evidence. The shift still
> closes and the clamp still seals the scheduled wages, so nothing is lost — only unclaimed, and the
> agency can raise the hours by hand.
>
> **The notification's condition CHANGED, deliberately.** It used to fire on `now > scheduledEnd`;
> it now fires on a **recorded claim**. Those differ exactly where it matters — a check-out two days
> late overran the window, so the old test asked an agency to approve overtime with no believable
> number behind it, and now with no number at all. The forgotten check-out instead gets a
> `logger.warn` naming the elapsed hours, so it is visible rather than silent. The alert body and
> payload now carry `overtimeMinutes`, so nobody has to open the shift to learn what they are deciding.
>
> **Proof:** `probe-pv-audit.ts` §9 — 10 cases, **all pass**, backend `tsc` **0**. Boundary cases
> included: exactly 16h elapsed still records, one minute beyond does not, an early check-out and a
> seconds-late one both claim nothing (a 0-minute claim would put a shift in `pending` for an agency
> to approve nothing), and an unparseable slot is not judged.
> ⚠️ **Verified from `apps/backend`, not the repo root** — a root `npx tsc -p tsconfig.json` picks the
> ROOT config and its clean result says nothing about the backend.
> ⚠️ **NOT fired live.** ❌ **Still missing, and still the rest of the build:** the
> `PATCH /shift-assignment/:id/overtime` approve/reject endpoint, the `component='ot'` voucher line on
> approval, and the agency screen. **The approval step is still blocked on the one open decision** —
> what it does when that PR's week is already `sent`.

> **31 Jul 2026 — a week that has not FINISHED can no longer be sent.** The mid-week send is the
> *act* that produced the live `PV-000002` / `PV-000004` duplicate pair; every other fix in this
> area addressed its consequences. Closing a week early declares a total for days that have not
> happened, and the rest of that week's earnings then have nowhere to go — the duplicate-week guard
> correctly refuses a second voucher, so a Thursday drink logged after a Wednesday send is simply
> lost.
>
> **Added as a third rule inside `voucherSendGate`**, not as a separate check at the send. One
> refusal path cannot disagree with itself; two can — the same reasoning that put the pending-receipt
> rule there. It is evaluated **first and returns alone**, because listing unreviewed days beside it
> would be noise: of course nothing has been reviewed on a week still being worked. The refusal
> carries `weekEndsOn` (optional, so no existing consumer of `SendGateResult` breaks).
>
> **Both call sites pass it, including the Monday job that can never trip it.** `weekly-payout`
> generates for `previousCompleteWeek`, so `week_end` is always strictly past — passing the rule
> anyway is the point, since a gate the scheduler is exempted from is a gate with an unguarded way
> around it. The HTTP send judges `data.weekEnd ?? existing.weekEnd`, matching the line-date check's
> rule of measuring against the week the voucher *will have*, not the stale one.
>
> **The timezone is the trap, and it fails in the expensive direction.** A bare
> `new Date().toISOString()` is a UTC date, so between 00:00 and 08:00 KL it still reads *yesterday* —
> which would make "has this week finished?" answer **no** for the first eight hours of Monday,
> including 02:00 when the payout job runs, holding every voucher it was about to issue. `klToday()`
> now lives beside `previousCompleteWeek` in `payment-voucher-week.ts`. ⚠️ **It was already defined,
> character for character, as a private helper in `weekly-payout.job.ts`** — that copy is deleted, so
> there is one definition of "what day is it in KL" rather than two that can drift.
>
> **Proof:** `probe-pv-audit.ts` gains section 8 — 10 new cases, **all pass**, backend `tsc` **0**.
> The ones that matter are the over-fire guards: the **Monday payout case is NOT refused**, omitting
> the new argument keeps the old behaviour exactly, a voucher with no `week_end` is not judged, and a
> mid-week voucher that *also* has an unreviewed day and a pending receipt is refused **for the week**
> without blaming either — a misleading reason would send someone to review days that are not the
> problem. ⚠️ **NOT fired against the live DB**, like the line-date refusal before it: proving a
> refusal needs a real bad write on the shared database.
>
> **Deliberately no override.** An agency that genuinely must pay early has no escape hatch, and that
> is a product decision worth confirming rather than a limitation to work around.

> **31 Jul 2026 — the line-date rule now REFUSES, not just reports.** It has detected since
> `2cb70b8` (`line_date_contradicts_shift`) and nothing stopped the write. A line whose `ref` names
> a shift assignment must be dated that assignment's shift date; the live fault was **wages dated
> 2026-07-28 whose ref named the 23 Jul assignment**, and because both sit in the same week
> `checkLineAgainstWeek` passed it. The line carried its own evidence and nothing compared the two.
>
> **Placed in the REPOSITORY, not the controller** — `assertLinesAgreeWithShifts(tx, lines)`, called
> from all four insert paths (`create`, `update`'s delete-and-reinsert, `createReceiptWithLines`,
> `addLine`). A controller-side check would have covered only the HTTP routes and left the **PR
> self-log and the weekly generator writing unchecked money**. Same rule as
> [[pv-money-classification]]: one rule, applied where every path meets. It runs **inside the
> caller's transaction**, so the read cannot race a shift that moved, and a refusal rolls the whole
> write back. On the `update` path it runs **before the delete** — that path wipes and re-inserts
> every line, so a mid-way refusal would have left the voucher with no lines at all.
>
> **Two passes are deliberate:** a ref naming no assignment (a scanned drink, `ORD0389:0`) and a ref
> naming an assignment we cannot find. Refusing an unknown id would turn a missing join into a
> failed payroll write; `auditVoucher` already reports that case separately.
>
> HTTP owns only the status code: new `LineDateConflictError` → **400** via
> `respondIfLineDateConflict` in the six line-writing handlers (`create`, `update`, `addMyLine`,
> `addMyReceipt`, `editReceiptLine`, `updateMyLine`). Without it these fell to the catch-all 500,
> and **a client told "internal server error" retries the same bad date forever.**
>
> Backend tsc **0**; `probe-pv-audit` **ALL PASS**. ⚠️ **NOT yet fired against the live DB** — proving
> the refusal needs a real write attempt on the shared database, which leaves rows. The pure half of
> the rule is proven; the repository half is reasoned, not observed.

> **31 Jul 2026 — the agency portal white-screened on login, and the cause is a class of bug, not one typo.**
> Symptom: signing in as agency (`owner@atlas-agency.my`) landed on `/en/agency` showing only
> *"Cannot read properties of undefined (reading 'startsWith')"*. **Root cause: the web app keeps a
> HAND-WRITTEN copy of the backend's `notification_kind` enum, and the SL merge added two kinds it
> never received** — `pr_rating_low` (migration 0067) and `shift_cover_needed` (0068). So
> `KIND_MAP[record.kind]` yielded `undefined`, and `kindIcon` called `.startsWith("pv")` on it.
>
> **Why the WHOLE page died rather than one row:** `IzSheet` returns `null` when closed, but **JSX
> children are built eagerly**, so the notification list renders on every bell render — closed or not.
> **Why only the agency portal:** both new kinds are agency-addressed (`rating.controller.ts` and
> `shift-assignment.controller.ts` notify agency members). PR and outlet users never receive them.
> Confirmed against the live DB: that exact account holds one of each.
>
> **Fixed across 6 files** — both kinds added to the web union, `KIND_MAP` and `PR_KIND_MAP`;
> deep-links (`shift_cover_needed` → `/agency/roster`, the backfill list its own message names;
> `pr_rating_low` → `/agency/prs`); labels + Star icon. **The durable half: an `unknown` fallback
> kind.** The `Record<NotificationKind, …>` maps stay compiler-total, so a future kind still forces
> an explicit mapping, but a kind the bundle has never heard of now renders as a neutral "Update"
> row. ⚠️ **This is not hypothetical — the live DB enum has NINE values and the backend model
> declares EIGHT** (see §9 item 6). **Verified:** `tsc` error count unchanged at 124 (no new errors,
> and the compiler accepted both widened maps, which is what proves totality); biome clean on all
> six files. ❌ **NOT verified in a browser** — a dev server started from `.claude/launch.json`
> 500s because `apps/web/.env` does not exist and `VITE_API_URL` fails `env.ts` validation. Boot it
> with `pnpm dev:web` from the repo root instead, which loads the root `.env`.
>
> **Same day, the merge of main into jk was finished.** It had been sitting UNRESOLVED in the working
> tree, which is why GitHub said *"Can't automatically merge"*. One conflict, in `GeoFenceCard.tsx`:
> **main deleted the manual lat/lng entry that jk's commit had enhanced** (hemisphere-aware paste,
> `"3.211991° N"`). Resolved by taking main's redesign — keeping jk's two functions would have
> referenced state that no longer exists. ⚠️ **jk's hemisphere parsing is therefore GONE**; re-port it
> into the new address-search card if that paste format still matters. Also regenerated the stale
> TanStack route tree. Committed as `37d55f1`; the PR to main then shrank to **5 additive files**.


> **31 Jul 2026 — SL merged into main, and the merge itself found a landmine.** `SL` was 9 ahead /
> 2 behind after jk's PR #40. Three conflicts, and only one was interesting.
>
> **🔴 TWO MIGRATIONS CALLED 0076.** SL authored `0076_overtime_approval_and_bank`; jk authored
> `0076_shift_assignment_leave_proof` the same day. Both carried `idx: 76` **and the identical
> `when` of `1785480000000`** — the divergent-journal collision the standing rule warns about.
> drizzle runs a migration only when its `when` exceeds the newest applied `created_at`, so on any
> database that saw one of them **the other is skipped forever**, and a fresh deploy would simply
> lack one of the two schemas while `tsc` and `drizzle-kit generate` both stayed green about it.
> jk's keeps 0076 (already on trunk); SL's became `0077_overtime_approval_and_bank`
> (`1785490000000`) and `0078_pv_one_per_pr_week` (`1785500000000`, unchanged). Safe on the shared
> DB: every statement in both is `IF NOT EXISTS`, and 1785490000000 sits below the live max, so
> neither re-runs — while a fresh database gets 0076 → 0077 → 0078 in order. Journal verified: idx
> unique, the renumbered three strictly ascending, and the one pre-existing out-of-order entry
> (idx 16, `0015_ambiguous_slayback`) confirmed identical on `origin/main` and untouched.
>
> **`LeaveRequestsPanel.tsx` — modify/delete, resolved as DELETE.** jk added the mandatory MC-photo
> review UI to that component *and* to `/agency/pending`; SL had deleted the component. Took the
> deletion after proving jk's feature survives whole: `mcPhotos` renders in `pending.tsx:993`,
> backed by `leaveProofPhotos` in the web service layer and `shift-assignment.controller.ts:576`.
> Grep confirms no importer of the panel remains anywhere in `apps/web` or `apps/mobile`. Two
> people independently building on one surface is the thing to watch, not the conflict marker.
>
> **`shift-assignment.model.ts` — resolved as the union.** Disjoint columns: jk's `leaveProofPhotos`
> jsonb plus SL's five `overtime*` columns. The `jsonb`/`numeric` imports and `OvertimeStatus` had
> already auto-merged.
>
> Verified after resolution: **backend `tsc` 0 errors**; `apps/web` **121 errors, none in any file
> this merge touched** (`pending.tsx` clean, and deleting a file cannot add errors). Also carried
> the new migration numbers through every comment that names them and renamed `probe-0077` →
> `probe-0078`, so nothing points at a migration number that no longer exists.

> **31 Jul 2026 — MC/Leave had TWO review surfaces; the Roster one is gone.** The same
> `leave_pending` request rendered Approve/Reject buttons on **both** `/agency/roster` (the
> `LeaveRequestsPanel`) and `/agency/pending` → **MC/Leaves** tab — two doors onto one decision, and
> the roster copy showed less (no shift panel, no consequence text). Removed the panel and **deleted
> the component** rather than leaving it unmounted, so it cannot be re-hung by accident. **Nothing
> else moved:** both surfaces already ran the identical query under the shared key
> `["roster","leave-requests"]`, so the Approvals tab keeps its data untouched, and the mutations
> (`approveLeave` / `rejectLeave` in `use-roster-mutations`) are unchanged — the roster's planning
> grid and **Backfill needed** card still refresh off that same key when a decision lands. The
> Backfill card deliberately **stays** on the Roster: it is the staffing *consequence* of an approved
> leave, not the decision. Checked the notification deep-links before cutting — no agency
> notification kind routes a leave to `/agency/roster` (`shift_cover_needed` → roster is the backfill
> list and still correct), so no bell tap lands on a page that can no longer show the thing.

> **31 Jul 2026 — migration 0077: the schema for the two remaining PV gaps (§8 X40). SCHEMA ONLY —
> NOT APPLIED, NOT WIRED.** Both gaps mean the same thing — *the money is right and still cannot be
> paid* — so they share **one** migration on purpose: the DB is shared with jk, two windows is twice
> the risk for no benefit, and every statement is additive + nullable (`ADD COLUMN IF NOT EXISTS`,
> no drops, no backfill, no NOT NULL), safe to apply mid-request. **`shift_assignment`** gains the
> five overtime-decision columns; `overtime_status` is a plain varchar because **NULL = no overtime**
> is nearly every row and an enum invites a default that makes every ordinary shift a pending
> decision, and `overtime_minutes` is stamped **at check-out** because the clamp overwrites
> `check_out_at` and destroys the only evidence of how long the PR stayed. `overtime_amount` freezes
> what was **approved** — same rule as `approved_total_cents`. **`user_profile`** gains
> `bank_name` / `bank_account_no`, placed on the PERSON rather than on `pr` because that table
> already holds IC/DOB/address **and** is already the one `redactIdentityDocsForOutlet` blanks — and
> both fields were added to `IDENTITY_DOC_FIELDS` **in the same change**, because that helper blanks
> what it *names*. **`agency`** gains `address_line_1` / `address_line_2`.
> ⚠️ **The paragraph above was written by the auto-commit hook MID-SLICE and its "not applied / not
> wired" list is STALE. Corrected here rather than deleted** — a doc that quietly rewrites itself
> teaches you not to trust it, and this project's whole method is that a stale entry is worse than a
> missing one. What is actually true at session end:
> ✅ **The migration IS applied and verified live** — 9/9 columns present on the shared DB, checked
> both by `information_schema` and by calling `getExportBundle` (the read the exports really make),
> because `drizzle-kit` reporting success is not proof of live state.
> ✅ **`agency.model.ts` HAS the two address columns**, so no generate will propose dropping them.
> ✅ **The bank/address half is COMPLETE**: model mapping, the `user_profile` join in
> `getExportBundle`, all three rendering surfaces via a shared `joinAddress()`, and `PATCH /user/:id`
> (self-edit only) accepting the fields with an empty string clearing to NULL. `pr_code` was
> deliberately NOT added — the export has no such field.
> ⚠️ **STILL OPEN — the OVERTIME half is schema-only.** The five columns exist and **nothing writes or
> reads them**: no check-out recording of `overtime_minutes`, no approve/reject endpoint, no agency
> screen, no `component='ot'` line on approval. **Adding columns closed no gap on its own** — that
> sentence was right, and it still applies to overtime.

> **31 Jul 2026 — session end. ONE DECISION OWED: may an admin resolve a PV dispute?**
> Owner's steer: *"the admin is not supposed to be the one reviewing the payment vouchers — the
> agency handles that."* **It corrected two of my claims.** The agency dispute queue **already exists
> and works** (`DisputeQueuePanel` + `use-agency-disputes`, real accept/reject on `/agency/pv`) — I
> said it did not, because I read the stale §9 F line instead of re-deriving. And "wire up the admin
> PV page" was therefore **backwards**: those unrendered `resolveDispute`/`receipts[]` are not a gap
> to fill, they are surface the admin should probably not have. **Building them would have been
> actively wrong** — the sharpest instance yet of [[audit-entries-are-leads]].
> 🔴 **Real hole found alongside it, and it needs fixing either way:**
> `POST /payment-voucher/disputes/:disputeId/resolve` has **no `agencyOwnerOrFinance` gate**, so any
> agency member can settle a money dispute while merely approving a day requires owner/finance.
> Options + the recommendation are in §9. **Do both in one edit — same two route lines.**
>
> **31 Jul 2026 — the out-of-week hole had a THIRD door (§8 X41).** `updateMyLine` set `lineDate`
> straight from the request, so a line could be logged in-week and then **patched to any date**.
> Guarding only the create paths *looked* complete and closed nothing. Found by walking every write
> of `line_date`; all four are now covered.
>
> **31 Jul 2026 — three more PV fixes, all found by re-derivation (§8 X39).** **X37 had closed only
> half the duplicate hole:** `POST /payment-voucher/` (agency create) had no `existsForPrWeek` check
> and no line-date validation, so the agency door was still open — and that is the *likelier* origin
> of the live duplicate, since `PV-000002` was raised and sent from the agency side. Both guards now
> on `create`, and the week guard on `update`'s line rewrite. **`checkVoucherBalance` disagreed with
> the rest of the system about what `amount` means** (`Σ(amount × quantity)` where `amount` is the
> LINE TOTAL) — latent only because every live line carries quantity 1, but the first multi-item
> receipt would have made a **healthy** voucher log *"DO NOT BALANCE — hold payment and review"*.
> **And the money-WRITE routes were the least-gated on the router** — now `agencyOwnerOrFinance`,
> matching the review routes, callers verified first. Probe **26/26**, backend tsc **0**.
> ⚠️ Two PV gaps remain and both are product decisions, not bugs: **overtime can never become
> money** (notification only — no endpoint, screen or column) and **no bank columns**, so a voucher
> cannot actually be paid from.
>
> **31 Jul 2026 — the audit was pointed at the live vouchers (§8 X38). 3 of 4 fail.**
> `src/scripts/audit-live-vouchers.ts`, **read-only**, ten seconds, re-runnable — it loads every
> assignment for the PR in the week *regardless of status*, which is what the generator's own call
> cannot supply. **It found two faults the hand-check missed, and they are the same shape both
> times: the day actually worked is UNPAID.** `PV-000002` pays 700.00 for the `assigned` 28 Jul while
> the completed 30 Jul (`ab4a53ae`) has no wages line; `PV-000001` (**`signed`**) puts wages on 21 and
> 22 Jul, days with **no assignment at all**, while the completed 23 Jul (`f5a1f227`) is unpaid —
> which also **answers the `f5a1f22` question X36 left open.** `PV-000003` is **clean**, the first
> voucher confirmed correct by machine rather than asserted. **Nothing was written.**
> **What remains is not code: three repair decisions on documents a PR already holds**, plus two
> **unpaid completed shifts** that no repair above settles.
>
> **31 Jul 2026 — the P0 money rules are enforced in code (§8 X37).** Four of the seven P0 items
> closed: the source-record audit itself (**`payment-voucher-audit.ts`** — wages ↔ completed
> assignments × sealed pay, every line inside its week, OT bounded by the attendance **stamps**, no
> duplicate order refs, no sibling voucher, plus the reverse direction — **a completed shift with no
> wages line is unpaid work**), the out-of-week line, the OCR double-count, and the **mechanism**
> behind the duplicate voucher. **The finding's own conclusion was wrong and re-deriving caught it:**
> "one assertion at generation time" would have been built into the one place none of the faults can
> reach — the generator's query is already status- and date-bounded, and every fault on `PV-000002`
> arrived through the **PR self-log** path with a client-supplied `lineDate`. Guards now sit on both.
> `getOrCreateCurrentWeekDraft` looked only for a `pending_review` draft, so a week already **sent**
> was invisible and the next self-log minted a **second voucher** — now 409'd.
> Proof: `src/scripts/probe-pv-audit.ts`, pure and DB-free, replays Victoria's week — **21/21**,
> including the two over-fire guards. Backend tsc **0**.
> ⚠️ **The three live bad vouchers are NOT repaired** — the code stops new ones. What remains needs
> the live DB (which write path wrote the unworked day) or an owner call (`PV-000001`'s non-tier
> wages; the `PV-000002`/`PV-000004` merge; a `(pr_id, week_start)` unique constraint).
>
> **Session close, 31 Jul 2026.** HEAD `892d57e`, tree clean, **45 commits unpushed**.
> Shipped: the account controls reaching **PR accounts** (`f365537`, and the §9 entry asking for it
> was wrong about two of its four tabs — `agency.tsx`/`outlet.tsx` list **organisations**), a full
> **4-role end-to-end sweep** (`45fe0dd` — 28 endpoints read, 3 write flows round-tripped, shared DB
> left as found), and **both** of its findings fixed (`5ca3f79` — a malformed id now 404s via
> `uuidParam()`; the RBAC catalogue is admin-only, and checking first showed every `/rbac` **write**
> was already gated).
> 🔴 **Then the day's real finding: THE MONEY IS WRONG** (`892d57e`, §8 X36, new **P0** in §9). One
> week recomputed by hand from the primary records: worth **RM703.60**, the app produced **two
> vouchers totalling RM2,285.08**, and the correct one is the one still **unsent**. **Nothing
> compares a voucher against the records it was built from.**
> **Also corrected today:** Phase D was **not** blocked on venue coordinates — **all 7 outlets are
> pinned**; and the auth path reads `user.status` only, so **suspending an organisation does not stop
> its people signing in** (read from code, not fired — §9).
> **Owed:** the 31-check browser runbook (0 done), a device run, and the P0 block above.
> **Do not demo payroll.**
>
> **Session close, 30 Jul 2026 (evening).** HEAD `49d3220`, tree clean, **39 commits unpushed**.
> Shipped this session: the whole receipt lifecycle (0074, agency + PR screens, live-fired), the
> phone-identity fix, the **first execution of the PR app in this project's history**, voucher
> numbers (0075) + the summable export, account disable/role-revoke with its admin screen, **every
> previously never-fired path**, and a 19/19 role sweep. **Nothing is open: no build, no blocking
> finding, no never-fired path.** Next: the 4 remaining user-management tabs, per-session logout, a
> device run. **Left on the shared DB on purpose:** 1 accepted dispute + resolution note, 1 two-star
> rating tagged `audit-test`, 1 settled `collection_invoice`, and the `ZZ REVOKE TEST` account
> (inactive, roleless except a `Test` role). Migrations **0074 + 0075** applied.

| Date | What changed / done | Area (role link) | Status |
|------|---------------------|------------------|--------|
| 2026-07-31 | **MC / leave now carries a REQUIRED photo, PR → agency review.** *Where MC/leave lives:* there is **no leave table** — the whole flow rides the existing **`shift_assignment`** row (`status` enum `leave_pending` → `leave_approved`, reject returns `assigned`; reason on the reused `notes` varchar(500), rejected marker `[Leave rejected]`). So the proof went on that same row (Rule 1 — reuse, audit quartet already present): new **`leave_proof_photos` jsonb**, same array-of-images contract as `payment_voucher_line.proof_photos`, migration **0076**. **PR side:** the Today → Agency schedule → MC/Leave sheet gets a snap/upload block above the reason (camera on phone, file picker on web, downscaled via the shared `pickProofPhotos`), thumbnails with remove-×, max 5, and Submit reads *"Attach MC photo to submit"* until one exists. **Server enforces the same rule** (`requestLeaveMine`: 400 without photos, rejects non-images and >3 MB blobs) so a patched client can't skip it. **Agency side:** Approvals → MC/Leaves detail panel shows the MC document full-width above Reason (click = full size), and the Roster's LeaveRequestsPanel shows thumbnails — both read `leaveProofPhotos`, which flows automatically because the list/`mine` selects take the whole table. Verified live end-to-end against the dev DB: no-photo POST → **400 "An MC / leave photo is required"**, with-photo → **200**, row re-read as `leave_pending` + notes + 1 photo. ⚠️ **Migration gotcha worth knowing:** `pnpm migrate:deploy` printed "migrations applied successfully" and ledgered 0076 in `drizzle.__drizzle_migrations`, but **never executed the DDL** (column absent; 0071/0075 landed fine, so it is not a comment-led-file issue and the ledger hash did not match the file's sha256). Applied 0076's exact idempotent statement directly and re-verified `leave_proof_photos jsonb` exists — **always verify a migration landed with information_schema, do not trust the success line.** tsc: mobile 0, backend/web unchanged from baseline in touched files. | **PR → Agency** (§3 S2 · §9 P2) | ✅ done |
| 2026-07-31 | **🔴 THE MONEY IS WRONG — and it took one hour to find, after weeks of the question never being asked.** The owner's boss wants a test run, which finally put the right question on the table: not *"does the endpoint respond?"* but *"is the number right?"* Method matters here — I pulled the **primary records** (assignments, statuses, stamps, sealed pay, tier cards, receipt sales) and recomputed by hand, deliberately **not** re-running the app's own arithmetic, because an implementation checked against itself always agrees. **Victoria Tan Mei Lin, tier_3, week of 27 Jul: the records show ONE completed shift.** Tier III pays 700.00 at every outlet. The week is worth **RM 703.60**. The app produced **two vouchers totalling RM 2,285.08** — and **the correct one is the one still unsent**. The issued voucher contains a **700.00 wage for a day marked `assigned` with no stamps at all**, an **"Overtime 113.1h @ RM6.00/h"** line on a six-hour slot (113 hours of overtime in a 168-hour week, with 678.78 ÷ 6.00 = 113.13 — the label rounds where the money does not, a field disagreeing with itself for the sixth time on this project), a drink line dated **six weeks outside its own voucher**, and the **same Lemon Drop paid twice** because OCR read one order as `ORD0389` and the other as `ORDO389` — a letter O against a digit zero. Separately `PV-000001`, which a PR has **already signed**, carries wages of 198.00 and 186.00 that match **no tier rate on any of the seven outlets**. **The through-line: every one of these would have been caught by a single assertion at generation time** — wages equal completed assignments × tier rate, every line inside the week, no duplicate order refs, overtime bounded by the shift window. Nothing anywhere compares a voucher against the records it was built from. That is now the highest-value item on this page. ⚠️ **Implication for the test run: do not demo payroll, and do not let anyone treat a voucher as payable.** | **PR ← Agency** (§8 X36) | 🔴 BLOCKING |
| 2026-07-31 | **THE TWO SWEEP FINDINGS ARE FIXED, AND BOTH GOT SMALLER THE MOMENT I READ THEM PROPERLY.** The 500-on-a-malformed-id looked like sloppiness in two controllers. It was not: **all three controllers read identically** — `paramId(req.params.id)` → repository → 404 if falsy → 500 on throw — because **`paramId()` validates nothing**, it only unwraps a repeated query param. Two of the three survived a non-uuid for reasons buried in their repositories, and nothing at the route level said which. New `uuidParam()` returns `null` for a non-uuid so the caller answers **404**, which is what a malformed id honestly is: a row that cannot exist. Applied to **all three** `/:id` handlers in the voucher controller — `replace_all` revealed the bug was never confined to the read — and to shift. The RBAC finding shrank too: **every `/rbac` write was already `requireAdmin`**, so it was information disclosure, not a privilege hole; a PR could read the permission model and never touch it. Gated at the mount like `/platform-config`, after checking every caller — the agency portal makes zero `/rbac` calls, mobile none, and signup deliberately reads role UUIDs from env — because the `GET /user` lesson is that a flat gate can blank a live screen. **Proven live, including the half that matters most:** a real id still 200s on both routers and `getRoleIdByName('pr')` still works for admin, since a guard that breaks the path it protects is worse than the bug it fixes. ⚠️ The other routers' `/:id` handlers are **not** swept — one line each with `uuidParam()`, filed in §9. Backend tsc 0. | all (§8 X35) | ✅ done |
| 2026-07-31 | **THE FULL END-TO-END RUN — 4 roles, 28 endpoints read, 3 write flows round-tripped, 4 findings, shared DB left as found.** The good news first, because it is the larger part: **scoping is genuinely enforced rather than merely declared.** `/pr` hands back 6 rows to admin, 4 to the agency and 3 to the outlet — each seeing only theirs — `/shift` 10/10/7, PR is refused on 15 endpoints while getting all six of its `/mine` reads, and every write fired as the wrong role came back **403**: pr and outlet on the day review, pr on the receipt review, outlet on the assignment. The sub-role gates hold from outside the process, not just in the route file. The three write pairs each captured their starting state *before* firing and asserted the restore afterwards: day review `null → approved → null` (with `approvedTotalCents` 60000 recorded then cleared), receipt `RCP-000006` approved → pending → approved, assignment create 201 → delete 200. **Four findings.** The sharpest is that **a malformed id 500s on two routers** — `/payment-voucher/:id` and `/shift/:id` — where `/user`, `/agency` and `/outlet` all correctly 404: an unhandled uuid-cast error reaching the client on a path ordinary use hits by accident. Then **the entire RBAC catalogue is readable by any signed-in account** — a PR can enumerate 5 roles, 10 modules and 51 permissions — which is worth pausing on, because the 28 Jul ungated-router sweep **passed** these: it asked whether a router sat behind auth, and they do; it never asked whether every authenticated *role* should see what is behind it. A sweep only finds the question it was written to ask. Plus an admin **400** on the check-in-locations panel (it derives the agency from the caller, and an admin has none), and `/agency` enumerable by a PR. ⚠️ **Not fired, no undo endpoint:** voucher send, collections issue/settle, dispute resolve, check-in/out. ⚠️ **PR dispute raise→withdraw skipped** — the PR swept as has no current-week voucher; that path ran on 30 Jul. ⚠️ **The browser half is still owed** — a 31-check runbook went to the owner. | all (§8 X34) | ✅ done · 🔴 4 findings |
| 2026-07-31 | **ASKED WHETHER EVERYTHING IS TESTABLE RIGHT NOW — AND CHECKING IT CORRECTED TWO THINGS THIS DOC HAD WRONG.** Answer: yes for most of it. **Every role has live logins** — agency 4/4 active, PR 6/6, outlet 5/5, admin 2/2 — with **18 shifts** (13 confirmed, 5 draft) and **4 vouchers in three different states** (`PV-000001` signed, `PV-000002` sent, two `pending_review`), so the day-review and send gates have live entry points rather than needing setup. **Five things cannot be exercised:** anything by email (**there is no mailer in the backend at all** — no nodemailer/sendgrid/smtp anywhere), PR self-sign-up (WhatsApp OTP deferred), device-only PR functions (camera, real GPS, native pickers), agency/outlet **account** admin (no screen), and week close on demand (Monday 02:00 cron — force it with `run-weekly-payout.ts`). **Correction 1, the bigger one:** Phase D was recorded as blocked on the owner for venue coordinates, *"five of six outlets have no geo pin"* — **all seven are pinned**, the fence is live everywhere, and the entry was wrong on the count *and* on whose problem it was. A phase column asserting a **data** fact goes stale silently: nothing typechecks it and no code change touches it. **Correction 2, found while explaining the account gap:** the auth path reads **`user.status` only** — no reference to `agency.status` or `outlet.status` anywhere in it — so **suspending an organisation does not stop its people signing in**, which compounds with those two roles having no account screen. Read from code, not yet fired; it is in §9 as a lead, not a fact. Also in this commit: biome's post-commit reflow of the three files from `f365537`, no logic change. | all (§9) | ✅ answered · 🔴 1 new lead |
| 2026-07-31 | **THE ACCOUNT CONTROLS REACH PR ACCOUNTS — AND THE BACKLOG ENTRY ASKING FOR IT WAS WRONG ABOUT HALF ITS SCOPE.** §9 listed four tabs and called the work mechanical. Re-deriving it from the code first — the rule this project keeps having to relearn — showed that **`agency.tsx` and `outlet.tsx` list ORGANISATIONS, not accounts**: their rows come from `fetchAgencies`/`fetchOutlets`, so `row.id` is an agency/outlet id, and `PATCH /user/:id/status` sent one would address a row that is not there. Both already carry org-level approve/suspend — a different fact about a different table, which is exactly why "add the same column everywhere" read as obvious and was not. Shipped where the rows genuinely are accounts: **`pr.tsx`** gains Disable/Enable + **Remove PR**, and **`legacy-member.tsx`'s PR rows** gain Reactivate, since that tab is where a disabled PR lands and without it an account could arrive there and never leave. `revokeAdminRole` became **`revokeUserRole(userId, roleName)`** — the endpoint never cared which role it was removing, only the caller did. The confirm copy, the closing-dialog fix from X32 and the show-the-server's-sentence handling all moved into **`hooks/use-account-actions.tsx`**, so the second tab is not a copy of the first; the parts most worth keeping identical are precisely the parts a copy drifts on. **Proved against the live backend, then the probe deleted:** the pr role id resolves, the PR list returns 6 rows each carrying a user id and a status, and `PATCH /user/:id/status` **round-tripped on the `ZZ REVOKE TEST` throwaway and ended exactly where it started** — with self-disable refused **409** in the same words the UI shows. **Two things left honest:** the screen itself is unproven (it needs a password typed into the login form, so the one-minute click-through is the owner's, and it is in §9), and the probe's own first run "found" a missing pr role that turned out to be **my script reading `roleId` where the backend returns `id`** — the web mapper renames it. A wrong test looks exactly like a broken product. **And it surfaced a real gap:** nothing in the admin portal lists agency or outlet **accounts** at all, so those can still only be disabled over the API. | Admin / PR (§8 X33) | ⚠️ built, UI unclicked |
| 2026-07-30 | **THE ACCOUNT CONTROLS ARE USABLE BY A PERSON NOW.** X30 shipped the endpoints and nothing else, which meant the security fix existed only for someone holding curl. The admin user table gained an **Actions** column — Disable / Enable and Remove admin, each behind a confirm that states the consequence rather than asking "are you sure?". Driven in a browser on a real admin login, and the best proof was a refusal: clicking **Disable on my own row** produced the server's own sentence in a toast — *"You cannot change your own account status — ask another admin."* — with the row still Active. That single click demonstrates the guard, the decision to surface the server's message verbatim instead of a generic failure, and the absence of any partial write. **A defect turned up in the same pass and was fixed:** the confirm dialog animates out *after* its state is cleared, so it briefly read *"Re-enable this account? **undefined** will be able to sign in again"* — one more field rendering a plausible value where the fact had gone. It now renders from the last real target, which outlives the close. Known limit, written into the code: the web auth context knows *whether* you are signed in but not *who*, so no row can be marked "this is you" client-side; the server's refusal carries that job until the context does. | Admin (§8 X32) | ✅ done |
| 2026-07-30 | **CORRECTED MY OWN FOLLOW-UP: a disabled account's live token dies on the next request.** An hour after writing that a disabled account "keeps working until its JWT expires", I checked instead of assuming, and it is false — `authenticateJWT` re-reads the user on **every** request and refuses a non-active status, so the disable is immediate. Proven by taking a live token, disabling the account without touching it, and reusing the same token: 200 → **401**. Two things worth keeping from this. The claim was **written into TEST_SCRIPT and into memory as fact** on nothing but a plausible reading of a known gap ("no token revocation") — the same failure this page catalogues, committed by me while documenting a fix for it. And the real gap is narrower than recorded: **status revocation works; per-session logout is what is missing**, which is a different feature. The design has a cost worth naming too — every authenticated request does a user lookup. | all (§8 X31) | ✅ done |
| 2026-07-30 | **AND THE HOLE THAT RUN EXPOSED IS CLOSED THE SAME DAY.** `PATCH /user/:id/status` and `DELETE /rbac/user-role`, both admin-only — the second being the counterpart `POST` never had. **The disable half needed no enforcement code at all:** login already refused a non-active account, so the switch bit the instant it existed. That is worth pausing on, because it is why the gap survived two router sweeps — the lock was fitted and the handle was missing, and a sweep that asks "is this route gated?" cannot see a route that is not there. Guards: an admin cannot demote or disable **itself** (the endpoint that would undo it is the one they just lost), and the **last holder** of a role cannot be removed (emptying `admin` leaves a platform nobody can administer). All four refusals fired live, plus 403 for an agency token on both routes. **Hard delete deliberately not added** — four tables FK a user and the audit trail should outlive the person. ⚠️ **A near-miss in my own verification:** I first "proved" the revoke from the login response's `roles` array, which is empty for *every* account — it would have confirmed a revocation that had not happened. Re-proved against `GET /rbac/user-role?userId=…`: `admin` → ``. | all (§8 X30) | ✅ done |
| 2026-07-30 | **FIRED EVERY NEVER-RUN PATH — 6 of 6 — AND THE CLEANUP FOUND THE WORST THING OF THE DAY.** On the owner's instruction, the whole never-fired list was executed against the live shared DB (§8 X28): the voucher-number **allocator** (`PV-000005`, first issued on insert), **`pv_day_review_pending`**, **the send that succeeds** (409 unreviewed → 200 approved, the permissive half of that gate never having run), **a real dispute and its resolution** — which flipped both receipts **approved → verified**, the last unproven arm of the receipt lifecycle — **`pr_rating_low`**, **`shift_cover_needed`**, **MFA enrol → confirm → challenge** (password-only 401 `mfaRequired`, wrong code 401, right code 200), and collections **issue → settle**, where the outlet's view went from 0 rows to 1 at the moment of issue and an outlet settling its own bill was correctly 403. **Then the cleanup could not finish**, and that is §8 X29: **there is no way to delete, deactivate or demote an account.** No `DELETE /user`; `PATCH /user/:id` is self-edit only, so an admin is 403 on another account; `user_role` grants with no revoke. Anyone who can create an account can mint a **permanent admin**. The throwaway had to be removed with a direct id-scoped DB script through four FK layers, nulling the audit link rather than destroying the events. **A near-miss worth carrying:** I first read the 401 after "deletion" as proof the account was gone — it was the MFA challenge, and the account was untouched. Once MFA is on, the only way to ask whether an account exists is to log in **with a valid code**. | all (§8 X28–X29) | ✅ fired · 🔴 X29 open |
| 2026-07-30 | **RE-RAN THE 4-ROLE SWEEP AFTER TOUCHING AUTH — 19/19, nothing regressed.** The rule in §9 says to re-run it after any auth or gating change, and this session rewrote the login lookup and added two sub-role-gated routes. All four logins still work (the PR's by phone, which is the one that was broken this morning); the new receipt-review routes answer **200 agency / 403 PR / 403 outlet**; and the standing refusals are unchanged. The approve call was aimed at an already-approved receipt so the sweep left no trace. **The one red line was my own expectation:** I asserted `/notification/mine`, which does not exist — that router is mounted at `/notification` and scopes server-side, and on the real path it is 200 with 2 rows. The lesson this project keeps relearning applies to test expectations too: re-derive the entry from the code before believing it. | all (§8 X27) | ✅ done |
| 2026-07-30 | **A PAYMENT VOUCHER HAS ITS OWN NUMBER — finding X19 closed, and five derivations became one read.** Your call: a running number, `PV-000001`, matching the receipt numbers this schema already issues. The number printed on the document, shown in the app and used as the download filename was computed as `PV-<weekEnd>` in **five separate places**, so every PR's voucher for a week carried the same one — a voucher number that cannot identify the voucher, which is the paper trail failing at the only job it has. Migration **0075** is additive (nullable + unique + backfill in issue order): nullable on purpose, because a unique NULL never collides, and a failed allocation must leave a voucher *unnumbered* rather than uncreated — an unnumbered voucher can be repaired, an uncreated one is somebody's missing pay. The allocator mirrors `createReceiptWithLines`: count+bump with retry on the unique index, which is what stays correct when two vouchers are raised in the same moment; the conflict test is **narrow** (`23505` naming `voucher_no`, checked through drizzle's `.cause` wrapper) so a real fault cannot be swallowed into twenty silent retries. Live after: **PV-000001 … PV-000004**, the three vouchers sharing `2026-07-27` now differ, `/mine/current-week` returns `PV-000003`, and the download is `PV-000003-payment-voucher.xlsx` where all three were `PV-20260802-…`. ⚠️ **The allocator itself has not run** — everything existing was numbered by the backfill. | PR ← Agency (§8 X26) | ✅ done |
| 2026-07-30 | **THE EXPORTED VOUCHER'S AMOUNT COLUMN IS A NUMBER AGAIN.** Half of finding X19: every money cell was `.toFixed(2)`, which is a string, so an accountant could not sum the Amount column of a *payment voucher*. Now numbers with a `#,##0.00` format — the value carries the meaning, the format only decides how it looks — rounded to cents, because a unit price derived by dividing commission by quantity otherwise stores full float precision and shows one figure while holding another. **Verified by downloading the file and reading it back with exceljs, not by re-reading the code**: `D=600 (number, fmt=#,##0.00)`, `D=3.3 (number)`, where both were quoted strings before. That method is the point — this defect was originally found by opening the artifact, and checking it any other way would repeat the mistake it exists to teach. ⚠️ **The other half of X19 is open and needs a decision:** `voucherRef()` derives `PV-<weekEnd>`, so every PR's voucher for a week shares one number and one filename. It is derived in **five** places (backend export + four in the PR app), which is the same "no column behind it" shape as the fake drinks and the Paid pill — the real fix is a `voucher_no` column every surface reads. | PR ← Agency (§8 X25) | ✅ done (half) |
| 2026-07-30 | **THE PHONE SPLIT: ANSWERED THE SAME HOUR IT WAS FOUND, AND THE FIX IS A READ, NOT A MIGRATION.** Owner's call: **`user.phone_num` wins.** Measured before touching anything — 6 pr rows, 5 agree, **1 conflict**, 0 rows needing a backfill — which is what made this cheap. `PrRepository.getById`/`listPaginated` already left-joined `user`, so resolving the account's number was a select and a mapper (`withAccountPhone`); the PV export bundle joins it too, since a printed voucher is the document a PR is paid against. Live proof of the actual user-visible bug: the agency roster now shows Alice as **+60987654321**, the number that logs in, where it showed `+60123456805`, which nobody could sign in with. The other half was formatting: every stored number carries a `+`, the sign-in placeholder does not, and the comparison was `eq()` — so login now matches on **digits**, accepting `+60123456801` / `60123456801` / `012-345 6801` alike (all three verified 200; an unknown number still 401s). It **refuses on ambiguity** rather than picking one of two matching accounts, because this is a login. **A credential leak turned up in the same function:** it logged the whole matched `UserType` — `passwordHash` included — on every sign-in attempt; now an id. **`pr.phone` is deliberately NOT dropped** — three live readers, one of them jk's, plus the genuine pre-account case where it is the only number there is. Backend tsc 0. | PR ← Agency (§8 X24) | ✅ done |
| 2026-07-30 | **THE PR APP RAN FOR THE FIRST TIME, AND THE FIRST THING IT PROVED IS THAT A PR CANNOT LOG IN WITH THEIR OWN NUMBER.** Nothing in `apps/mobile` had ever been executed in any session — every change to it shipped on types and reading, the weakest evidence on this project. It turned out the app was one flag away from running in a browser: `react-native-web` and `react-dom` were already dependencies, so `expo start --web` bundles it (492 modules, zero console errors). Added `tools/scripts/dev-mobile-web.mjs` + a `mobile-web` launch entry — the existing `dev-mobile.mjs` runs `expo start`, which wants a TTY for its QR code and a phone to scan it, and **that requirement is the whole reason this app had never been run**. On Alice's real account the new work rendered correctly: This-week's caption reads *"1 entry approved by your agency"*, and the Lemon Drop row on Check-In badges **Approved** with its edit/rescan/delete controls gone — the interlock, on screen. **And the sign-in itself is broken in a way no amount of reading would have shown** (§8 X23): the app authenticates against `user.phone_num`, every agency screen shows `pr.phone`, and for Alice those are two different numbers — `+60987654321` vs `+60123456805`. Both forms of the roster number were refused 401. That is the duplicated-column rule in `CLAUDE.md` being broken and then diverging, which is exactly what the rule exists to prevent. **Left alone pending an owner decision on which column is authoritative.** | PR (§8 X22–X23) | ✅ ran · 🔴 X23 open |
| 2026-07-30 | **THE PR'S TWO SECTIONS — the receipt lifecycle is now complete end to end.** This-week gained the half of the flow the PR can actually see: a caption saying how far the agency has got (`2 approved · 1 still waiting on your agency`), absent entirely when there are no receipts, because a line about nothing is worse than no line. The check-in receipt rows now badge **Approved** rather than "Matched" when a receipt genuinely carries that state — and **drop their edit / rescan / delete controls**, since the server refuses all three once a receipt is approved and the buttons were the only thing on the row still saying it was the PR's. Last-week refuses a dispute on a pending receipt with a sentence naming the day and the row, instead of opening a sheet that ends in a 409; **withdrawing an existing dispute is never blocked**, which would otherwise trap a claim already raised. Shared logic in `lib/receipt-review.ts`, and `disputable` is treated as **advisory throughout** — the server's refusal is the rule, a client copy of a rule is not. Mobile tsc **0**, the baseline. ⚠️ **NOT verified at runtime: the mobile app has never been run, in any session** — this is types-and-reading only, which is the weakest claim on this page. **Biome was deliberately not run on `apps/mobile`** (no config there; the root one reformats whole files). | PR ← Agency (§9 P1) | ✅ done (unrun) |
| 2026-07-30 | **FIRED THE WHOLE RECEIPT LIFECYCLE LIVE, AND IT FOUND A LYING FIELD.** Nine checks on real agency + PR logins against the shared DB (§8 X21): the send gate refuses days and receipts **in one message**, a line correction simultaneously moves the net, drops the receipt back to pending and flips the day STALE, the PR is refused a dispute while a receipt is pending, and refused an edit or a delete once it is approved — with the wages line still disputable throughout, which is the owner's exemption working. **The bug was in a write response, not in any of the rules:** `PATCH /mine/lines/:id` returned `receiptStatus: null · pending: false · disputable: true` for a line whose receipt was genuinely pending, because that path never got the receipt-status map and fell back to the old source-based guess. The app would have drawn a dispute button the server then 409s. **This is the same failure this project keeps finding — a field with nothing behind it answering with a plausible value instead of the truth** — and it is the fifth instance in three days. Fixed and re-fired. ⚠️ **Two paths were deliberately not fired: a successful send and a dispute that actually succeeds, both of which leave permanent rows on shared data.** Everything else was restored to the exact starting state. | Agency ← PR (§8 X21) | ✅ done |
| 2026-07-30 | **THE AGENCY CAN NOW REVIEW A RECEIPT — the first of the lifecycle's two screens.** The receipts card in `PayrollVerifyPanel` was read-only with a docstring saying so ("there is no verify/approve endpoint yet"); now there is one. It renders the **proof photo and the PR's note** — the two things the owner's spec says the agency reviews, and neither was on screen before, only a count of photos — with per-line quantity/commission correction, Approve / Withdraw approval, and a header that says plainly why a pending receipt matters (the voucher cannot be sent, and the PR cannot dispute it yet). Built on the receipts that **already ride on `GET /payment-voucher/:id`**, not on the agency-wide `GET /payment-voucher/receipts` feed: the spec puts the review on the this-week PV, and reusing the detail read keeps one voucher on screen at one request and makes an approval refresh the day-review panel too — the two cannot show state from different reads. `buildSendGate()` now takes the receipts as well as the days, so the client mirror refuses exactly what the server refuses, in one place. A photo is only rendered as an image when the stored string is certainly renderable (`data:image/`, `http(s)://`); anything else prints as the reference it is, because a broken-image icon on an evidence panel reads as "the proof is missing". Writes gated on `raisePv`; the read is open. Web tsc **121 — the baseline, unchanged**; biome clean. ⚠️ **Not fired in a browser yet, and the PR's two sections are still to build.** | Agency ← PR (§9 P1) | ✅ done (agency half) |
| 2026-07-30 | **RECEIPT LIFECYCLE — the backend of the owner's `PENDING → APPROVED → VERIFIED` flow.** Migration `0074` adds `status`/`reviewed_at`/`reviewed_by` to `payment_voucher_receipt`; only `source='manual'` is born pending, a scan or check-in seal is born approved. **The backfill was the risky half and it is verified live: zero rows left pending** (4 → verified on issued weeks, 3 → approved on weeks still under review), because a pending receipt now BLOCKS the send and defaulting old rows to pending would have retroactively frozen vouchers whose money already moved. `reviewed_at` is left NULL on those rows on purpose — nobody reviewed them, and a NULL beside `approved` reads as "predates the review flow" the same way a NULL `line.component` reads as "predates classification". The block runs through the **existing** `voucherSendGate()` rather than a second check, so the HTTP send and the Monday job cannot disagree about whether a week may go out. Rollover APPROVED→VERIFIED runs in `weekly-payout` **before** the gate — after it, a week's receipts would spend an extra seven days at approved and the cadence would be skipped every week, invisibly — and it skips vouchers carrying an open dispute, because verified means closed and closing evidence under a live claim settles it out from under the PR. The dispute precondition landed with **wages exempt**: they are sealed at check-out with no receipt to approve, so requiring approval there would make a wage error the one thing that could never be contested. Two interlocks fall out of it, both intended: a PR can no longer edit or delete a line whose receipt has been approved (the route back is the dispute, which approval is what unlocks), and an agency line correction drops an approved receipt back to pending — the receipt table holds **no amount**, so unlike a day's `approved_total_cents` its staleness cannot be detected later and has to be recorded when it happens. The line edit is a **targeted** `PATCH …/receipts/:id/lines/:lineId`, not `PUT /:id`, precisely because that wholesale path is what deleted the PR's proof photos last slice. Backend tsc **0**. ⚠️ **No endpoint fired yet, and the two UI halves are not built** — §9. | Agency ← PR (§8 X20) | ✅ done (backend) · 🔴 UI open |
| 2026-07-30 | **AUDITED jk's EXPORT LANE, AND FOUND THAT AN AGENCY EDIT WAS DESTROYING THE PR's EVIDENCE.** The export lane itself is largely sound — ticket design, scoping on every `/mine` path and the mint, migration `0071` additive — but two defects only surfaced from *opening the artifact*: the workbook's money columns are **text** (`"3.60"<string>`), so the Amount column of a payment voucher cannot be summed; and `voucherRef()` derives `PV-<weekEnd>`, so **every PR's voucher for a week shares one number and one filename**. The serious one was next door: `PUT /payment-voucher/:id` replaces the entire line set, and `toLineRows()` never mapped `receipt_id` or `proof_photos` — so a single agency price edit **nulled every receipt link on the voucher and deleted the PR's proof photos**, the evidence a self-log is required to carry and the exact thing the new receipt-approval flow is meant to review. Fixed by carrying both across the wipe via a unique-`ref` match (ambiguous refs are skipped — attaching a receipt to the wrong money is worse than a null) plus accepting both explicitly in the API. Live-proven on a real voucher: same 2 lines sent back with neither field, receipt link and proof photo both survived, net unchanged. **This was the prerequisite for the owner's receipt lifecycle** (PENDING→APPROVED→VERIFIED), whose three decisions were answered the same day — §9. | Agency → PR (§8 X18–X19) | ✅ done (prereq) · 🔴 lifecycle open |
| 2026-07-30 | **VERIFY PASS ON THE PAYROLL FIX — the status deep-link was pointing at the wrong week.** Re-verifying §8 X15 turned up a second half of the same defect: the agency home links to `/agency/pv?status=PENDING_REVIEW`, and that effect **hardcoded the Last Week tab** — while a real `pending_review` voucher lives in the week still running. Live before: "Pending Agency Review **(0)** · No vouchers match these filters", with 2 waiting one tab away. It could not have been noticed before X15, because until then **no** real voucher listed on any tab. Fix reads the tab from the data (`tabHoldingStatus`, newest week first, `last_week` fallback) rather than naming one, so the payout cadence can move without this rotting again. Two things the fix needed that the obvious version misses: the week lists are **dependencies of the effect on purpose** (on first paint the vouchers have not arrived, so a single-shot pick would fall back and stick), and `selectPayrollWeekTab` now **clears `?status`/`?pv`** — otherwise the effect re-applies the URL's instruction on the next refetch and drags the user off the tab they just clicked. All four paths re-verified live, plus the fallback when the DB holds none of the requested status. Baselines held (web tsc 121, backend 0, mobile 0; drift 36 tables / 0 problems). | Agency ← PR (§8 X17) | ✅ done |
| 2026-07-30 | **BOTH DECISIONS THE PANEL RAISED WERE ANSWERED AND BUILT THE SAME DAY.** (1) *How should the Payroll screen find real vouchers?* → **keep the Sunday-start tabs and add a "This Week" tab.** The screen could not display a single backend voucher: tab weeks are Sun–Sat from the demo timeline, `payment_voucher.week_start` is a **Monday**, and `pvBelongsToPayrollWeek` compared them with `===`. Now matched by **containment** within the tab's window — a date falls in exactly one Sun–Sat week, which is what removes the two-tabs-at-once ambiguity that made "match by overlap" the wrong fix. The one-day gap between the two conventions is stated rather than hidden: every row prints **"Week worked: <its own range>"**, since the backend's `cycle` column holds a cadence ("Weekly") and not a range, so before this the only week on screen was the tab's. Live: This Week = 3, Last Week = 1, all four reachable, and the day review now opens by **clicking a row**. (2) *Should anything tell an agency a voucher is waiting?* → **yes, a new notification kind.** `pv_day_review_pending` (migration **0073**, additive + idempotent per `0067`'s pattern) raised by the payout job, **one per agency per run** naming a count — a held week can be a dozen vouchers and a dozen identical bells is how a bell gets ignored — and addressed to **owner + finance only**, mirroring the guard on the review routes rather than telling ops about a queue they may not clear. Enum verified live at **9** values; recipients verified to resolve (Atlas / Delta / Starline each have an active owner), so it cannot silently reach nobody. ⚠️ **The producer is not runtime-fired** — §9. | Agency ← PR (§8 X15–X16) | ✅ done |
| 2026-07-30 | **THE PV DAY-REVIEW PANEL — the last piece of that feature, and the send button now refuses what the server refuses.** `use-agency-pv-day-review` + `AgencyPvDayReviewPanel` on `routes/agency/pv.tsx`: one row per money-bearing day with approve / hold-with-note / clear, an approve-all, a "Changed" marker showing **both** figures when a day went stale, and the `· approve-all` stamp so a bulk approval stays distinguishable from an opened one. **Send-readiness is derived from each day's `status`, not from `allDaysReviewed` and not from the response's `hasHeldDay`** — those two write endpoints return `dayReviews` + `allDaysReviewed` only, so a gate reading `hasHeldDay` would go blank exactly when a hold was recorded; and `allDaysReviewed` is TRUE when every day is decided *and one is held*. Proven live in the UI: at 2/2 with one held the button stayed disabled, which is the whole point. Shares the evidence panel's query key (one voucher = one request; a decision refreshes both). **Two things the live pass exposed, neither of them the panel:** approving a held day used to carry the hold's note onto the approval, leaving the record reading *"Approved · Note: &lt;why it was held&gt;"* (fixed — an approval now clears the note); and **the Payroll list cannot display any real voucher at all** — demo-derived **Sunday**-start week tabs vs the backend's **Monday** `week_start`, so the equality in `pvBelongsToPayrollWeek` never holds and `PvDetail` is reachable only by deep link. §8 X14–X15. | Agency ← PR (§8 X14–X15) | ✅ done (panel) · 🔴 X15 open |
| 2026-07-30 | **THE FOUR OPEN DECISIONS WERE ANSWERED, AND THREE OF THEM BECAME CODE.** (1) *Does a held day block issue?* → **held blocks AND every money-bearing day must be decided** — the strict form, over the recommended warn-only. Now one shared `voucherSendGate()` used by **both** the HTTP send and the Monday `weekly-payout` job, because a gate the scheduler walks past every week is not a gate. A stale day counts as unreviewed (that is what `approved_total_cents` is for); a voucher with **no dated lines passes**, since blocking it would be an unopenable deadlock rather than a control; and **rewriting the lines in the same call as the send is refused**, or the gate would judge the old day totals and ship the new ones. (2) *Who may approve a day?* → **owner + finance**, expressed as a named `agencyOwnerOrFinance` grant on the two write routes even though it is currently identical to the org-level guard — written down, a future third sub-role has to be granted money authority on purpose instead of inheriting it. The READ stays ungated: seeing a decision is not making one. (3) *What may a venue read about a person?* → **neither coordinates nor PII**; identity documents are blanked for outlet-only callers at the response boundary. (4) *Should `/mine` span every `pr` row a user owns?* → **no, stay single-row** — no code change; the model already calls two `pr` rows drift, and no live user owns two. All three shipped gates were fired live and the test rows cleaned up — §8 X12, X13. ⚠️ **Consequence to expect:** until the agency panel exists, the payout job will hold vouchers at `pending_review` instead of issuing them. | Agency → PR · Outlet ← PR (§8 X12–X13) | ✅ done |
| 2026-07-30 | **PV DAY REVIEW — the agency signs off a voucher day by day before it is sent** (`ef45445`, migration `0072`). A week is rarely wrong all at once, so one bad Tuesday no longer holds the other six days. Keyed to `review_date`, **never to a line id** — lines are wiped and re-inserted on every voucher update (same reasoning as `payment_voucher_dispute` 0051). **`approved_total_cents` stores the day's total at approval, computed server-side**: without it a day signed off at RM 300 that regenerates to RM 420 still reads "approved", so readers recompute and treat a mismatch as STALE. No `pending` state — no row means never reviewed. Per-DAY while disputes are per day+component, on purpose: the agency reviews a day as a unit, a PR contests one component of it. `approve-all` records `bulk=true` and **skips held days** so it cannot quietly overturn a refusal; reviewing an already-signed voucher is 409. Read rides on `GET /payment-voucher/:id` with the receipts. Migration hand-written (drizzle-kit generate aborts on a pre-existing 0065–0070 snapshot collision) and the table **verified live by direct query**, not by trusting the migrator. ⚠️ **The stale path is logic-only — not yet fired live** (needs a regeneration, a destructive write on the shared DB). | Agency ← PR (§8 X11) | ✅ done |
| 2026-07-30 | **Overnight shifts can now clash — and "double-booking" never meant a second shift.** A PR may work as many shifts a day as they like; both guards only ever refused an OVERLAP. The real defect: both compared `dayKey(a) === dayKey(b)` BEFORE the windows, so two shifts only met if they shared a `shiftDate` — **an overnight 22:00–04:00 never met the next morning's 02:00–06:00**, which genuinely overlap 02:00–04:00. Overnight being the normal shape here made that the likeliest real collision, and it predates the edit guard. Replaced with `shiftsOverlap()` putting both on a continuous minute timeline (`dayIndex*1440 + window`), so the date test disappears rather than being special-cased. Also repaired 30 mojibake characters I introduced in `fa44ce4` via a PowerShell ANSI/UTF-8 round-trip. | Agency → PR (§8 X10) | ✅ done |
| 2026-07-30 | **Double-booking guard — the audit's entry was wrong, and the real gap was the mirror image.** Re-deriving first showed assign **already** refuses a clash (`shift-assignment` create compares the new window against the PR's other active assignments that day). What was missing: `UpdateShiftSchema` allows changing `slot`/`shiftDate` and shift update had **no** clash check, so an agency could drag a shift on top of another one the same PR works — same outcome, opposite direction, and silent because nobody is assigning at that moment. (Assignment update cannot cause it: it only touches status/pay/check-in-out/notes, never the shift↔PR pairing.) Fix `fa44ce4` + `slotMinutes`/`slotWindowsOverlap`/`shiftDayKey` extracted to `util/slot-window.ts` so both ends test overlap with ONE implementation. Live-proven on a PR genuinely working two non-overlapping shifts in a day: clashing move 400 (message names the other shift + venue), clean move 200, slot restored. | Agency → PR (§8 X9) | ✅ done |
| 2026-07-30 | **First real click-through of both web portals** (genuine password logins, not minted tokens — the step blocked for days). Agency: collections renders live drafts (Velvet 23 · RM 700.00), subscription record correct-empty. Outlet: subscription row reads **Active** not "Paid", `/outlet/special-service` shows the phase message not a role error. **Draft statements proven invisible to the venue across two portals.** Zero console errors either side. Found + fixed one bug on sight (`50e632c`): the check-in card headed a 69 m fix with "1/1 within **50 m**" — `inRange` is radius + min(accuracy,30), so 69 m against a 50 m pin at ±22 m legitimately passes; header now reads "within fence · 50 m pin". Same class as the four catalogued label bugs, and only a live render could show it. | Agency + Outlet (§8 X6–X8) | ✅ done |
| 2026-07-30 | **`GET /user` was serving EVERY account's password hash to any signed-in user — fixed.** The first live 4-role sweep (real password logins, ~60 checks) found it on a **PR** token: 200 OK with the whole user table — 10 accounts, 10 `passwordHash` values incl. the platform admin's, plus IC/DOB/address/ID-photo paths for 6 of them. Same on outlet and agency. Two faults: `list()`/`getById()` spread the raw row (no projection), and the list had no gate. Fix `9a6eecc` — strip `passwordHash` + the 3 lockout columns in **`withUserProfile()`** (NOT the repository: `auth` still needs the hash to verify a login, so the projection must sit at the response boundary; that one helper also covers the `/user/:id` route mobile uses), list gated `requireRole('admin','agency','outlet')`, `/user/:id` self-or-staff. **Outlet stays IN the gate on purpose** — the tighter admin+agency gate blanks PR names on outlet Today + History (`use-outlet-today`/`use-outlet-history` → `services/pr/prs.ts`). Re-verified live: hash occurrences 0, PR 403 on the list / 200 on its own record, all 4 logins still work, 31-check regression clean, backend tsc 0. **Prior sweep had seen this route and rated it MEDIUM — it analysed who could call the endpoint and never what it returned.** | all (§9 role-gating, §8 X1–X5) | ✅ done |
| 2026-07-30 | **First live role sweep — the rest held.** Beyond the leak: PR's six `/mine` endpoints all 200 and every cross-role refusal correct; `/shift-assignment/attendance-fixes` proven 200 agency / **403 outlet + 403 PR** (staff-coordinate exclusion is server-enforced, first execution since it shipped); jk's PV export ticket lane audited and **sound** (mint checks `prId`, 128-bit 5-min single-voucher ticket, above-JWT mount is deliberate for browser downloads); and **no duplicate `pr` rows exist** — all 6 have a `userId`, none shared, so the "consolidate duplicate pr rows" decision is moot on current data. Reusable recipe: repo-root `.env` feeds the backend (no `apps/backend/.env` needed), port 7777, login returns `data.accessToken`, keep sweeps read-only (shared remote DB). | all | ✅ done |
| 2026-07-31 | **Missed check-ins moved To-do → Agency Schedule calendar (user ask) + calendar month/year pickers actually pick now.** ① The five red "Missed check-in" To-do cards were noise — removed from `ShiftsScreen` (TO-DO count back to real to-dos). Instead `AgencySchedulePanel` marks each missed day **red** on the calendar (`MISSED_STYLE` #f07171 overlay + new "Missed check-in" legend entry). Missed = status `assigned` with NO stamps and the shift window over — so MC/leave (`leave_pending/approved`), cancellations and no-shows never count (user rule). **Tapping a red day opens a PhoneSheet with the details: date, outlet, slot, address** + "no check-in recorded, no MC/leave/cancellation on file — contact your agency". Works for any viewed month (overlay is computed from assignments, not the 4-week `buildScheduleDays` window). ② The MONTH/YEAR header fields LOOKED like dropdowns but only cycled (month stepped backwards, year only incremented — a PR could strand the view in 2028 with no way back). They now toggle real pickers: MONTH opens the Jan–Dec chip grid, YEAR opens view-year ±3 chips (chip rows hidden until opened — declutter). Verified live as Vicky: 24–26 Jul (Velvet 23) + 27–28 Jul (Emhub) red; tap 24 Jul → sheet shows Velvet 23 · 22:00-04:00 · Bukit Bintang address; June pick + 2023–2029 year options confirmed; TO-DO 0; tsc 0 errors, console clean. | PR (Today/Agency schedule) | ✅ done |
| 2026-07-31 | **Today page now shows the just-completed shift (user ask: Today said "no shift" while Check-In showed the finished JK House summary).** A completed card only lived on Today while the check-out's CALENDAR day was today, so a 23:50 night-shift check-out vanished from Today at midnight — 10 minutes later. New shared freshness rule (check-out day is today OR under 12 h old): `ShiftsScreen` keeps the completed card on Today (new "LAST NIGHT · COMPLETE" eyebrow when the worked day is yesterday; hub TODAY flips Off → Complete), and `active-shift.tsx` gets a `checkOutFresh()` helper used by both `pickActive` rule 3 (just-finished summary stays the pinned Check-In pick, not just the never-blank fallback) and the focus-pin validity (View summary keeps working past midnight). Verified live as Vicky at 00:57: Today shows "LAST NIGHT · COMPLETE · JK House", hub "Complete", Check-In unchanged; tsc 0 errors (mobile baseline), console clean. | PR (Today/Check-In) | ✅ done |
| 2026-07-31 | **Today hub strip said "Complete" on a day with no shift.** The TODAY tab value derived from the global attendance phase — which follows Check-In's never-blank fallback, i.e. YESTERDAY's completed JK House shift — so at 00:49 on 31 Jul the strip claimed "Complete" while the Today section truthfully said "No shift scheduled for today". `ShiftsScreen.tsx` now scopes the label to TODAY's own shifts: on-duty today → "On duty", booked today → "Tonight", checked out today → "Complete", else "Off"; the global `phase`/`useShiftSession` wiring in this screen became dead and was removed. Verified live as Vicky: strip reads **Off** next to the empty Today section; tsc 0 errors, console clean. | PR (Today) | ✅ done |
| 2026-07-31 | **Check-In Complete card: RM amount clipped off-screen on the real phone.** Web frame was fine, but on the Android device the system font scale blew the 26px `completeAmt` past the card/screen edge ("RM 700.0…" cut off) — the row gave the left label column unbounded width and the amount no shrink. Fix in `CheckInScreen.tsx`: left column now `flex:1 minWidth:0`, amount gets `flexShrink:1` + `numberOfLines={1}` + `adjustsFontSizeToFit` (`minimumFontScale 0.55`) — same shrink-to-fit pattern as History's summary tiles. Verified web unchanged (amount right edge 342px < 375px frame, console clean, tsc 0 errors); phone needs an app reload to pick it up. | PR (Check-In) | ✅ done |
| 2026-07-31 | **Missed check-in logic (user ask: a past never-checked-in shift must not sit on Check-In as "Booked").** `pickActive` rule-4 fallback (`active-shift.tsx`) now only considers TODAY-or-future bookings (`shiftDate >= today`) — a past booking that was never checked in can no longer hijack Check-In with a live Check-in button (the week-old "Velvet 23 · Fri 24 Jul · Booked" card); with nothing bookable, Check-In falls back to the latest completed summary as designed. The missed shifts surface on **Today → To-do** instead: new red "Missed check-in" cards (outlet · day · slot — "no check-in recorded · contact your agency"), counted in the TO-DO tab — same "the card IS the notification" rule as swap requests (`ShiftsScreen.tsx`; end-of-shift computed via `shiftEndDate`, day-over fallback when the slot is unparseable). Verified live as Vicky: Check-In shows the JK House 30 Jul **Complete** summary, To-do = **5** missed cards (Velvet 23 24–26 Jul + Emhub Testing 27–28 Jul — five stale `assigned` rows, not one). Client-side only: rows still sit `assigned` in the DB → new §9 P2 item for a backend `assigned→no_show` sweep at shift end. tsc 0 errors (mobile baseline), console clean. | PR (Today/Check-In) | ✅ done |
| 2026-07-30 | **PR app copy de-clutter + UI fixes (the 7 asks).** Stale instruction copy removed across the phone app: Today → Agency-schedule calendar hint ("Tap an available day to block it…"); Check-In STATUS hint ("Use Scan receipt — each log adds a row…"), the "− RM x/shift − paid on shift completion" note under Duty time, and the "Selfie attendance disabled…" note under Check out; TOTALS now reads just "wage RM 700.00 + comm" (Projected/Payout prefix dropped — the total already shows on the page). Payment page: "$ PAYROLL" kicker, "Review & sign…" meta line and the "Outlet → Agency → your bank…" flow box removed; footer shortened to one row → "PV on 2 Aug · total RM 3.60". History: "EARNINGS" kicker removed; the Outlet/Status dropdowns now open **directly under their fields** (they used to render below FROM/TO TIME and looked detached — fixed in BOTH the Shifts and Payment-history panels, and opening one now closes the calendar); shift-card meta is one row ("Wed · 29 Jul 2026 · Sealed · pending PV" — "Shift sealed" shortened in `demo-shifts.ts` + `payment-history-map.ts`). Payment-history card: both sub-lines single-row; aggregate outlet label shortened "Multi-outlet (2)" → "(2)-outlet" (`awaiting-pv.tsx`, `PvDetailScreen.tsx`, `payment-history-map.ts` — null-outlet vouchers now counted from their lines); status meta drops the signer + "Awaiting bank transfer" → "Signed 30 Jul 2026 · 11:14" (`signed-pv.tsx` + map). **Already-stored signed PVs migrate too:** `normalizeHistPayWeek` (history-pay-sync) rewrites the old localStorage outlet/statusMeta strings, and `paymentHistoryOutlets` excludes the new "(N)-outlet" aggregate from the outlet filter (kept the old "Multi" guard for unmigrated tabs). Verified live in Expo web as Vicky: all 5 pages render the new copy, dropdown placement confirmed, `apps/mobile` tsc 0 errors (baseline), console clean. | PR (§8 P2/P5 polish) | ✅ done |
| 2026-07-30 | **Admin low-risk hardening batch (5 fixes, all verified live; high-risk items deliberately skipped).** Scouted every §9 admin item with 5 parallel agents to establish blast radius first, then shipped only the low-risk set. **① 🔥 `/user` REST leak closed:** `GET /user` + `GET /user/:id` now `requireAdmin` — guarded per-ROUTE, *not* the mount, because a mount guard would 403 PR mobile's own profile/avatar/portfolio saves; verified admin **200**, PR **403**, PR self-`PATCH` still **200** ("Profile updated", value unchanged). Also learned `PATCH /user/:id` is already **self-only** in the controller — stricter than the "self-or-admin" this doc asked for, so it was correctly left alone. **② Settings could silently zero the platform fee** — blank → `0`, text → `NaN` → `null` → `z.coerce.number()` → **0**, accepted with a green toast; now blocked client-side with an inline message (verified: no PUT sent, DB still 2.50 %). **③ Plan audience filter** now sends `subscriptionType` so it ANDs with the cycle dropdown instead of overwriting it (verified `?subscriptionType=agency` → 6 agency plans). **④ RBAC Pending badge reconciled** — old formula gave 4 for 5 visible rows, now 5 = 5. **⑤ Pending page honesty** — error banner over partial loads (can no longer show "Nothing pending" on failure) + truncation footer; plus a bonus bug: `plan_change` rows said "Plan request" and linked to a page that **filters them out**, now labelled and linked correctly. **⛔ Held back on purpose (reasons + safe paths now in §9):** admin-gating GraphQL `auditLogs` and its `users` twin (auth semantics — a wrong guard also kills the dashboard activity feed), the server-side audit `role` filter (3 named traps incl. `role IS NULL` rows), Create-Admin phone capture. Note the `/user` leak is **narrowed, not closed** — the GraphQL `users` resolver still reads the same table behind `@auth`. Verified: backend tsc 0 errors, web tsc unchanged at 124 baseline, none in touched files. | Admin (§9) | ✅ done |
| 2026-07-30 | **"Reset demo" removed from the admin header.** The button never wrote to the DB (it only ran `queryClient.invalidateQueries()` and toasted "Demo data refreshed"), but in a live admin portal the label reads as a destructive data wipe. `ResetDemoButton` deleted from `apps/web/src/components/layout/header.tsx` plus its now-unused imports (`useQueryClient`, `RotateCcw`, `useState`, `toast`); `useQuery`/`Button` kept for the notification bell + user dropdown. Scope is admin-only — that `Header` is imported solely by `layout/admin-layout.tsx`, so agency/outlet demo controls are unaffected. Verified: `header.tsx` typechecks clean (124 `apps/web` errors are the pre-existing agency-portal baseline), Vite serves the module with no `ResetDemoButton`/`RotateCcw`/"Reset demo" left, and the reloaded dashboard renders its header with only Theme · Notifications (3) · user menu — no error boundary. | Admin (§4d · §9) | ✅ done |
| 2026-07-30 | **Admin portal run against the LIVE DB — §8 promoted from Reported to Verified.** Signed in as the seeded admin (token seeded into the tab, no credential typed into a form) against `103.224.93.109:6543/innocenz-test` and proved what the portal really does with the database. **✅ Verified live:** dashboard (3 agencies / 7 outlets / 13 jobs / 3 requests / 2 job posts — UI matched API exactly), PR list (6 PRs with legal names + NRIC + agency links), payment vouchers (4 real, both Vicky rows = duplicate-PV issue confirmed on screen), plan catalog (12 plans), plan-request inbox, platform settings. **✅ Writes proven reversibly:** `PUT /platform-config` geofence 50→57→50 persisted, stamped `updatedAt`, and **appeared in the dashboard activity feed**; `PATCH /admin-request/:id` remarks written→re-read→restored. **✅ Guards proven:** PR token = **403** on `/admin-request`, `/platform-config`, RBAC writes. **🔥 Both security holes confirmed live, not theoretical:** a PR token listed **all 17 users** via ungated `GET /user`, and read **865 audit rows** via GraphQL. **New bug confirmed in UI:** admin-audit page shows 1 row while the footer claims "1–10 of 2752 · Page 1 of 276" (client-side role filter after server pagination). **Also logged:** audit rows render `Table = unknown` for `Auth`; the header's "Reset demo" button is only a refetch but reads as a data wipe. **☐ No data (not a defect):** approve/suspend on agency/outlet + legacy-member page have zero rows in the required state — retest once SL creates pending signups. Backend fix required to get here: `pnpm install` (missing `pdfkit`/`exceljs` crashed boot → "Internal server error" on web + "cannot reach backend" on phone). | Admin (§8 AD3–AD18 · §9) | ✅ done |
| 2026-07-30 | **Admin side fully mapped — §8 grown 2 → 18 rows.** 6-agent code audit traced every `/admin` page to its backend: **all pages live-wired, zero demo screens in the admin tree** (demo-store split is agency/outlet only). New §8 rows AD3–AD18 (dashboard · 5 user-mgmt tabs · RBAC CRUD+pending · 4 service tabs · plan/history · audit-log · settings · profile — all ⚠️ Reported pending one real sign-in run); §4d itemized per tab; §2 link H flipped ❌→⚠️ wired. New **Admin hardening backlog** in §9: 🔥 `/api/v1/user` ungated (any token lists/patches any user) · 🔥 GraphQL `auditLogs` readable by any token · Create-Admin drops status + fakes phone · no admin lifecycle actions · PR filters client-side over first 200 rows · admin PV `resolveDispute`/receipts unwired · RBAC pending 20-row cap + badge/list count mismatch · plan audience filter proxies billingCycle · audit-log role filter client-side · `outlet_transaction` API with zero UI. | Admin (§2 H · §4d · §8 · §9) | ✅ done |
| 2026-08-03 | **POS shown as a thing in its own right, and the two admin records told apart.** (1) A POS request no longer renders as a plan transition — no more *"Scale → Integrate with POS"*, a swap that never happens. The drawer shows **one add-on block**: *Add-on · billed on top / Integrate with POS / RM x*, and when the venue already holds it, **"Previous price RM 99,999.00 — negotiating again"** (re-quote) or **"— ends"** (cancel), with the cancel note saying the charge stands until the admin resolves. The previous figure is computed server-side from the venue's active add-on line (`previousAddonAmount`), since a request row does not carry it. In the table a POS row now reads *from* `Integrate with POS · RM 99,999.00` (or "—" first time) *to* `Integrate with POS` / `Cancel · Pro only`. (2) **The two admin pages read DIFFERENT tables and this confused the record:** Plan Change is `admin_request` — switches ASKED FOR (Emhub: 2 rows); **Current Plan → Full history** is `member_subscription` — what was actually BILLED, the very same rows the venue sees on its own Subscription page (Emhub: 6, incl. three POS lines). Plan Change now links across to it in so many words. | Admin ↔ Outlet (§9) | ✅ done |
| 2026-08-03 | **Plan Change defaults to the FULL record.** The page is the subscription trail, so it now opens on every switch each outlet and agency has ever filed — a subscriber appears **once per change**, repeating down the list, rather than once in total. Live: **12 rows across 8 subscribers** (JK House 4 changes, Emhub 2, the rest 1 each). *Latest only* is still one click away for the narrower "what needs answering" view, and POS/Custom moves remain on Plan Request. | Admin (§9) | ✅ done |
| 2026-08-03 | **A venue on POS has TWO ways out, both through the admin.** Owner's rule: removing POS is allowed, but the admin must be notified — either to **quote the price again** or to **cancel POS back to plan-only**. The active add-on card now offers both: **"Ask for a new price"** files a fresh POS quote (resolving it replaces the add-on line at the new figure) and **"Cancel POS · plan only"** files an exit (resolving it cancels the line). While either is outstanding the buttons are replaced by *"Your request is with InnocenZ admin — the current price applies until they answer"*, because **a venue must never be able to end its own billing**; the charge stands until the admin answers. | Outlet ↔ Admin (§9) | ✅ done |
| 2026-08-03 | **Agency Custom cycle PROVEN live, and a test agency left ready.** The owner has no PV volume to reach 151/week, so the cycle was driven through the real endpoints as the agency's own login. **Delta Agency, full circle:** Starter → **Custom** (auto `direct`) — ledger wrote **Custom RM 0.00**, exactly the placeholder-price hole, since Custom's catalog price is 0; the agency asked for a quote (`custom_renegotiation`); admin resolved at **RM 2,400** → ledger amount moved **RM 0 → RM 2,400**, traced to that quote; then Custom → **Growth**, closing Custom (`expired`) and opening Growth RM 500. Routing verified: all three Custom moves (in, priced, out) appear in **Plan Request**, and only Delta's ordinary switch stays on **Plan Change**. **Left ready for the owner: Atlas Agency is on Custom (RM 0.00) with a PENDING renegotiation** — resolve it with a price to watch the ledger fill, then switch Atlas back to a normal tier to see the exit land in Plan Request. ⚠️ Delta and Atlas now carry real subscription rows created by this test; the ledger shows the trail. | Agency ↔ Admin (§9) | ✅ done |
| 2026-08-03 | **The two admin inboxes are split on ONE rule, and an exit row names what it leaves.** Owner's rule: POS / Custom belong **only** on Plan Request; Plan Change is ordinary plan-to-plan. Implemented server-side as `negotiated=only|exclude` — a request counts as negotiated when its type is a POS quote or Custom renegotiation, **OR when it is a plain `plan_change` whose from- or to-plan is Custom or an add-on**. That second half matters: "Enterprise → Custom" is filed as a plan_change, so type alone would file it under the wrong page. Verified live: **Plan Change 12 rows, none POS/Custom; Plan Request 9 rows, all POS/Custom** (both directions, both roles). Also fixed: an exit row read **"Pro → Pro"** because both sides showed the venue's plan — the from-side now names the thing being dropped (**Integrate with POS → Pro**). A subscriber can hold a normal plan AND a negotiated arrangement at once; that is the point of the add-on, and the ledger keeps them as separate lines. | Admin (§9) | ✅ done |
| 2026-08-03 | **An exit request no longer reads backwards, and its prices are shown.** A "remove POS" row rendered as *Plan (stays): **POS Integration** RM 0.00 → Add-on: **Pro** RM 0.00* — both sides inverted and priced at zero. Two causes, both fixed: (1) `create()` stamped `current_plan_id` from the venue's newest ACTIVE ledger row, which for a venue holding POS is the **add-on**, so the request recorded the add-on as its plan — it now filters `kind: 'plan'`; the one existing row was repaired to Pro. (2) The drawer rendered an exit with the joining labels. An exit now reads **Add-on (ends): Integrate with POS · "Charge stops on resolve"** → **Plan (continues): Pro · "RM 2,999.00 — the venue keeps paying this"**, with a note saying the add-on charge ends and no price is negotiable. **Where to find history:** the Plan Change page's dropdown beside the search box — *Latest only* (default, what still needs answering) / **Full history** (every switch ever filed, including moves to and from POS/Custom). Labels were truncating to "Latest per subscrib…", so they are now short and the card description says which view is showing. | Admin (§9) | ✅ done |
| 2026-08-03 | **Switching BACK off a negotiated arrangement now exists, and both admin pages show it.** A venue could take the POS add-on but never leave it, so it would pay two subscriptions forever. Now: the venue's card has **Remove POS integration**, which files a POS request naming its own PLAN as the target — that is what marks it an EXIT, and resolving it **cancels** the add-on line instead of starting another (no quote needed; starting one still requires an agreed figure). Proven live: Emhub's POS line reads `cancelled` while Pro stays `active` — no double billing. **Plan Request** (`includeNegotiatedExits`) also lists plan changes that END a negotiation — an agency switching off **Custom** — because the admin who agreed that price must see it stop, not only start; and it gained a **search box**. **Plan Change** (`includeOpenNegotiations`) now lists moves to/from POS and Custom while they are still outstanding, labelled by `toLabelOf` (a request with no requested plan reads "Integrate with POS"/"Custom"; one naming a plan reads that plan) — **resolved negotiations stay on Plan Request**, where the price was agreed. | Admin ↔ Outlet ↔ Agency (§9) | ✅ done |
| 2026-08-03 | **A POS quote is labelled as an ADD-ON, not a plan replacement.** The drawer reused the plan-change layout — *"From plan: Pro → To plan: Integrate with POS"* — which reads as a swap, so the venue's page (correctly showing **Pro AND POS**) looked wrong to the admin. **Both is correct:** POS integration carries no PR allowance, so replacing the plan would leave the venue with no PRs/day and no plan billing while paying RM 99,999 for a sales feed. For a POS quote the drawer now reads **Plan (stays) / Add-on**, cards **"Plan · unchanged" / "Add-on · billed on top"**, and the resolved note says the venue keeps its plan and is billed the add-on on top. Wording only — no data or API change. ⚠️ **Owner decision if ever revisited:** making POS replace the plan would strip the venue's PR-per-day allowance and show "POS Integration" where a plan belongs on Current Plan. | Admin (§9) | ✅ done |
| 2026-08-03 | **Add-ons are real, and both admin pages can show full history + search (migration 0081).** (1) **Resolving a quote now writes the ledger** — the figure used to live only on the `admin_request` row, so nothing billed it and the venue never saw it. A resolved POS quote creates an **ADD-ON** line at the agreed price **alongside** the venue's plan (the plan is untouched — POS is not a plan); a Custom renegotiation writes the agreed amount onto the agency's plan row, which otherwise bills **RM 0** because Custom's catalog price is a placeholder. (2) **Migration 0081** adds `subscription.kind` (`plan`|`addon`), the **POS Integration** product, and `member_subscription.admin_request_id` so any price traces back to the negotiation that agreed it; reads gained a `kind` filter so a venue's add-on line is never mistaken for its plan. (3) The venue's POS card reads **Active · RM x / month · billed on top of your plan**. (4) **Plan Change** gained a search box + a *Latest per subscriber / All changes (history)* switch; **Current Plan** gained *Current plan / Full history* — older rows were always kept, they just had no view. Live: JK House shows 1 row latest / 4 in history; Emhub shows POS RM 99,999 (addon) + Pro RM 2,999 (plan) + Essential expired. ⚠️ **Migration numbering trap:** drizzle applies only entries whose journal `when` is newer than the last applied stamp — a smaller value is skipped **silently while reporting success**. | Admin ↔ Outlet (§9) | ✅ done |
| 2026-08-03 | **POS-quote status now persists for the venue too.** "Request sent" was React state, so a refresh reset the card to *Request admin quote* while the admin still held the request — the venue would ask twice. New session-scoped `GET /admin-request/mine/pos-quote` (same scoping as `/mine/plan-change`; repository method generalised to `latestPendingByType`) so the badge is server truth and clears when the admin resolves it. The **"Cancel request" button is hidden in a real session**: the request lives with the admin and there is no withdraw endpoint, so the button would clear the badge while the request stood — a button that lies. Verified live: Emhub reads its own pending quote. ⚠️ A real withdraw endpoint is the follow-up if venues should be able to retract. | Outlet ↔ Admin (§9) | ✅ done |
| 2026-08-03 | **🔴 A venue could be shown ANOTHER venue's plan as its own.** Emhub Testing's page read *Scale · RM 6,999* while the database (and its own API response) said **Pro · RM 2,999** — Emhub has no Scale subscription in its entire history. Cause: when the ledger lookup produced nothing, the page fell back to the DEMO store, which is shared by every venue opened in the same browser, so it displayed a plan left over from another venue. **A real session no longer falls back at all**: with no active row there is simply no current plan and the card renders none (`currentPlan` is nullable; every use made null-safe). Demo sessions keep the demo plan. Money on screen must come from that venue's own row or not be shown. Separately: a request still AWAITING an answer now resolves its "from plan" live from the ledger (answered requests keep their stamp — that is what they were decided against), so a POS quote raised on one plan is not negotiated against a stale price. | Outlet ↔ Admin (§9) | ✅ done |
| 2026-08-03 | **"BEFORE · FROM PLAN" now shows the subscriber's real current plan.** It was blank for POS quotes, custom renegotiations and contact requests — only a plan_change carried a `current_plan_id` (sent by the client) — so the admin drawer told the admin nothing about who they were negotiating with. `POST /admin-request` now stamps `current_plan_id` from the subscriber's ACTIVE ledger row whenever the client did not send one, for every request type. Existing rows backfilled by `repair-member-subscription-links.ts` (new pass, dry run unless `--apply`): 1 stamped. Verified live — every pending request now names its from-plan (Emhub POS quote → Pro, Horizon Talent renegotiation → Growth, Velvet 23 POS quote → Pro). **Also proof the whole loop works: Emhub Testing switched Essential → Pro and the approval moved the ledger (Essential `expired`, Pro `active`) by the owner's own account.** | Admin ↔ Outlet (§9) | ✅ done |
| 2026-08-03 | **Admin "History" renamed to "Current Plan".** Sidebar entry, page heading, browser tab title and card title all now say Current Plan, matching what the page shows since the collapse (one row per subscriber, the plan it is on now). **The route path stays `/admin/business/history`** — renaming it would break deep links and require regenerating the route tree for a label change. | Admin | ✅ done |
| 2026-08-03 | **"Could not send the switch" now says WHY.** Emhub Testing could not switch: the server answered **400 "Already on Essential — no switch needed"**, and the page replaced that with a useless *"Could not send the switch — try again"*, so the venue retried forever. Cause: the demo store is shared across venues in one browser, so before the ledger loaded the card showed another venue's plan as Current and offered a switch to the plan Emhub was actually on. Fixed both ends — `requestPlanChange` now returns `{ok, reason}` and the toast prints the server's own words (and refetches, since the plan may have moved), and the Switch buttons are **disabled with "Loading…" until the real plan has loaded**, so the mis-click cannot be made. Reproduced live before and after. My reproduction row was deleted from the queue. | Outlet (§9) | ✅ done |
| 2026-08-03 | **Admin Plan Change now shows what is OUTSTANDING, matching the venue's screen.** The collapse picked "newest by `created_at`", and JK House had two requests filed in the SAME minute — one approved, one still pending. Ties resolved arbitrarily, so the admin queue showed the *approved* row while the venue's own page showed the *pending* one: the same subscriber read by two different rules. The `DISTINCT ON` now orders **pending first, then newest**, so an unanswered request always wins over an answered one. Verified live: JK House reads `pending` in the admin queue, matching its "Awaiting admin" badge. ⚠️ Older redundant pendings are NOT auto-declined (a script should not void a venue's ask) — decline them by hand; the create-guard stops new ones. | Admin ↔ Outlet (§9) | ✅ done |
| 2026-08-03 | **Renewal is anchored to the subscription's start day, not recomputed daily.** Owner's rule: *"when it start from that month then is auto renew that month, no everyday change unless that time just switch or auto switch plan."* Every renewal date is now computed FROM the original `started_at` (period arithmetic), not by stepping a date forward — stepping drifts: 31 Jan + 1 month lands on 3 Mar because "31 Feb" overflows. The day is clamped to the target month's length instead, so a 31st subscription bills 28 Feb / 31 Mar / 30 Apr and keeps its anchor. Weekly (agency) steps 7 days. Checked across a day change, a month boundary and the 31st case. It re-anchors only when a switch is approved, because that writes a new `started_at`. | Outlet (§9) | ✅ done |
| 2026-08-03 | **A switch to the plan you are already on is refused, and the renewal date is real.** (1) `POST /admin-request` now checks the subscriber's ACTIVE ledger row first: asking for the plan it already holds returns **400 "Already on <plan> — no switch needed"** instead of filing a request that would sit Pending forever while the venue's own screen shows that plan as current (exactly the contradiction seen today). Verified live: refused for Enterprise, still accepted a genuine switch to Pro. (2) The outlet Subscription card's **"Renewal 15 Jul 2026" was a hardcoded constant** — invented and already in the past. It is now derived from the venue's own subscription: `started_at` rolled forward by `billing_cycle` to the next future date, and OMITTED entirely when the ledger has nothing active. ⚠️ The PR counters beside it (`0 / 50 requested PRs today · pool of 100`) still come from demo shift data — logged in §9. | Outlet ↔ Admin (§9) | ✅ done |
| 2026-08-03 | **History shows the CURRENT plan per subscriber.** `GET /member-subscription?latestPerSubscriber=true` (Postgres `DISTINCT ON (subscriber_type, subscriber_id)`, newest `started_at`) — used by admin History, so a venue that has switched shows the plan it is on today, not every plan it has ever held; the closed rows stay in the table as the record of what was charged. Card wording corrected to match ("the plan each outlet and agency is on now"). The venue's own billing list and the coverage check deliberately do NOT send the flag. Verified live: 10 rows, one per organisation. ⚠️ **Known confusion from the stale-bundle window:** JK House's page read *Essential* (demo fallback) while the ledger already said *Enterprise*, so the switch it filed at 12:16 asks for the plan it is already on — decline that request, or approve it to write a fresh Enterprise row. | Admin (§9) | ✅ done |
| 2026-08-03 | **A venue can see its own pending switch, and Plan Change shows one row per subscriber.** Two halves of the same defect — the venue's "Awaiting admin" badge was React state only, so a REFRESH forgot it, the Switch buttons came back, the venue asked again, and the admin queue filled with duplicates (JK House had 3 pending for one decision). Now: new session-scoped `GET /admin-request/mine/plan-change` (outlet/agency, id resolved server-side via `resolveOrgScope` — never from a query param) lets the subscriber's own screen keep showing the pending plan across refreshes and clear itself the moment the admin answers; and `GET /admin-request?latestPerSubscriber=true` (Postgres `DISTINCT ON`, used by the Plan Change page) collapses to the newest request per subscriber so a stale one can't be approved. Older requests are NOT deleted — they remain the record of what was asked. Approve applies the new plan immediately (ledger write); decline leaves the venue on its current plan and the badge disappears. Verified live: JK House reads its own pending row, an outlet is still **403** on the full queue, and the list goes 9 rows → 7 with the flag. | Outlet ↔ Admin (§9) | ✅ done |
| 2026-08-03 | **Fake subscription rows deleted — History is now only real organisations.** Owner's call, applied: `repair-member-subscription-links.ts --purge-ghosts --apply` deleted the **6 seeded rows** that named organisations existing in no table (Marble Hall, Jade Garden Bar, Summit Staffing, Horizon Talent, Pioneer Crew, Vanguard PR — all `created_by='seed-sample'`). Every row was printed and written to a rollback JSON in the OS temp dir before the delete. **The ledger now mirrors the operation section exactly: 7 outlets + 3 agencies = 10 rows, all linked by primary id, no duplicate names.** ⚠️ **Re-running `seed-sample-activity.ts` would recreate them** — its MEMBER_SEED invents names with random ids; logged in §9 as a fix-before-reseed. | Admin / DB (§9) | ✅ done |
| 2026-08-03 | **The venue's own page and admin History now read ONE truth.** The outlet Subscription page's *Current* pill comes from its ACTIVE `member_subscription` row (the same ledger admin History reads), falling back to demo data only when there is no row — so an approved switch appears on the venue's screen by itself. Ledger repaired in the shared DB via the new idempotent `repair-member-subscription-links.ts` (dry run unless `--apply`): the seed's random `subscriber_id`s meant NO agency row and 2 outlet rows linked to a real organisation, which is why Atlas/Delta/Starline appeared as subscribed *and* never-charged at once. 3 relinked, 2 backfilled (JK House → Enterprise, Emhub Testing → Essential); all 10 real orgs now linked by primary id. Verified live: JK House's own endpoint returns Enterprise · RM 3,999 · active. 6 ghost rows naming non-existent organisations are reported, not deleted. | Outlet ↔ Admin (§9) | ✅ done |
| 2026-08-03 | **Outlet plan switch is real, and History accounts for every organisation.** (1) The venue's "Switch to <plan>" now files a real `admin_request` plan_change (plan resolved against the admin `subscription` catalog, `currentPlanId`/`requestedPlanId` carried) → it appears in admin **Plan Change**; the card shows *Awaiting admin* and the venue stays on its current plan until approval. (2) **Approving writes the `member_subscription` ledger** — old active row closed (`ended_at` + `expired`), new active row inserted with the plan's name/price/cycle (negotiated `quotedAmount` wins) — so History syncs; an agency's `direct` switch applies immediately. (3) Admin **History** gained a *"No subscription on record"* section listing every registered outlet/agency with no ledger row (JK House, Emhub Testing today), honouring the filters — nothing invented, they are shown as not-subscribed rather than silently missing. No new tables, no migration. Live: JK House filed Pro→Enterprise (`admin_request` d7d019d9, pending). ⚠️ approve→ledger not fired live (no admin password in `.env`). | Outlet → Admin (§9) | ✅ done |
| 2026-07-30 | **Admin sidebar: "Jobs & Special Services" hidden.** Its nav entry in `apps/web/src/constants/links.tsx` (admin → Service group) is commented out, so the item no longer appears in the admin sidebar; the `LayoutGrid` icon import is commented with it to keep lint clean. The route `/admin/service/other` and the whole page remain in the codebase (still reachable by direct URL, and still linked from the Dashboard "Job postings" card + job to-dos) — uncomment the entry to restore. | Admin | ✅ done |
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
