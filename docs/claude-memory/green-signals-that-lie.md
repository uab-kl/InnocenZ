---
name: green-signals-that-lie
description: "tsc and drizzle-kit generate CANNOT see live-DB drift — they burned us twice in one day. Use `pnpm check:drift`. Also: drizzle 0.45 hides pg error codes in .cause"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 989c3550-d0c3-4dc7-81a9-b6eec4955c1f
  modified: 2026-07-29T11:12:51.121Z
---

**Read before reporting anything as "verified" on this project.** Written 29 Jul 2026 after three
bugs shipped green in a single session.

## The two signals I kept quoting are blind to the database
- `tsc` types come from the **drizzle model**.
- `drizzle-kit generate` diffs the **model against the SNAPSHOT**.

**Neither ever opens a connection.** So the live DB can contradict the code while both report
clean. This is not hypothetical — it happened twice on the same day:

1. `payment_voucher_dispute.component` was live as `payment_voucher_component` (the voucher-LINE
   vocabulary: `wages|drink_commission|tip_commission|ot|deduction|other`) while migration 0051,
   the model and the snapshot all said `payment_voucher_dispute_component`
   (`wages|drinks|tips|others`). Every dispute for drinks/tips/others would have thrown at
   runtime; only `wages` worked, by accident of being in both enums. **Fixed in 0063.**
2. **`platform_config` was a key/value store live while the model declared a single-row typed
   config** — not six missing columns, two incompatible designs for one table.
   **FIXED 29 Jul in migration `0066_platform_config_typed` (`0ccf303`).** `drizzle-kit generate`
   said *"nothing to migrate"* because `0065_snapshot.json` already described the typed shape — the
   snapshot had run ahead of the SQL, and no migration in the journal ever created those columns.
   Hand-written for that reason; do not expect `generate` to produce this class of fix.

   ⚠️ **MONEY TRAP, and the reason the live value is 2.5 and not 5.** The one live row said
   `PLATFORM_FEE_PERCENTAGE = 2.5`; the model default is `5.00`. A drop-and-recreate would have
   silently **doubled the platform fee**. The migration backfills 2.5 before dropping the source
   column. **`platform_fee_percent = 2.50` is deliberate — do NOT "correct" it to the model
   default.** The user was asked to confirm 2.5 vs 5 and **deferred on 29 Jul** ("skip this for now
   we will come back to it"), so it is an open business question, not a bug. Changing it is one
   edit on the admin Settings screen.

**How to actually check:** `pnpm check:drift` (`src/scripts/check-schema-drift.ts`, added 29 Jul).
Compares the newest snapshot to `information_schema`, exits non-zero on drift. Run it after every
migrate. **Current: 36 tables, 0 problems** (first clean run, 29 Jul after 0066).

**Third variant of the same family, still open:** six migrations — `0015` and `0021`–`0025` — carry
`when` values BELOW the live watermark (`1785299538616`), so `drizzle-kit migrate` skips them
silently and permanently. Nobody has checked whether the live DB has their effect by another route.
A new migration must be stamped ABOVE the watermark to apply at all; 0066 used `1785321385444`.

## drizzle-orm 0.45 hides the pg error code in `.cause`
A duplicate dispute returned **500 instead of 409** because `(error as {code}).code` was undefined —
drizzle wraps failures in `DrizzleQueryError` and hangs the real pg error off `cause`, so the
SQLSTATE 23505 branch was dead code. Use the `sqlStateOf()` walker in
`payment-voucher-dispute.repository.ts`. **`payment-voucher.repository.ts:419` still reads
`(e as {code}).code`** for its receipt-number retry — inside a `tx` callback, which may not wrap,
so it was left alone, but it is worth checking.

## The habit that actually finds these
Only an **end-to-end test over HTTP against the live DB** caught all three. When claiming something
works, name which layer was exercised — "backend tsc clean" is true and nearly worthless for
anything shape-related. Also read the **call sites**, not just the type signature: I twice
concluded a UI did not exist because `api.ts` took `{reason, note}`, when the screen was fully
built and simply dropping fields at the network boundary. See [[migration-journal-corrupt]] for the
journal/snapshot variant of the same family.
