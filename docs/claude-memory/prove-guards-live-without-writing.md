---
name: prove-guards-live-without-writing
description: "How to fire refusals, races and unreachable branches against the SHARED database while leaving nothing behind — the four techniques that took the overtime lane from unit-proven to live-proven on 2 Aug 2026"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: e11d606a-1a31-421f-9585-670cee76646d
  modified: 2026-08-02T13:30:36.127Z
---

# Proving guards live without writing to the shared DB

The InnocenZ database is **remote and shared with jk**, so "fire it live" has always felt like a
choice between no evidence and permanent rows. It mostly is not. Four techniques took the whole
overtime lane from unit-proven to live-proven in one session, and only ONE row was left behind — on
purpose, as the proof.

## 1. A refusal writes nothing — so fire every refusal, free

The big one, and obvious only in hindsight. **A 400/404/409 is a guard declining to act.** Nothing
is inserted, nothing updated. So the entire refusal surface can be exercised against
production-shaped data at zero risk.

`probe-overtime-refusals.ts` (kept, non-mutating, re-runnable) fired five in one pass: `400` missing
scope, `400` bad payload, `404` absent row, `409` no claim, `409` already decided.

⚠️ **Guard against the stale-server trap first.** A backend on 7777 may be someone else's process
running older code while answering `/health` 200 — and then every refusal "passes" for the wrong
reason. The probe aborts if the route under test 404s.

## 2. A check that goes green over ZERO rows must report SKIP, not PASS

The pricing assertion ran over an empty list and printed PASS. That is a green signal asserting
nothing — the same failure as everything in [[green-signals-that-lie]]. It now prints
`SKIP … no pending claims exist, so this asserts nothing`, and the underlying rule stays recorded as
**unproven**.

## 3. Unreachable branch? BORROW a row and restore it in a `finally`

The commission-only 409 could not be reached because **no commission-only assignment exists on the
live DB** — all 17 undecided rows carry a wage. (Discovering that was itself worth the trip.)

So: set `pay_amount` to `0.00`, fire, restore the original in a `finally` so a crash still puts it
back. Two rules made it safe:

- **Pick by least consequence** — `cancelled` → `no_show` → `assigned` → `confirmed`, and **exclude
  `completed` outright**: those rows are what vouchers are built from, and a wage that blinks out
  mid-generation is a real payroll fault, not a test.
- **`'0.00'`, not NULL** — the column is NOT NULL, and zero reaches the same `amountCents <= 0`
  guard. A commission-only wage is absent in **value**, not in schema.

## 4. Race conditions: stage them with the arm that writes NOTHING

Two simultaneous requests via `Promise.all` **is** a genuine race — I had written this off as
impractical and was simply wrong ("hard to observe" mistaken for "hard to test").

The trick is choosing the decision that costs nothing: **reject, not approve.** Reject runs the
identical `claimOvertimeDecision` mutex but writes no voucher line, so the race is provable without
money reaching a payslip. Result: one `200`, one `409 "decided by someone else a moment ago"` — and
that message matters, because it proves the `UPDATE … WHERE status='pending'` lost the race, rather
than the earlier already-decided precondition firing.

## The two rules for any script that DOES write

1. **Give it a read-only `--report`.** `fire-overtime-approval.ts` selects on
   `overtime_status IS NULL`, so re-running it silently approved a *different* row instead of
   retesting the first — idempotent per CLAIM, not per RUN. **A writing script needs a way to ask
   what it already did.**
2. **Undo through the app's own path.** My cleanup SQL (`DELETE` the line, null the columns) was
   incomplete: `subtotal`/`net` are recomputed on INSERT, so a raw delete leaves a voucher whose
   stated total contradicts its own lines. `--clear` calls the repository's `deleteLine()` →
   `recomputeTotals`. See [[current-state-and-audit]].

Also: a `--dry-run` that names the exact target before acting, and a `finally` that restores. On a
shared database, a delete that states what it is about to do is the only kind worth trusting.

## Where the scripts are

`apps/backend/src/scripts/` — `probe-overtime-refusals.ts` (never writes),
`probe-org-suspension.ts` (suspends one agency, restores in a `finally`),
`fire-overtime-approval.ts` (`--dry-run` / `--report` / `--race` / `--unpriced` / `--clear=<id>`).
Run with `npx tsx --tsconfig tsconfig.json` from `apps/backend`, backend running on 7777 via
`preview_start`. ⚠️ The remote DB is **not reliably reachable** — a first connection timed out and
recovered on retry, so re-run a failed probe before believing it.
