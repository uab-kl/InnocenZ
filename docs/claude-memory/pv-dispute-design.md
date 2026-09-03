---
name: pv-dispute-design
description: "Payment-voucher dispute model agreed 2026-07-27 — one dispute per day PER COMPONENT (wages / drinks / tips), proof mandatory, receipts referenced by receipt_no not line id"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6035bb3b-c39d-49a0-92d0-191791dc1ce7
  modified: 2026-07-31T05:08:35.742Z
---

> ## 🔴 OPEN DECISION (31 Jul 2026) — may an ADMIN resolve a PV dispute at all?
> **Owner's steer, verbatim:** *"the admin is not supposed to be the one reviewing the payment
> vouchers as the Agency is supposed to handle that."* **Decision deferred to a new session.**
>
> **It corrected two things I had just told the owner, both wrong:**
> 1. **The agency dispute queue ALREADY EXISTS and works** — `DisputeQueuePanel.tsx` +
>    `use-agency-disputes.ts`, a real `resolveDispute` accept/reject mutation, on **`/agency/pv`**.
>    I claimed it did not, because I read a stale `TEST_SCRIPT` §9 line instead of re-deriving.
> 2. **"Wire up the admin PV page" was therefore BACKWARDS.** The `resolveDispute` + `receipts[]`
>    that come back unrendered there are **not an under-wired gap** — they are surface the admin
>    should probably not have. **Building them would have been actively wrong.** Sharpest instance
>    yet of [[audit-entries-are-leads]].
>
> 🔴 **A real hole found alongside it, to fix EITHER WAY:**
> `POST /payment-voucher/disputes/:disputeId/resolve` inherits only the mount-level
> `requireRole('admin','agency')` — **no `agencyOwnerOrFinance` sub-role gate**. So settling a money
> dispute is reachable by **any agency member**, while merely approving a day is not. Same asymmetry
> fixed one route earlier in `17480d7`.
>
> **Option A (recommended) — keep admin, but gate it:** admin as a deliberate *escalation* path only.
> **Option B — remove admin:** `requireRole('agency')` on the dispute routes; matches the steer
> exactly, but a stalled dispute then has **no escalation if the agency goes quiet**.
> ⚠️ **Do both changes in ONE edit — the sub-role gate and the admin call touch the same two lines.**

> ## ✅ SHIPPED AND E2E-VERIFIED 29 Jul 2026 — everything below this block is HISTORY
> The "BLOCKED", "0 rows", "do not start the agency queue" warnings below are **STALE**. Built and
> proven end-to-end over HTTP with real accounts (`cad9199`, `355b7b9`, `2982d65`, `37e7565`):
>
> - **PR side:** `raiseMyDispute` writes real `payment_voucher_dispute` rows, one per **day per
>   component**. The PR app's dispute UI *already existed* (tap a cell in the week grid) — it was
>   only dropping `dateIso`/`incomeKey`/photos at the network call, flattening them into the note's
>   prose. Now sent as structured fields. Withdraw is addressed by **day + component**, not an id,
>   because that is what a tapped red cell knows.
> - **`disputedAmount` is computed server-side** from the voucher's lines. The request schema has
>   no field for it. Verified: TUE 21 drinks → 67.50 (15+30+22.50), tips → 5.00, wages → 198.00.
> - **PROOF IS NOW OPTIONAL** (0064 drops the CHECK) — the design below said mandatory and that was
>   **wrong**: a PR disputing a MISSING record has nothing to photograph, so it made the most
>   legitimate claim unfileable. Matches the app's own "Proof images are optional".
> - **Agency queue built:** `GET /payment-voucher/disputes?open=1` + `POST /disputes/:id/resolve`,
>   `DisputeQueuePanel` on the agency Payroll & PV page. Rejecting **requires** a note. Deciding is
>   one-way (`isNull(outcome)` in the WHERE). Resolving the last open dispute returns the voucher
>   to `sent`. The PR is notified via `notify()`.
> - **Resolving does NOT rewrite voucher lines** — the landmine below is respected. Accepting
>   records the decision; changing money stays a separate explicit edit.
>
> **E2E test credentials:** PR `pr.vicky@innocenz.demo` / **`password`** (a per-account override in
> `seed-sample-prs.ts`, NOT the `Password123!` default); agency `owner@atlas-agency.my` /
> `Password123!`. Test voucher `961ca742…` = RM 587.50, week 19–25 Jul, 14 lines.
>
> **Still not built:** proof-photo UPLOAD from the PR app (the picker exists, files are not
> uploaded anywhere), and `receipt_no` still does not exist. See [[green-signals-that-lie]].

> **BUILD STATE 2026-07-27 (frozen, SUPERSEDED — see above).** Step 1 of 6 done: `apps/backend/postgres/migrations/0051_pv_dispute_resolution.sql` + the `PaymentVoucherDisputeTable` model are written, backend tsc green, **UNCOMMITTED and NOT APPLIED**. Journal idx 51 registered. The migration deliberately does **not** touch `payment_voucher_line` — an earlier draft added a `component` column there, which duplicates the `kind` already packed in `ref` and collides with the coworker's OCR/scan work. Model declares both indexes so `drizzle-kit generate` will not try to drop them; the proof CHECK stays SQL-only.
>
> **Before applying:** the shared journal also holds an unapplied `0052_add_outlet_swap_request` from someone else's in-flight branch, and idx 50 is missing — running `drizzle-kit migrate` applies THEIR migration too. Settle that first.
>
> **Still to do:** repository methods · endpoints (per-day+component raise, targeted withdraw, PR list, agency queue, resolve) · proof upload · **agency decision UI (highest value — it is what stops disputes being silently erased today)** · PR per-row dispute UI · notify the PR (blocked, no transport exists). Steps 3+ land in `payment-voucher.controller.ts`, the same file as `encodeRef`/`decodeRef` — coordinate with the coworker.
>
> **Three things that must be handled in step 3:** `voucher.status='disputed'` becomes DERIVED (a query over open disputes, not a column write); `disputed_amount` must be computed server-side, never accepted from the client, because it is the baseline of a money claim; and accepting a dispute rewrites lines via `repository.ts:61`, which deletes ALL lines before re-inserting the caller's payload — verify the agency update includes the PR's self-logged lines or that is a live bug on its own.

> **LIVE-DB REALITY CHECK 2026-07-28 — the agency queue is BLOCKED, and it is not urgent. Do not start it without reading this.** 0051 is applied. But: `payment_voucher_dispute` has **0 rows**, the whole system has **2 payment vouchers** (both `pending_review`), and **no voucher has ever been disputed** (`disputed_at` null on both). So the "agency resolve silently erases a dispute" bug is real in code but **has never fired** — nothing has been lost.
>
> **Why the queue cannot be built yet (three-way contract, spans both lanes):** `raiseMyDispute` (payment-voucher.controller.ts:725) writes only the legacy voucher columns — `status='disputed'`, `dispute_reason`, `dispute_note`, `disputed_at` — and **never inserts a dispute row**. 0051's backfill only covered vouchers already disputed at migration time, of which there were none. Meanwhile the proof CHECK makes `proof_photos` a non-empty array **mandatory on every new row**, and the PR app sends no proof. So no row can ever exist until: PR app attaches proof → jk's `raiseMyDispute` writes the table → agency resolves. Building the agency half first yields endpoints that can only ever return `[]`.
>
> I wrote and then **deleted** a `payment-voucher-dispute.repository.ts` (list/getOpen/create/update, agency-scoped through the voucher join) on those grounds — recoverable from session 2767147f if the contract lands.

**The rule (user, 2026-07-27):** a PR may dispute as much as they like across a month, but **each shift day allows one dispute per component**. Components are **wages · drinks commission · tips commission**. Every dispute is subject to agency review, and **the PR must attach proof** so the agency can judge whether the claim is true.

**Why the components behave differently — the business fact that drives the design:** the **outlet pays the agency on ALL PR sales**, but a **PR earns drinks/tips commission only on receipts they actually scanned or self-logged**. So a wages dispute contests a *value* the agency controls (tier × daily_wage), while a drinks/tips dispute contests *the PR's own receipt log* — "my receipt isn't counted", "wrong amount", "my self-log was wrongly rejected". **Correction of an earlier wrong assumption: commission does NOT derive from the outlet's sealed sales, so no outlet escalation is needed — the agency owns and can resolve all three.**

**Governance point worth keeping:** the gap between total sales and scanned receipts is agency margin. Every *accepted* commission dispute therefore moves money out of the agency's own pocket, and the agency is the sole judge of those claims. That is the real argument for recording outcomes — with them you can see if an agency rejects most commission disputes while accepting wages ones; today "resolve" just erases the complaint and the pattern is invisible.

**Shape:**
- `UNIQUE (voucher_id, dispute_date, component)` — one per day per component, enforced in the DB, not by controller convention.
- `component` also becomes a typed enum column on `payment_voucher_line` (wages | drink_commission | tip_commission | ot | deduction | other). Today the category exists only as free text in `description`, though the PR Payment screen already groups by these buckets in code.
- Carry `disputed_amount` (snapshot at raise time) and `claimed_amount`. The snapshot is essential because resolving rewrites the lines.
- **Never FK a dispute to `payment_voucher_line.id`.** Lines are deleted and re-inserted wholesale on every voucher update (`payment-voucher.repository.ts:61`) — and that rewrite is exactly what happens when the agency accepts, so the dispute would destroy the row it points at. Reference receipts by **`receipt_no`**, a stable business key.
- Proof is **mandatory**: `proof_photos` jsonb, same pattern as `payment_voucher_line.proof_photos` (migration 0048). Enforce with `CHECK (jsonb_array_length(...) >= 1) NOT VALID` so backfilled legacy rows are exempt but nothing new can exist without evidence. Two valid sources — newly uploaded photos, or a reference to receipts already in the system whose proof was captured at submission time (stronger evidence than a fresh re-photo). Proof must be **immutable once submitted**, or a PR could swap the image after the agency has looked.

**Prerequisite:** `payment_voucher_line.receipt_no` + `source` still do not exist. They are the join key for verifying, for targeting a commission dispute, for pulling up existing proof, and — critically — for stopping the same receipt being claimed twice on two different days. Nothing else prevents double-claiming. See [[backend-gap-audit-verified]] and [[outlet-agency-gaps]].
