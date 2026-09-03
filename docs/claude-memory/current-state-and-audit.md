---
name: current-state-and-audit
description: "START HERE to resume. 31 Jul 2026 (late): HEAD 3f86d2c, 9 unpushed, 12 files UNCOMMITTED in the working tree, nothing pushed by request. All 4 PV decisions ANSWERED, money reconciles 3/3, migration 0077 live. ONE job left: the write-time 400 for line-date-vs-shift. Baselines, house rules, audit URL"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9b16a92f-9864-42f6-9281-0cbe30a1cda2
  modified: 2026-08-02T13:29:39.548Z
---

# RESUME HERE — state as of 2 Aug 2026 (latest)

## ▶ THE PV BACKLOG IS EMPTY AND THE OVERTIME LANE IS FULLY EVIDENCED

HEAD **`bb416bc`**, branch `SL`, **tree clean, 24 unpushed. Nothing is pushed — the owner's call.**
Backend tsc **0**, probe **83/83**. `apps/web` tsc **121** (baseline).
⚠️ **`apps/mobile` baseline is 10, NOT 0 — and you must run `npx tsc -p tsconfig.app.json --noEmit`
from `apps/mobile`.** `tsconfig.json` there is a **solution-style** config (`files: []`,
`references`) that compiles NOTHING by design. See [[green-signals-that-lie]].

**Shipped this session:** the agency OT screen (`aef8790`), the admin PV page wiring + the receipt
allocator fix (`f4bbd00`), receipt numbers on the PR's own detail (`f03616d`), and the
**org-suspension security fix** (`bb416bc`). The audit artifact is **republished and current**.

**🟢 EVERY REFUSAL IN THE OVERTIME LANE IS NOW FIRED LIVE**, plus one real approval:
**RM175.00 = `700 ÷ 6 × 1.5`** onto PV-000002 (700→875), audit still 3/3. Live-proven: the 400s, the
404, no-claim 409, already-approved 409, the **unpriceable commission-only 409**, and the
**concurrent-claim race** (one 200 + one 409). **Nothing in this lane is unproven.**
📌 **The method is reusable and is its own memory — [[prove-guards-live-without-writing]].**

⚠️ **ONE approved overtime row is deliberately left on the shared DB** (`f5a1f227…`, RM175.00 on
PV-000002) as the live proof. A second, surplus one was created by mistake and has been **cleared**.

### 🔴 FOUR MISTAKES I MADE THIS SESSION — read these, they are the value

1. **I reported the GraphQL audit-log leak as an OPEN security item. It was fixed on 31 Jul**
   (`4acf5dc`). §9 had two adjacent lines — one ticked+closed, one an unticked copy kept for its
   notes — and I read the second without the first. **Re-derive from code, including entries that
   look open.**
2. **I filed "apps/mobile has never been typechecked" as a P0. WRONG, retracted the same day.** I
   pointed `tsc` at a solution-style config, saw a zero-file program, and reached for a *cause*
   instead of checking what I had aimed at. Then a `cat` from a stale shell directory printed a
   DIFFERENT project's config and I read that as corroboration. **Two signals agreeing were the same
   mistake made twice.** A zero-file program means "wrong target" far more often than "broken repo".
3. **A re-run of `fire-overtime-approval.ts` created a SECOND approval instead of retesting the
   first** — it selects on `overtime_status IS NULL`, so the row it just decided was no longer
   eligible. **Idempotent per CLAIM, not per RUN.** A writing script needs a `--report` mode.
4. **My own cleanup SQL would have CORRUPTED a voucher.** `DELETE` from `payment_voucher_line`
   leaves `subtotal`/`net` stale, because they are recomputed on INSERT. PV-000003 would have read
   1353.30 with 1203.30 of lines under it — **exactly the fault class this audit exists to catch.**
   **RULE: when the app maintains a derived value, undo through the app's own path**
   (`--clear=<id>` → repository `deleteLine()` → `recomputeTotals`), never raw SQL on the base row.

### 📌 The audit page went stale THREE times in one session — always in the same way

Patching the detailed entries is not enough. **Counters, chips and section ledes go stale
independently**, and they are what a reader believes: "Builds left 1 / OVERTIME CAN NEVER BECOME
MONEY" survived beside three new sections saying the opposite; "Security / scoping 0" sat beside a
confirmed-open hole; finding 15 stayed OPEN for two days after both its defects were fixed.
**A scan script now lives in the session scratchpad** that dumps every score tile, phase chip and
finding state in one pass — run it before any republish. **Demoting a section heading does NOT
neutralise the present-tense claims inside it.**

### ▶ WHAT TO DO NEXT

1. **Push, if the owner wants it** — 24 commits.
2. **Click the two new screens through on real logins** — `/agency/pv` (OT panel) and the admin PV
   page. Both are build-verified only; neither has ever been rendered.
3. **Decide `pending_review`**: those orgs can still sign in. Deliberate and conservative — holding
   them at the door is one line in `DENIED_ORG_STATUSES`, but it locks out everything created since
   that default was set.
4. Then the non-PV backlog below.

## ▶ Previous entry — THE OT SCREEN IS BUILT (`aef8790`)

HEAD **`aef8790`**, branch `SL`, **tree clean, 12 unpushed. Nothing is pushed — the owner's call.**
`OvertimeQueuePanel` + `use-agency-overtime` + two service calls. Pure frontend; no backend, no
migration. `apps/web` tsc **121 = the documented baseline, 0 from these files**, both new files biome
clean, **`vite build` succeeds**.

**🔴 THE FINDING WORTH KEEPING — the obvious home for the screen was WRONG.** `/agency/pending` is
the approvals page, so an OT worklist looks like it belongs there. But that whole route bails out
with *"Finance role cannot approve PR sign-ups"* unless the caller holds `approvePrSignups`, and
**agency FINANCE does not hold it** — while finance is one of the two roles the server's
`agencyOwnerOrFinance` guard lets decide overtime. It would have hidden the screen from half the
people entitled to act, and the symptom reads as a **broken role**, not a misplaced screen — the same
shape as [[phase-flags-vs-permissions]]. It went beside `DisputeQueuePanel` on **`/agency/pv`**,
above the week tabs: an undecided claim is *why* a week below refuses to send.

Three rules in the code, do not undo them: **the screen derives no money** (`amount` + `week` are
rendered as the server priced them); **the 409s are surfaced verbatim** via `toMutationError`, never
flattened — "already decided", the concurrent loser, and the unpriceable commission-only claim are
each actionable; **the refetch is `onSettled`, not `onSuccess`**, because a 409 means the list is
stale in exactly the case where the write failed.

⚠️ **NEVER RENDERED IN A BROWSER** — `/agency/pv` needs a real agency password login. And **the
published audit is STILL not updated** — now owed for two slices. Do that FIRST next session (WebFetch
the live URL, patch, republish with the **same** `url`; the page is ~240 KB, never rebuild it).

**Next: fire the whole lane live in one pass** — check out a shift late on the PR app → the claim
appears on `GET /shift-assignment/overtime/pending` → approve on this new screen → the `ot` line
lands on that week's voucher → `audit-live-vouchers.ts` still OK → the week can be sent.

## ▶ Previous entry — THE OVERTIME BACKEND BUILD (the PV backlog has NO BACKEND BUILD LEFT)

HEAD **`bc1ef05`**, branch `SL`, **tree clean, 9 unpushed. Nothing is pushed — the owner's call, ask
first.** Backend tsc **0** (230 files, confirmed with `--listFiles`; a bare root run reports a
meaningless 0). `probe-pv-audit.ts` **83/83**, up from 44. `audit-live-vouchers.ts` **3 of 3 OK**.

`5e0dbee` shipped `PATCH /shift-assignment/:id/overtime` (approve|reject, `agencyOwnerOrFinance`) +
`GET /shift-assignment/overtime/pending` + **migration 0079 (`overtime_decided`), APPLIED and verified
live** — the enum now holds 10 values. Do not re-apply; it is idempotent anyway.

**🔴 THE TWO FINDINGS THE BUILD EXPOSED — worth more than the endpoint, do not re-derive them:**

1. **The clamp made the audit flag every legitimate approval.** `maxOvertimeCents` budgeted overtime
   from `check_in_at`/`check_out_at`, but **check-out CLAMPS `check_out_at` to the scheduled end** —
   so a shift that genuinely ran two hours late leaves stamps describing one that finished on time,
   and the budget derives to **0.00**. Correctly-approved money would have read as invented money.
   The **recorded minutes** are now primary; the stamp derivation survives only as a fallback for rows
   with no decision (so pre-0077 vouchers do not start failing). ⚠️ **The pure-function fix reached
   nothing until BOTH `auditVoucher` call sites started SELECTing `overtime_minutes` +
   `overtime_status`** — `payment-voucher-generator.ts` and `audit-live-vouchers.ts`. A fix in a pure
   function is not a fix until its callers feed it.
2. **A double-clicked Approve paid twice.** Read → see `pending` → check no line → insert: two
   concurrent requests pass every step, because **a read-then-check is not a lock**. Now claimed with
   `UPDATE … WHERE overtime_status='pending'` (`claimOvertimeDecision`), so the transition is the
   mutex. The decision is stamped **before** the money, and a failed write **reverts the claim** —
   *an approval with no line is recoverable, a line paid twice is not.*

Smaller rules now in code: the line lands on the week the shift was **WORKED** (`weekOfDate()`, pure
string maths); the **`-ot` dedupe ref** is written, never the `component` column; the line is dated
the shift's own date so it *passes* `assertLinesAgreeWithShifts`; an unpriceable commission-only claim
is a **409, not a 0.00 line**. New module `payment-voucher/overtime-line.ts`.

**WHAT IS LEFT (all in `TEST_SCRIPT.md` §9):** the agency OT **screen** (pure frontend — both
endpoints exist and price server-side, so **do not let the screen derive its own figure**); the admin
PV page (`resolveDispute` + `receipts[]` come back and are never rendered); receipt numbers on
self-log/OCR + a PR detail button; and **EVIDENCE** — no approve, reject or 409 in this lane has ever
been sent to a running server.

⚠️ **The published audit artifact was NOT updated for this slice** (context ran short; the page is
~240 KB and a careless republish drops content). That is the first job next session — WebFetch the
live URL, patch it, republish with the **same** `url`.

### ▶ START THE NEXT SESSION WITH THIS ORDER

1. **Republish the audit** (the owed item above).
2. **The agency OT screen** — the only thing standing between the endpoint and anyone using it.
3. **Fire the whole overtime lane live in one pass**, which clears the evidence item for this feature
   at the same time: check out a shift late on the PR app → the claim appears on
   `GET /shift-assignment/overtime/pending` → approve → the `ot` line lands on that week's voucher →
   `audit-live-vouchers.ts` still OK → the week can now be sent.

⚠️ **A STALE CHECKBOX IN `TEST_SCRIPT.md` §9's P0 block, corrected 2 Aug:** it still lists
*"Add the `(pr_id, week_start)` unique constraint"* as open. **It is DONE** — shipped as migration
**0078** (`pv_one_per_pr_week`), and the live `drizzle.__drizzle_migrations` ledger confirms
`when=1785500000000` applied. Another instance of [[audit-entries-are-leads]]: **the §9 P0 checkboxes
go stale independently of the prose above them.**

⚠️ Also confirmed closed this session, in case the old notes still say otherwise: the **mid-week send**
hole (`9ecd2e1`, "a week that has not finished cannot be sent") and the **write-time 400** for
line-date-vs-shift (`cdd04f6`).

### What is left BEYOND the PV lane — leads, not work orders

Re-derive each from the code first; the last two sweeps were wrong 5 for 5, **including on entries
claiming something was FINE**. Carried, not verified on 2 Aug:

- **Five stale `assigned` rows** (Vicky, Velvet 23 24–26 Jul + Emhub 27–28 Jul) never expire, so
  staffing counts people who never turned up. Mobile hides them; the server does not.
- **[[write-never-landed-check-first]]** — still OPEN, waiting on the coworker to retry while watching
  the backend console.
- **Per-session logout** — blocked on a mechanism decision (token version vs denylist).
- **The web auth context has no signed-in user id** — one field, fixes "this is you" everywhere.
- **Agency/outlet accounts have no admin screen at all** ([[accounts-cannot-be-removed]]).
- **[[demo-data-leaks-into-real-sessions]]** — incl. the `owner@atlas-agency.my` fake-JWT session. A
  pre-pilot gate.
- **[[outlet-swap-feature-build]]** — only the model file exists, nothing applied.
- **Never fired:** `pr_rating_low`, `shift_cover_needed`, `pv_day_review_pending`, collections
  issue→settle, MFA enrol→challenge, and **anything on a real device**.
- **Parked by the owner:** mailer (no API key), OTP (WhatsApp business verification lead time),
  platform fee 2.5% vs 5%.

## ▶ Previous entry — the OT endpoint, and the decision is ALREADY MADE (now DONE, see above)

HEAD **`f616891`**, branch `SL`, **tree clean, 7 unpushed.** Nothing is pushed — **that is the
owner's call, ask before pushing.** Backend `tsc` **0**; `probe-pv-audit.ts` **44/44**.
⚠️ **Run `tsc` and the probe from `apps/backend`, never the repo root** — a root
`npx tsc -p tsconfig.json` silently picks the ROOT config and reports a meaningless 0. That happened
this session and the clean result was worthless.

**🔴 DO NOT RE-ASK THE OVERTIME PAYOUT DECISION. It is answered** (owner, 31 Jul):
> *"the OT should be sent together with the week PV it originates from, as that is the most fair and
> direct."*

So overtime is paid on the voucher of the week it was **WORKED**. The consequence is already shipped
(`882afd7`): **an undecided OT claim blocks its own week's send**, a fourth rule in
`voucherSendGate`. That means **there is no reopen-a-sent-voucher path to build** — a week cannot
close with a claim outstanding, so the awkward case is prevented, not handled. Do not design an
amend flow.

**THE NEXT JOB — `PATCH /shift-assignment/:id/overtime` (approve/reject) + the `component='ot'`
line.** Everything it needs already exists:
- Columns (migration **0077**): `overtime_minutes` / `overtime_status` / `overtime_amount` /
  `overtime_decided_at` / `overtime_decided_by` on `shift_assignment`.
- Minutes are **recorded at check-out** (`7e47502`) via `features/shift-assignment/overtime.ts`.
- Gate read: `shiftAssignmentRepository.listPendingOvertimeForPrWeek({prId, fromDate, toDate})`.
- Decided policy: approver **`agencyOwnerOrFinance`**, rate **`daily ÷ 6 × 1.5`**
  (`pr-rate.ts`; matches `outlet_workspace.ot_after_hours` = 125 at every outlet).
- ⚠️ `component='ot'` is derived in the REPOSITORY from a `ref` whose dedupe field **ends `-ot`**
  (`payment-voucher-component.ts`) — write the ref in that shape rather than setting the column.
- ⚠️ The line write must pass `assertLinesAgreeWithShifts`, so **date the OT line the shift's own
  `shift_date`**, not the approval date.

Then: the agency OT screen · admin PV page (`resolveDispute` + `receipts[]` come back from the API
and are never rendered) · receipt numbers on self-log/OCR + a PR detail button · and **fire the
400/409/send-gate refusals live**, which none of this session's four refusals have been.


## ✅ EVERYTHING IS PUSHED AND MERGED — the 45-unpushed-commit era is over

HEAD **`cdd04f6`**, branch `SL`, **working tree CLEAN, only 1 commit unpushed.** `SL` was pushed and
merged into `main` (`9e6bad3`), which also took in **jk's PR #40**; `origin/main`, `origin/SL` and
`origin/jk` all sit on `9e6bad3`. ⚠️ **The merge RENUMBERED two migrations** — jk had independently
authored an `0076` the same day, so overtime/bank became **`0077_overtime_approval_and_bank`** and the
one-voucher-per-PR-per-week index became **`0078_pv_one_per_pr_week`** (`d09e871`). Both are
`IF NOT EXISTS`; neither re-runs on the shared DB. **Anything citing "migration 0077" for the
constraint is stale — it is 0078.**
⚠️ The **auto-commit hook fires mid-slice** and writes its own `TEST_SCRIPT` entries describing the
state at that instant. **Re-read `TEST_SCRIPT.md` before trusting a fresh entry you did not write.**

## ✅ THE ONE JOB LEFT IS DONE — the line-date rule now REFUSES (`cdd04f6`)

`assertLinesAgreeWithShifts` lives in the **repository**, not the controller, so all four insert paths
(`create`, `update`'s delete-and-reinsert, `createReceiptWithLines`, `addLine`) get it — a
controller-only check would have left the **PR self-log and the weekly generator** writing unchecked
money, which is where every live fault came from. Three details worth not re-deriving:

- It runs **inside the caller's transaction** (the shift read cannot race a move; a refusal rolls the
  whole write back) and, on `update`, **before the delete** — that path wipes and re-inserts every
  line, so a mid-way refusal would have left the voucher with **no lines at all**.
- **Two cases pass on purpose:** a ref naming no assignment (a scanned drink, `ORD0389:0`) and a ref
  naming an assignment that cannot be found — refusing an unknown id turns a missing join into a
  failed payroll write, and `auditVoucher` reports that separately.
- HTTP owns only the status: `LineDateConflictError` → **400** via `respondIfLineDateConflict` in the
  six line-writing handlers. Without it they hit the catch-all 500, and a client told *"internal
  server error"* retries the same bad date forever.

⚠️ **NOT fired against the live DB.** Proving a refusal needs a real bad write on the shared database.

## 🟠 WHAT IS ACTUALLY LEFT — one build, one live-fire, two undecided hazards

1. **The OVERTIME build** (~1–2 days) — the only build left. Policy is answered (approver
   `agencyOwnerOrFinance`, rate `daily ÷ 6 × 1.5`) and migration 0077 gave it columns; **none of the
   behaviour exists**: check-out still clamps `check_out_at` and discards the minutes, no approve/reject
   endpoint, nothing writes the `component='ot'` line, no agency screen. **Blocked on ONE question:
   what an approval does when that week is already `sent`** (the duplicate guard 409s a new voucher).
2. **Fire the 400 / 409 / unique index live and from the phone** — all three are unit-proven only.
3. **An agency can still mark a CURRENT-week voucher `sent`** — that mid-week send is what created the
   duplicate pair; nothing refuses it.
4. **Five stale `assigned` rows** (Vicky, Velvet 23 24–26 Jul + Emhub 27–28 Jul) never expire, so
   staffing counts people who never turned up. Mobile hides them; the server does not.

## ✅ ALL FOUR PV DECISIONS ARE ANSWERED — do NOT re-ask them

1. **Admin may resolve a dispute — Option A**, as an *escalation* path only; the rest of the admin PV
   page stays read-only. Chosen over agency-only because that leaves a PR **no recourse if their
   agency goes quiet**. ✅ The missing `agencyOwnerOrFinance` gate is **on** the resolve route now —
   and `guard()` waves admin through by design, so it narrows agency members **without** closing the
   escalation. Sole caller verified first (already UI-gated on the same set).
2. **The bad vouchers were TEST DATA → wiped and regenerated.** All three repair questions collapsed
   into one act. `audit-live-vouchers.ts` now reports **3 of 3 OK, 0 flagged**.
3. **For REAL payroll the rule is VOID + REISSUE, PR notified** — never a silent in-place edit, never
   the wipe script.
4. **`(pr_id, week_start)` constraint** — shipped as migration **0077**, verified live by
   `probe-0077.ts` **5/5** including a real duplicate insert being refused.

⚠️ **Two claims that were WRONG, corrected — do not repeat them:** the agency dispute queue
**already exists and works** (`DisputeQueuePanel` + `use-agency-disputes` on `/agency/pv`), and
"wire up the admin PV page" was **backwards**. **The sharpest instance yet of
[[audit-entries-are-leads]].**

## Earlier that day — where the PV work got to (7 commits, branch `SL`, nothing pushed)

`2cb70b8` the source-record audit · `6d0b1cf` the live run (**3 of 4 vouchers fail**) · `17480d7`
agency door + balance bug + write gates · `ee68473`+`19333f2` migration **0076** applied ·
`f93e64a` doc repair · `16c6e7d` the out-of-week **third door**.
Backend tsc **0**, probe **26/26**. Detail in [[voucher-never-checked-against-source]].

**Still open:** the write-time 400 above, and the **overtime build** (**policy already answered —
approver `agencyOwnerOrFinance`, rate `daily ÷ 6 × 1.5`; do not re-ask**), blocked on one design
question: *what an approval does when that week is already `sent`*, since the duplicate guard 409s it.
The three voucher repairs and the dispute decision are **CLOSED** — see above.

## Three bugs the wipe exposed that nothing else could (all fixed, all in the working tree)

1. **Voucher numbers were RECYCLED on delete.** `nextVoucherNo` used `count(*) + bump`, so after
   deleting three vouchers the next was issued **`PV-000002` — the number the deleted `sent` document
   held**. Two documents, one name, one already downloaded by a PR. Now `max(<numeric suffix>) + bump`.
2. **A catch-and-retry inside a Postgres transaction is a NO-OP.** A failed statement aborts the whole
   transaction, so the clash retry's next `SELECT` returned `25P02` — not a voucher-no conflict, so it
   was rethrown, and the loop could never reach attempt 2. Each attempt now runs in a **SAVEPOINT**.
   Fixed in **both** places, including `getOrCreateCurrentWeekDraft` (the PR self-log path, where it
   surfaced as a PR unable to log a drink). **Grep for other `try { insert } catch { retry }` inside
   `db.transaction`.**
3. **`generate-weekly-pvs.ts` never imported `@/env.js`** → died on a *SASL client password* error
   naming the auth mechanism, not the cause. `run-weekly-payout.ts` had the same defect; both fixed.

## The audit artifact — updated, and one caveat

Republished twice (URL unchanged). **Blocking tile is now 0**, old tile hidden not deleted, and the
stale *"constraint is blocked behind the duplicate pair"* line is corrected. ⚠️ **The page is ~240 KB
and its section ledes go stale independently of the entries beneath them** — other lines may still
describe the vouchers as broken. ⚠️ **Patch the WebFetched LIVE copy, not the scratchpad file** — the
scratchpad copy was ~7 KB stale and publishing it would have silently dropped content.

⚠️ **An auto-commit hook fires MID-SLICE in this repo** and writes its own `TEST_SCRIPT` entries
describing the state at that instant. It left X40 claiming migration 0076 was unapplied minutes after
it was applied. **Re-read `TEST_SCRIPT.md` before trusting a fresh entry you did not write.**


**Branch `SL`, HEAD `892d57e`, working tree CLEAN, 45 commits unpushed** (the user pushes manually;
`origin/main` is at jk's PR-#36 merge `11652f8`). The changelog's head block in `TEST_SCRIPT.md` §10
is the one-paragraph version of everything below.

⚠️ **OPEN, unresolved at session end — [[write-never-landed-check-first]].** A coworker reported a
PR-app **receipt** and a PR **dispute** both invisible on the agency side. The shared DB holds
**nothing from 31 Jul** — newest receipt 30 Jul 02:51, and **no dispute has ever been recorded on any
voucher**. So the writes never landed and the agency side is not implicated. Waiting on him to retry
while watching the backend console. **Do not fold this into the payroll work** — nothing in the P0
block below would make a receipt disappear.

# 🔴🔴 BEFORE ANYTHING ELSE: THE MONEY IS WRONG — [[voucher-never-checked-against-source]]

Found 31 Jul, `TEST_SCRIPT.md` §8 X36 + a new **P0** block in §9. A week worth **RM703.60** produced
**two vouchers totalling RM2,285.08**, and the correct one is the one still **unsent**. Wages for a
day nobody worked, **"113.1h" of overtime on a 6-hour slot**, a line dated six weeks outside its own
voucher, one drink paid twice (`ORD0389` vs `ORDO389`). **`PV-000001` is already SIGNED and its wages
match no tier rate.** The root cause is one sentence: **nothing compares a voucher against the records
it was built from.** The memory carries the method and the 5 assertions that catch all of it.
**Do not demo payroll. Do not let anyone treat a voucher as payable.**

⚠️ Half of this was already written down (the OT bug is named in [[pv-money-classification]], the
duplicate voucher in §9) and **never ranked**, so nobody connected it to "is payroll correct?".
**A finding that is recorded but not ranked is not a finding.**

🔴 **THEN — follow-ups, all in `TEST_SCRIPT.md` §9:**
1. ✅ **Actions column replicated — DONE `f365537`** to `pr.tsx` + `legacy-member.tsx`'s PR rows.
   ⚠️ **The §9 entry was WRONG about `agency.tsx` and `outlet.tsx`: those list ORGANISATIONS**, so
   `row.id` is an agency/outlet id and `PATCH /user/:id/status` would address a row that is not
   there. Shared logic now in **`apps/web/src/hooks/use-account-actions.tsx`**;
   `revokeAdminRole` → **`revokeUserRole(userId, roleName)`**. **NEW GAP FILED:** nothing lists
   agency/outlet **accounts** at all — they can only be disabled over the API.
   **Owed: a 1-minute click-through of `/en/admin/user-management/pr` on a real admin login.**
   I proved the three API calls, not the rendering.
2. **Per-session logout** — needs a mechanism decision first (token version vs denylist).
3. **Give the web auth context the signed-in user's id** — one field, fixes "this is you" everywhere.
Plus the standing **device run** of the PR app ([[mobile-app-runs-on-web]] covers the browser half).

⚠️ **I do not type passwords into login forms.** For live proof, write a throwaway probe under
`apps/backend/src/scripts/` that reads `process.env.DEFAULT_ADMIN_EMAIL/PASSWORD` itself, run it with
`npx tsx --tsconfig tsconfig.json`, then delete it. That covers the API layer; the browser
click-through stays the owner's. **A probe bug looks exactly like a product bug** — mine "found" a
missing `pr` role that was really the script reading `roleId` where the backend returns `id` (the web
mapper renames it).

⚠️ **Rows this session deliberately left on the shared DB:** 1 accepted dispute + resolution note on
Alice's voucher, 1 two-star rating tagged `audit-test`, 1 settled `collection_invoice` (Velvet 23,
wk 20 Jul), and the **`ZZ REVOKE TEST`** account — inactive, roleless except a `Test` role. The
receipts on voucher `7bf3962e` are now `verified` (the resolved-dispute arm), and `RCP-000007`
carries a real `reviewedBy`. **Migrations 0074 + 0075 applied.**

✅ **Account controls now have an admin SCREEN** (`49d3220`, §8 X32) — see
[[accounts-cannot-be-removed]]. ✅ **A disabled account's live token dies on the next request**
(§8 X31) — I had recorded the opposite without checking.

📌 **Cross-device mirror half-updated:** `docs/claude-memory/` gained 3 files (`innocenz-run-the-pr-app`,
`innocenz-account-and-phone-rules`, `innocenz-receipt-lifecycle`) + index. **The Excel "Claude Code
Memory" tab is NOT yet updated** — the other half of the `CLAUDE.md` rule.

✅ **The permanent-admin hole is CLOSED** (`40c9098`, §8 X30) — see [[accounts-cannot-be-removed]].
**Nothing is open: no build, no blocking finding, no never-fired path.** What remains is a **device
run** and the follow-ups listed in `TEST_SCRIPT.md` §9.

🎉 **THE NEVER-FIRED LIST IS EMPTY** (§8 X28, owner said "fire all of them"): the voucher-number
allocator (`PV-000005`), `pv_day_review_pending`, the **send that succeeds**, a **dispute that
succeeds** + the APPROVED→VERIFIED arm, `pr_rating_low`, `shift_cover_needed`, MFA
enrol→confirm→challenge, collections issue→settle, and the day-review **stale path**.
🔴 **The cleanup found the day's worst finding: [[accounts-cannot-be-removed]].**
**Rows deliberately left on the shared DB:** 1 accepted dispute (+ resolution note) on Alice's
voucher, 1 two-star rating tagged `audit-test`, 1 settled `collection_invoice` (Velvet 23, wk
20 Jul). Cleaned up: the ZZ TEST voucher, the throwaway admin, Alice's cancelled shift (restored),
her voucher back to `pending_review`.
**Still owed: a DEVICE run.**

✅ **Sweep re-run after this session's auth change: 19/19** (§8 X27). All 4 logins work, the new
receipt routes are 200 agency / 403 PR / 403 outlet. ⚠️ **`/notification/mine` DOES NOT EXIST** —
the router is mounted at **`/notification`** and scopes server-side; my test asserted the wrong path.

✅ **THE AUDIT HAS NO OPEN BLOCKING FINDING AND NO OPEN BUILD.** Finding 15 closed 30 Jul: the
export's money is summable (`3704481`) and **a voucher has its own number** — `PV-000001`, migration
**0075**, replacing `PV-<weekEnd>` derived in FIVE places (backend export + 4 in the PR app). Live:
PV-000001…000004, the three vouchers sharing one week now differ, filename follows.
⚠️ **The voucher-number ALLOCATOR has not run** — existing rows came from the backfill; the insert
path fires on the next new voucher. Watch for `Could not allocate a voucher number`.
**Migrations applied: 0074 + 0075.**

🎉 **THE PR APP NOW RUNS — [[mobile-app-runs-on-web]]** (`10c047b`). First execution of anything in
`apps/mobile`, in any session. It found a blocker in its first minute, and the blocker is now fixed:
✅ **[[pr-phone-login-mismatch]] — `user.phone_num` WINS** (`e936030`). Reads resolve through the FK,
login matches on digits. **The `DROP COLUMN` is deferred** — 3 live readers, incl. jk's export.

🟢 **THE RECEIPT LIFECYCLE IS COMPLETE — [[receipt-lifecycle-spec]].** Backend `ab92624`
(migration **0074**), agency screen `24ad140`, live-fire fix `9014b5d`, PR's two mobile sections
`92b5223`. **Fired end to end on real agency + PR logins** (`TEST_SCRIPT.md` §8 X21), shared DB
restored afterwards.
⚠️ **Three things NOT proven:** the PR half has never been RUN (nothing in `apps/mobile` ever has),
and a send that SUCCEEDS + a dispute that SUCCEEDS were skipped on purpose — both leave permanent
rows on the shared DB.

📌 **jk's EXPORT LANE IS NOW AUDITED** (the rest of the merge is not). Ticket design + scoping sound;
2 defects open — the workbook's money columns are **text** so Amount cannot be summed, and
`voucherRef()` = `PV-<weekEnd>` so **every PR's voucher for a week shares one number and filename**.

🎯 **THE PV DAY REVIEW IS COMPLETE — panel `51788dc`, list fix + notification `9966b4f`, status
deep-link `34bacbc`.** All live-verified. Migration **0073** applied (notification enum now 9 values).

📌 **`check:drift` is an `apps/backend` script, NOT root**: `cd apps/backend && npm run check:drift`.
Root has only `migrate` / `migrate:deploy` — an older note saying `pnpm check:drift` from root simply
fails. It also compares against **`0070_snapshot.json`**, so it cannot see 0072/0073; verify newer
migrations by direct query.

⚠️ **The Browser pane's console buffer KEEPS HISTORY across reloads.** Mid-edit HMR errors
(`X is not defined`) persist in it and read like live failures. Check the module timestamp in the stack
(`pv.tsx?t=…`) against the current one, or just confirm the component renders — an error boundary would
replace the UI. I nearly reported a clean screen as broken.

**No code items from the audit remain open. What is left is EVIDENCE**, and two producers have never
run: `pv_day_review_pending` (needs a payout run on a week that genuinely has unreviewed vouchers — the
last complete week's are already `sent`) and the day-review **stale path**. See the never-fired list
below.

Both questions raised on 30 Jul were answered by the user and built the same day:
**(a)** Payroll list → *keep Sunday tabs, add This Week*, matching by **containment**
([[payroll-list-hides-real-vouchers]]); **(b)** waiting voucher → *a new notification kind*
(`pv_day_review_pending`, one per agency per run, owner+finance only).

⚠️ **[[audit-update-cadence]] is now a STANDING RULE, stated explicitly 30 Jul: update the published
audit after EVERY change, not at session end.** I broke it once that day (committed `4f2da0e`,
reported back, left the page stale) and was corrected. The republish mechanics are in that memory —
**pass the same `url` or you mint a new link**, WebFetch first or the publish 409s, never rebuild.

## Live inventory (queried 31 Jul) — what a test run actually has to work with

**Logins exist for every role:** agency **4 accounts / 4 active**, PR **6 / 6**, outlet **5 / 5**,
admin **2 / 2**, plus a `Test` role with 1 inactive account (`ZZ REVOKE TEST`).
**Outlets: 7, all geo-pinned.** **Vouchers: 4** — `PV-000001` signed, `PV-000002` sent,
`PV-000003`+`PV-000004` pending_review (so the day-review and send gates both have live entry
points). **Shifts: 18** — 13 confirmed, 5 draft.

**Baselines — judge only files you touch:** backend tsc **0**, mobile tsc **0**, web tsc **121**.
⚠️ `CLAUDE.md` claims a backend baseline of "26 pre-existing TS2883 errors"; every run this session
reported **0**. The documented and observed baselines disagree — worth confirming, don't panic if
you see 0.

**Run `pnpm install` first.** jk's merge added `pdfkit` + `exceljs`; the backend will not typecheck
without them.

## Three house rules that will bite you

1. **`TEST_SCRIPT.md` must be renewed on EVERY code slice** — a Stop hook blocks the turn otherwise.
   §8 done / §9 next / §10 changelog (newest at top). Rule lives in `CLAUDE.md` → "Doc roles".
2. **The DB is REMOTE and SHARED** (`103.224.93.109:6543/innocenz-test`) — jk uses it too. Keep
   probes read-only; GateGuard blocks cleanup `DELETE`s, so a careless write is permanent.
3. **Never edit source files via PowerShell `Get-Content -Raw` + `WriteAllText`** — it reads UTF-8 as
   ANSI and mangles every em dash. It cost a repair commit this session. Use the Edit tool.

## What to do next — in order

0. **RESUME HERE — what is left is EVIDENCE, plus one deferred migration**
   (the `DROP COLUMN pr.phone` in [[pr-phone-login-mismatch]], which needs jk's export repointed
   first).
   ✅ The receipt lifecycle is DONE ([[receipt-lifecycle-spec]]) and **nothing in the audit's build
   column is open.** Still never fired: `pv_day_review_pending`, `pr_rating_low`,
   `shift_cover_needed`, collections issue→settle, MFA enrol→challenge, a **device** run — plus the
   two receipt paths skipped on purpose (a send and a dispute that SUCCEED).
   ✅ **CLEARED 30 Jul:** the day-review **STALE path** fired for real (an agency line correction
   moved a day 330¢ → 400¢ and it came back `stale: true`), and the **mobile app ran**.

1. ✅ **PV day review — COMPLETE, all three parts.** Panel `51788dc` (hook + panel + send gating, all
   four gate states live-verified, decisions cleared afterwards — corrected gate rule in
   [[pv-day-review]]); list reachability + the waiting-voucher notification `9966b4f`, status deep-link
   `34bacbc` ([[payroll-list-hides-real-vouchers]]).

   ⚠️ Left unfired on purpose: **`pv_day_review_pending`**. Firing it needs a payout run against the
   shared DB, and the last complete week's vouchers are already `sent`, so a run today proves nothing
   about this path while still drafting collection rows. Do it after the next Monday cron, or on a week
   with genuinely unreviewed vouchers.
2. **Audit the REST of jk's merged lane** — the signature pad and the mobile sign flow. ✅ The **export
   lane is done** (30 Jul): ticket design + scoping sound, migration `0071` additive, both formats
   download 200 for a real PR. **2 defects left open, both in `TEST_SCRIPT` §9:** the workbook writes
   money as **text** (`"3.60"` — Amount cannot be summed), and `voucherRef()` = `PV-<weekEnd>` so
   **every PR's voucher for a week shares one number and one filename**. Also noted: the workbook and
   print HTML carry the PR's **IC + phone**, and the print/PDF URLs are unauthenticated for 5 minutes.
3. **Fire the PV day-review STALE path live** — the only unproven part of that feature.
4. **The three standing decisions** — duplicate `pr` rows, `/mine` scope, outlet access to staff
   coordinates + venue PII. All in [[client-readiness-verdict]].

**Readiness: ~60% to production, ~85% to a supervised pilot. NOT ready for general client use** —
the full reasoning, the 4 pre-pilot gates and what this audit does NOT cover are in
[[client-readiness-verdict]]. Mailer is **parked — the user has no API key.**

## Two verification passes that pay for themselves

Both were invented this session and both found real bugs in minutes after days of clean typechecks.
**Re-run them after any auth, money or access change:**

- **[[live-role-sweep-30jul]]** — API level, all 4 roles, real logins. Found the `passwordHash` leak
  in its second minute.
- **[[portal-clickthrough-30jul]]** — browser level, both web portals. Found a label bug on sight.

## Shipped 30 Jul, LATEST session — the decisions became code

`4681fb3` **the four owner decisions, three of them as code** ([[pv-day-review]] for D4/D5,
[[user-list-hash-leak]] for D3) · `4f2da0e` **day-review service layer** (web, types + 2 calls, no UI).

**Both were live-fired on the shared DB with test rows cleaned up** — see `TEST_SCRIPT.md` §8 X12/X13.
Notable proofs worth not re-doing: send 409s on unreviewed days AND on a held day with the voucher
left at `pending_review` both times; outlet sees 0 of 17 rows carrying identity docs with all 17
names intact while the agency still sees 6 IC numbers on the same call.

**Not proved, and do not claim it:** the own-record redaction exemption. No outlet account in the
shared DB has a populated `user_profile`, so an exemption there is indistinguishable from an empty
profile. The leak direction is proven; if the exemption is wrong it shows someone MORE of their own
data, not less of someone else's — cosmetic, not a leak.

## Shipped 30 Jul (earlier session) — 9 commits after the merge

`eae3099` merge of main (one conflict, [[pv-detail-merge-convergent-fix]]) · `9a6eecc` **CRITICAL**
`GET /user` password-hash leak fixed ([[user-list-hash-leak]]) · `04e8eda` doc · `50e632c` check-in
card precision label · `fa44ce4` shift-timing double-booking guard · `b7610a1` doc · `b73aa93`
**overnight shift clashes** ([[shift-overlap-rules]]) · `ef45445` **PV day review backend**
([[pv-day-review]]) · `d62a5b6` doc.

Everything below this line is history from earlier passes — still accurate, but the resume
information is above.

**READINESS CALL (30 Jul): no general client use, yes a supervised pilot with 4 gates.** Percentages,
gates and pilot shape in [[client-readiness-verdict]] — which also records that **this audit is a
wiring audit, not a launch checklist**, so finishing it does not make the app shippable.

## The audit — keep it updated, do not rebuild it

**https://claude.ai/code/artifact/0c66cb02-c767-4a67-ad9d-617e399983b3**

A role-by-role page: which functions reach the DB, all 11 findings, the Phase A–H board,
per-role screen tables, and a footer stating what was NOT verified. Source lives in the
session scratchpad, so a NEW session has no file to edit — **fetch the URL with WebFetch,
then republish by passing that same `url` to the Artifact tool**, or it mints a new link.
The user asks for it to be updated after almost every piece of work; treat that as standing.

Its own convention: a closed finding stays on the page struck through with a green "fixed"
note rather than being deleted. The point is to show what moved.

## Shipped 29 Jul 2026 (all committed, none pushed)

`da4657b` register role-escalation closed · `6793d54` notification read API ·
`5672572` bells wired · `70ec785` PR sign endpoint · `6c93727` Σ=0 check ·
`0ccf303` platform_config reshaped · `276e4ab` ratings read path ·
`3be970a` 4 admin redirects · `41386b9` 3 ungated routers gated **and scoped** ·
`52273af` penalty proposals · `716d9a0` rating-low notify · `d9ba336` sick cover ·
`deb7335` collections · `b32df83` TOTP MFA + login lockout.
Migrations **0066–0070** applied; drift clean (36 tables / 0 problems); 71/71 applied.

## Shipped 30 Jul 2026 (7 commits, UNPUSHED) — collections got its frontend

Collections had shipped 29 Jul with a table, repository, controller, routes and the weekly producer
and **no frontend on either portal**. `viewCollections` was an agency permission with no screen.
**All seven commits below are frontend-only: no backend, no migration, no schema change.** The last
four drifted past collections into the subscription screens, the outlet phase gate and mobile — which
is where all three real bugs were found. The pattern is worth keeping: the bugs were not in the new
feature, they were in the screens next to it.

- `0dd7164` — **agency side.** New `services/collection-invoice` (list/issue/settle) +
  `use-agency-collections` + a section on the agency Subscription screen. Actions gate on
  `confirmReconciliation`, NOT `editSettings` — finance is read-only for the card but is the role
  that chases receivables.
- `1929a22` — **outlet side.** `use-outlet-collections` + a section on the outlet Subscription
  screen, gated on `viewBilling` (owner + finance, not ops). **Read-only on purpose:** issue/settle
  are `requireRole('admin','agency')`, because the outlet is the one party with an interest in
  claiming it paid. Buttons there would just 403.
  Also extracted `agency-portal/lib/collections.ts` — `sumCollectionRm` (integer cents),
  `collectionAmountRm`, `collectionWeekLabel`, `collectionStampLabel`, `COLLECTION_AGING_PILL` —
  after `sumRm` turned out to be a verbatim copy in both hooks. **Import shared helpers from there**,
  do not add a third copy.
- `7baf1ec` — **outlet reconciliation banner REBASED** (`OutletReconciliationBanner.tsx`). It
  compared outlet sales vs the PV total off the demo store. Backed path now compares **what the
  agency billed** (`collection_invoice`) vs **the outlet's own shift records**
  (`shift_assignment.pay_amount` via `useOutletSalesReport().buildReport().totalCost`) — same source
  column, so they should agree. The newest statement defines the week, so the client never derives
  one. No Confirm (nothing persists it), hides when the two agree, gated `viewBilling`.
  **Demo sessions keep the old banner verbatim** — a fork, not one component fed two ways.
- `7f72fbc` — **the agency's OWN subscription record** (the other direction of money), from
  `member_subscription` via the existing `use-agency-subscription`. **Renamed from "Billing history"
  to "Subscription record" on the backed path, on purpose:** that table is a *"who subscribed and
  when"* ledger — one row per SUBSCRIPTION with `startedAt`/`endedAt`/`amount`/`billingCycle` — and it
  is **not one row per charge and holds no payment state**, so nothing built on it can say a week was
  paid. Status is therefore NOT collapsed to paid/unpaid: `active|past_due|cancelled|expired` each get
  their own label. Used a **separate** query from the existing `memberQuery` (which filters
  `status:"active"` and is read as `data[0]` for the current plan) — widening that one would let a
  cancelled row become the current plan.
- `4ab4da2` — **the outlet was telling venues a CANCELLED subscription was "Paid".**
  `invoiceFromMemberSubscription` collapsed the 4 statuses into the demo card's pair
  (`past_due ? PENDING : SETTLED`), so `cancelled`/`expired` → SETTLED → green "Paid" pill.
  Fixed both the mapping AND the wider claim: `member_subscription` has **no payment state at all**,
  so neither screen reports payment from it now. Extracted
  **`agency-portal/lib/subscription-record.ts`** (`SubscriptionRecordRow`, `MEMBER_STATUS`,
  `subscriptionRecordFromMember(sub, orgLabel)`, `sortMemberSubscriptions`) so both screens share one
  implementation — **use it, do not write a third status mapping.** An unrecognised status prints the
  raw value rather than guessing a tone, because a new enum value silently rendering as paid is
  exactly how this bug read. Demo rows keep "Paid" — they really are invoice-shaped.

- `caeee07` — **`/outlet/special-service` was blaming the ROLE for a deferred feature.** It redirected
  to `?tab=services`, a tab phase 2 had switched off. Outlet **finance** passes the route's guard (it
  *holds* `orderSpecialService`) → redirect → Post Job resolves both capabilities false → *"Your outlet
  role cannot post shifts or order services."* The one role whose permissions are right is told its
  role is wrong.
  Cause: the flag was a LOCAL `const canOrderServices = false` in `bookings.tsx`, under a comment
  claiming everything downstream read it — `special-service.tsx` is downstream and could not.
  Now **`agency-portal/lib/phase-flags.ts`** → `OUTLET_SERVICES_ENABLED`. **Read the flag from there;
  do not re-hardcode it.** Its docstring holds the rule this bug taught: **a phase flag means the
  product is not offering this yet; a `*Can()` check means this role may not do it — conflating them
  produces an access error for someone whose role is fine.** Phase is checked BEFORE role.

- `48d5da6` — **mobile PV detail showed FOUR FAKE DRINKS** beside a real net figure the PR was being
  asked to sign. `DEMO_RECEIPTS` was hardcoded while the rest of that screen was live.
  **My own handoff note said this needed a backend change first. It did not** —
  `PrReceiptLineDTO` already carries kind/source/item/quantity/**sales**/**commission**/lineDate/
  outlet/pending (`decodeRef()` recovers kind/source/sales off `line.ref`), all three `/mine`
  endpoints already map lines through it, and `usePaymentHistory()` already exposed raw `vouchers`
  beside its display `weeks`. Nothing to add — only to read.
  Honest deltas vs the mock: no `receipt_no` on a line (it is on `payment_voucher_receipt`, which
  /mine does not join) so the headline names the ORIGIN — Scanned / Self-logged / Auto-sealed; and
  `matched` now = `!pending`, which is set only for manual self-logs, so it finally means something.
  Drinks+tips only; an empty week shows an empty state and must NOT fall back to demo rows.
  **⚠️ DO NOT run biome on `apps/mobile`** — there is no `apps/mobile/biome.json`, mobile files are
  single-quoted/2-space, and the root config reformatted the whole file (1208 insertions for a
  60-line change). I reverted and redid it by hand; final diff 115 insertions.

First three: web tsc unchanged at 124. `7f72fbc` took it **124 → 121**, the first drop — the three
that cleared were the pre-existing `c.lines is possibly undefined` errors on that same screen, since
the render stopped reaching into `lines[0]`. `4ab4da2` and `caeee07` held at 121. The **six web**
commits are biome clean except 8 PRE-EXISTING lint findings in `bookings.tsx` (lines 132/206/211/654 —
a11y + useExhaustiveDependencies); `caeee07` touched lines 37/69-77/86-89/511-531, so they are not
from it. `48d5da6` is mobile and was deliberately NOT run through biome — see the warning below.

## Shipped 30 Jul 2026, later session (3 more commits) — the two items that WERE left

- `8cf26f3` — **`PrRepository.getByUserId` was `LIMIT 1` with no `ORDER BY`.** That resolver answers
  "which pr row am I?" for **all ten** PR-facing call sites (payment-voucher, 5× shift-assignment,
  2× special-service, outlet-swap approve/decline, pr). Postgres could return either row when a user
  account holds two, so the same PR could resolve to a different identity between requests — and the
  symptom reads as **absence**, not error: swap approve 404s, so a PR gets told their own pending
  request does not exist, then finds it on a retry. Now `orderBy(asc(createdAt), asc(id))`, oldest
  wins (matches "originating agency"), fetches 2 rows to detect the ambiguity and `logger.warn`s it.
  **`pr.model.ts` itself says two pr rows per user is drift, not the intended shape** — `agency_pr`
  is the many-to-many, one `pr` row plus many `agency_pr` rows. **Two things deliberately NOT done,
  both needing a decision:** consolidating duplicate rows (a shared-DB data change that must repoint
  `shift_assignment` + `payment_voucher`), and whether `/mine` should span every `pr` row a user owns
  (which would entrench the shape the model calls wrong).
- `1a944e9` + `20dbcad` — **the agency GPS panel, backed and RENAMED.** See the finding below first.

### ⚠️ The "Live GPS" premise was FALSE — read before touching this again

The audit's last open item read "only `GET /shift-assignment/live` + panel wiring remain". The wiring
part was right; **the name was the bug.** There is **no continuous position data and no table that
could hold any** — grep finds no location/ping/tracking table, and the only coordinates anywhere are
`check_in_lat/lng` + `check_out_lat/lng` on `shift_assignment`, whose own column comment says *"only
as a SNAPSHOT at those two moments - this is not continuous tracking"*. Those columns were **written
and never read** until now.

So a `/live` endpoint would have presented a clock-in stamp as a current location — same failure as
the four fake drinks and the "Paid" pill on a cancelled sub. The user chose the **honest snapshot**
option. Hence:

- Path is **`GET /shift-assignment/attendance-fixes`**, NOT `/live`. Repository
  `listAttendanceFixesForAgencyDate`, controller `listAttendanceFixes`, `date` defaults to today.
- **Gated `requireRole('admin','agency')` via a separate `canReadPositions` const — outlets are
  deliberately EXCLUDED**, even for their own venues. They can already read that roster; a worker's
  coordinates are a step past it, and opening them is a **privacy call**, not a scoping one. Left
  closed pending that decision.
- Frontend: `services/attendance-fix`, `use-agency-attendance-fixes`, **`AgencyAttendanceFixPanel`**
  titled **"Check-in locations"**. Demo sessions keep `AgencyGpsPanel` verbatim, forked on
  `getAgencyIdentity()` in `roster.tsx` — a fork, not one component fed two ways.
- **Three states render distinctly and none is inferred:** fix → plotted with distance + ±accuracy;
  stamped-but-no-fix → listed, never plotted; not-stamped → listed. **A card with no fixes renders no
  map** — the demo panel's deterministic "Estimated" ring is exactly what must not appear beside real
  positions.
- `meters` is the server's own `check_in_distance_m`, **never recomputed from the returned
  coordinates** (the pin may have moved since). "In range" uses radius + `min(accuracy, 30)`,
  mirroring `MAX_ACCURACY_BUFFER_M`, so the panel cannot contradict the door's decision — and is
  **suppressed entirely on an unpinned venue** rather than shown as pass or fail.
- Header counts "12/14 stamped", not "12 on duty": a fact about records, not a claim about now.
- Trap: **`IzPill` has no `"neutral"` variant** — it is `gold|green|red|violet|amber|ink`. Cost 3 tsc
  errors on the first pass; use `ink` for muted.

### Two limits these surfaced — both stated in the UI rather than hidden

- **No `agency_name` column** on `collection_invoice` (it snapshots `outlet_name` only), so an outlet
  billed by two agencies cannot be told which one raised a statement. The hook returns
  `hasMultipleAgencies` and the UI says so instead of guessing from `agency_id`.
- **The two sides of the banner use different status filters and can legitimately disagree:** a
  statement counts only `completed` assignments, while the sales-report cost side excludes only
  `cancelled`/`no_show`. A shift that ran but was never marked completed reads as a gap. The banner
  calls that "worth checking", not a billing error.

## ⚠️ Do NOT try to back outlet-sales-vs-PV

The reconciliation banner's original pair cannot be backed on the outlet portal, and should not be.
The whole `payment-voucher` router sits behind `requireRole('admin','agency')`
(`payment-voucher.routes.ts` ~line 29) because agency→PR payroll is not the venue's business.
Widening that gate to feed a banner is the wrong trade — **and it is the fix that looks obvious.**
That is why `7baf1ec` changed the pair instead of the gate.

## ⚠️ The durable lessons from 30 Jul live in their own memories — read these first

- **[[audit-entries-are-leads]]** — re-derive every audit "what's left" entry from the code before
  acting. Wrong 3 for 3 that day. Also covers the phase board going stale independently.
- **[[collections-two-directions]]** — the `agencyCollections` slice hides two opposite directions of
  money behind one `kind` field; that is what made the repoint instruction wrong.
- **[[subscription-record-not-invoice]]** — `member_subscription` has no payment state, so nothing may
  badge a row "Paid".
- **[[dont-back-outlet-sales-vs-pv]]** — why the reconciliation banner's pair had to change instead of
  the gate.
- **[[phase-flags-vs-permissions]]** — check the phase before the role.
- **[[biome-scope-and-mobile-style]]** — biome from `apps/web` only; never on mobile.

## ⚠️ What is STILL not runtime-fired — mostly cleared, read the update first

**✅ MOSTLY CLEARED at the end of 30 Jul. This list has shrunk from six to four**, and the entries
below marked "cleared" are kept only so the history reads straight. What actually remains:

- **`pr_rating_low`**, **`shift_cover_needed`** and now **`pv_day_review_pending`** notifications —
  still unfired. All three are producers, not gates; the enum value and the recipient resolution for
  `pv_day_review_pending` ARE verified live, only the trigger is not.
- **Collections issue → settle over HTTP** (item 3) — still unfired; forward-only, no undo.
- **MFA enrol → confirm → challenge** (item 4) — still unfired; lockout IS verified.
- **The PV day-review STALE path** — new, see [[pv-day-review]].
- **Anything on a mobile device** — the app has never been run, in any session.

**CLEARED:** the seven 30 Jul UI commits (item 5) were exercised in a browser on real logins —
[[portal-clickthrough-30jul]]. The attendance panel fired (agency 200 / outlet 403 / PR 403), and
more venues are pinned than recorded — **Emhub Testing and JK House, not Velvet 23 alone**. The
`getByUserId` fix cannot be exercised because **no user owns two `pr` rows** (verified live; the
"Vicky has two" note was wrong) — it stands as defence, not a live-provable behaviour.

The stale text below is superseded by this block.



Do not report these as working.

**1–4 (from 29 Jul).** Each needed a probe with a cleanup `DELETE` that GateGuard refused, and
creating unremovable rows in the shared DB was the worse option.

1. `pr_rating_low` notification (rating drops below 3.5)
2. `shift_cover_needed` notification (PR cancels / leave approved)
3. Collections draft → issue → settle over HTTP (the *derivation* IS verified)
4. MFA enrol → confirm → login challenge (lockout IS verified end to end)

**5 (from 30 Jul) — all SEVEN of that day's commits**, `0dd7164` / `1929a22` / `7baf1ec` /
`7f72fbc` / `4ab4da2` / `caeee07` / `48d5da6`. Seven commits of money-and-access UI resting on reading
and types alone. Two need a specific login to exercise at all: `caeee07` needs **outlet-finance**
(owner and ops never saw that bug), and `48d5da6` needs a **PR on a device** — nothing in that app has
ever been run, in any session. Sobering data
point on that risk: the "Paid"-for-cancelled bug `4ab4da2` fixed had been live as long as that screen
has, and was found by **reading the enum**, not by anything failing. Blocked on
two things at once: no backend was running, and every one of these surfaces renders only when
`getAgencyIdentity()` / `getOutletIdentity()` is non-null — which a minted token does **not**
satisfy, only a real password login. The read shape was confirmed by *reading* the repository
(`db.select()` with no projection → every column the model declares), never from a live response.
Issue/settle are **forward-only with no undo endpoint**, so proving them live leaves permanent rows
behind; deferring was a choice, not an oversight.

The **banner** is the one most worth watching, because it renders only when a statement exists AND
the sales report has shift rows for that same week AND the two disagree — so on real data the likely
outcome is that it correctly shows nothing, which is indistinguishable from broken until you look.

Items 1–4 clear with one manual pass on a running stack. For MFA use a THROWAWAY admin — the
single existing `admin_mfa` row is bound to a real person's authenticator.

## ✅ THE DECISIONS ARE ANSWERED (30 Jul) — `4681fb3`. ONE BUILD LEFT.

The user answered all four live decisions in one pass. **Three became code and were fired live; the
fourth needed none.** Do not re-ask these.

1. **Held day blocks issue?** → **YES, and every money-bearing day must be decided** — the STRICT
   form, chosen over my warn-only recommendation. Shipped as one `voucherSendGate()` used by the HTTP
   send **and** the Monday payout job. Details + the three rules not to simplify: [[pv-day-review]].
2. **Which agency sub-role may approve a day?** → **owner + finance** (`agencyOwnerOrFinance`,
   mirroring `agencyCan 'raisePv'`). Write routes gated; **read deliberately not**.
3. **May a venue see staff coordinates / PII?** → **NEITHER.** Coordinates stay agency+admin;
   IC/DOB/address/state/country/ID-photos are now blanked for outlet-only callers. Done as a response
   **shape** (`redact-identity-docs.ts`), not a gate — `GET /user` is how the venue Today/History
   screens resolve PR names, so a gate would blank two live screens. Nulled, not deleted. Own record
   exempt.
4. **Should `/mine` span every `pr` row a user owns?** → **NO, stay single-row.** No code change:
   `pr.model.ts` already calls two `pr` rows drift, and no live user owns two. The `8cf26f3` warn log
   will surface it if one ever does. (This also parks the "consolidate duplicate `pr` rows" question —
   still moot on live data.)

**THE ONE BUILD LEFT: the agency PV day-review panel.** Everything it needs is shipped and proven.

⚠️ **Live consequence to expect from #1:** the `weekly-payout` job now holds unreviewed vouchers at
`pending_review` and the PR is never notified. That is the decision working — but **until the panel
exists there is no screen to review on**, so the first Monday after this ships nothing will issue.
Job log line: `awaiting agency day review`. Catch up by hand via `PATCH …/day-review/:date`.



- ✅ **Phase D is NO LONGER blocked — queried live 31 Jul, ALL SEVEN outlets are pinned**
  (Velvet 23, Onyx KL, Urban Soul, Mermate, Bear Lounge, Emhub Testing, JK House). The old note
  here and on the audit said "five of six are unpinned"; that was wrong on the count AND on the
  claim that it needed the owner. `outlet.geo_fence_radius` defaults to **50 m** and the repository
  falls back to `DEFAULT_GEOFENCE_RADIUS_M` when null, so **the fence is live at every venue**.
  What remains in Phase D is only the **penalty amounts** (money policy, Velvet 23 only).
  ⚠️ A wrong pin now fails **closed** — spot-check one against the real venue before trusting a
  rejection. Do NOT geocode the seeded addresses to "fix" a pin: four share one street name and
  resolve to postcode centroids.
- **Phases A and G are both down to ONE shared item: the deferred OTP.** Everything else in both is
  closed. Their Open columns on the audit had gone stale — between them they still listed the ungated
  routers (`41386b9`), the register gate (`da4657b`) and the PV signature (`70ec785`), all struck
  through as fixed elsewhere on the same page. Reconciled 30 Jul. **OTP is deferred by the user — do
  not build unasked**; WhatsApp business verification is the long lead time. See
  [[role-split-and-build-order]].
- **Platform fee 2.5% vs 5% — parked by the user.** `platform_fee_percent = 2.50` is
  deliberate; read [[green-signals-that-lie]] before "correcting" it.
- **Genuine-login click-through of the agency portal.** Only the user can do it — it needs a
  password typed. Token injection authenticates the API but does NOT populate the agency
  identity, so roster/payroll/KPIs still render demo fixtures. See [[web-auth-tokens-not-persisted]].
- **Click all seven 30 Jul surfaces through on a real login** — agency collections, outlet
  collections, the rebased banner, and both subscription records. Now the largest unverified surface
  on the project. None renders without a genuine password login, and issue/settle are forward-only
  with no undo endpoint — so do it on data you are willing to keep.
- `/host` PR portal is an orphaned island — kept on purpose, see the audit's finding 11.

## Things that cost me time — read before repeating them

- **Biome: run it from `apps/web` only.** The root config errors on the nested one, and there is no
  `apps/mobile/biome.json` — running it on a mobile file reformats the entire file away from the
  single-quote/2-space style every other mobile file uses.
- **Grep output sometimes renders `/` as `\`** — `// comment` shows as `\ comment`, `</strong>` as
  `<\strong>`. It bit me twice in one session and both times looked exactly like a file had been
  corrupted mid-edit. **Read the file before believing it**; both times the file was perfectly fine.
- **GateGuard demands a fact block before the first Bash call and the first touch of every file**
  (create OR edit), including scratchpad and memory files. Budget for it: ~10 denials in one session.
  It also blocks every `DELETE`-containing probe even with facts presented. Prefer read-only
  verification, or hand the user a cleanup command.
- Backend on **7777 is someone else's** and may run stale code while answering `/health` 200.
  Check the routes before trusting it; run your own on a spare port.
- `TaskStop` kills the `npx` wrapper, not the node process — orphans keep holding ports.
- Biome reformats files after every commit; expect a follow-up `style:` commit.
- `notifyMany(userIds, input)` takes POSITIONAL args, not an object.
- Toast tones are `success | warn | info` — there is no `error`.
- A scratchpad script cannot resolve backend deps; copy it into `apps/backend/src/scripts/`,
  run, delete. Import `@/env` FIRST or the pg pool builds from unset credentials.
