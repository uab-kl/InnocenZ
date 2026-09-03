---
name: migration-journal-corrupt
description: "⚠️ BROKEN AGAIN as of 3 Aug 2026 — `drizzle-kit generate` CANNOT RUN (17 migrations have no valid snapshot). Hand-author every migration; `migrate` still works. The 28-29 Jul repairs are kept below for their recipes."
metadata: 
  node_type: memory
  type: project
  modified: 2026-08-03T05:05:08.991Z
  originSessionId: eb9050b4-6fcb-4374-af2a-5ef077648c1b
---

## 🔴 READ FIRST — `drizzle-kit generate` CANNOT RUN (3 Aug 2026)

The "RESOLVED" verdict below is **no longer true**. Attempting a migration on 3 Aug produced:

```
Error: [0065_snapshot.json … 0070_snapshot.json] are pointing to a parent
snapshot: 0065_snapshot.json/snapshot.json which is a collision.
```

Actual state of `apps/backend/postgres/migrations/meta/`:
- `0063_snapshot.json` and `0064_snapshot.json` are **missing entirely**
- `0065`–`0070` are **six byte-identical copies** — same `id`, same `prevId` (someone copied one
  file rather than generating each)
- **No snapshots at all for `0071`–`0079`**, though the journal and `.sql` files run to `0079`

So **17 migrations have no valid snapshot**. This is not one broken link — repairing it properly
means replaying each migration against a scratch DB to capture the schema at each step, or
baselining a fresh snapshot from the current model. Neither is a quick fix, and it belongs to jk
too since he migrates the same database.

### The working procedure until it is baselined

**`drizzle-kit migrate` does NOT read snapshots** — only `_journal.json` and the `.sql` files. So
migrations still deploy normally if you author them by hand:

1. Write `postgres/migrations/00NN_name.sql` yourself. **Always idempotent**
   (`ADD COLUMN IF NOT EXISTS`, guarded `CREATE TYPE`) — see `0080_pv_finance_signature.sql`,
   which mirrors `0071_pv_pr_signature.sql`.
2. Append the journal entry, and set **`when` ABOVE the live max** or `migrate` silently skips it
   (the 0016 trap, still armed). On 3 Aug the max was `1785510000000`; 0080 used `1785520000000`.
3. `pnpm migrate:deploy` from the repo **ROOT** — never `pnpm migrate`, which runs `generate`
   first and therefore dies on the collision above.
4. **Verify the column landed** with a real `information_schema` query. Do not trust
   "migrations applied successfully!" — it prints that regardless of whether your entry ran.

Done this way for `0080` (`finance_head_signature`) and confirmed live.

---

**Repaired and verified 28 Jul 2026.** Supersedes my earlier diagnosis, which was wrong in its details.

## What the corruption actually was
Two records were hand-merged into one object each with duplicate `when`/`tag` keys. `JSON.parse`
keeps the **last** duplicate, so drizzle resolved them to `0051`/`0052` and **`0053`/`0054` were
shadowed** — present in the file text, invisible to drizzle. My earlier note said they were
"absent from the journal and will never apply"; wrong description, right effect. **Both were
already applied on live.** Only `0002_audit_logs` was genuinely missing (and also already applied).

## The armed trap this defused
`drizzle-kit` picks the next prefix with `idx = lastEntryInJournal.idx + 1` (`bin.cjs:32926`).
The last entry collapsed to `idx: 52`, so the **next `generate` would have written `0053_*` and
overwritten `0053_lovely_rawhide_kid.sql`** — the file carrying `receipt_id`. Any rename task
starts with a generate, so this was live ammunition.

## Repair applied
- Both merged objects split into four entries; `0002_audit_logs` inserted after `0008`
  (`when=1782790982633`) — it **must** precede `0029`, which does `ALTER TABLE audit_logs`.
- idx renumbered 0..56, sequential. 57 entries, 1:1 with 57 `.sql` files.
- ~~**Deliberately left wrong:** the `when` on `0015` and `0021`–`0025`~~ **RESOLVED 29 Jul 2026 —
  see "The six, closed out" below.** The old fear (that `0023_add_shift` would `CREATE TABLE` over
  populated tables) was unfounded: every one of the six is idempotent by construction.

## The six, closed out — 29 Jul 2026

`0015` + `0021`–`0025` were journaled but never in `drizzle.__drizzle_migrations`, and their `when`
sits below the live watermark, so `drizzle-kit migrate` skipped them **permanently**. The schema was
never the problem — the **ledger** was lying.

Verified first, then fixed:
- Every effect already present live: `subscription.coverage`, `outlet.logo_image`, tables
  `pr`/`shift`/`shift_assignment`/`payment_voucher`/`payment_voucher_line`, and enums
  `pr_status`/`pr_tier`/`shift_event_kind`/`shift_status`/`payment_voucher_status`/
  `shift_assignment_status`.
- All six are **idempotent**: `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, and
  `CREATE TYPE` wrapped in `DO $$ … EXCEPTION` blocks. So they were re-run for real rather than
  assumed — one transaction, all six, then a ledger row each. Nothing changed; drift stayed clean.

**The hash is plain `sha256` of the raw .sql file text**, and `created_at` is the journal's `when`.
Confirmed by reproducing the hash of a row drizzle had just written itself. That is the recipe if
this ever needs doing again — `insert into drizzle.__drizzle_migrations (hash, created_at)`.

Result: **67 journal entries, 0 unapplied.** No repo file changed; the fix was entirely in the live
ledger.

⚠️ **Two ledger rows belong to nobody in our journal:** `when` `1785201601074` and `1785201601075`.
These are jk's, applied to the shared DB from the divergent journal this note has always warned
about. Drift is clean, so their effect agrees with our snapshot — but do not "clean them up",
and expect a merge conflict in `_journal.json` when that branch lands.

## ⚠️ IT HAPPENED AGAIN — two migrations numbered 0076 (31 Jul 2026, merge `9e6bad3`)

The warning above stopped being hypothetical. Merging SL into main surfaced **two different
`0076` migrations authored the same day**, carrying not just the same `idx: 76` but the
**identical `when` of `1785480000000`**:

- SL — `0076_overtime_approval_and_bank` (overtime decision + bank/agency-address columns)
- jk — `0076_shift_assignment_leave_proof` (MC photo jsonb)

Effect if it had shipped: drizzle runs a migration only when its `when` exceeds the newest applied
`created_at`, so **whichever database saw one would skip the other forever**, and a fresh deploy
would simply lack one of the two schemas — with `tsc` and `drizzle-kit generate` both green about
it. Same class as the 0016 trap, but between developers rather than within one journal.

**Resolution rule established: whoever reached trunk first keeps the number.** jk's stayed 0076;
SL's moved to `0077_overtime_approval_and_bank` (`when` bumped to 1785490000000) and
`0078_pv_one_per_pr_week` (1785500000000, unchanged). Safe because every statement in both is
`IF NOT EXISTS`, and 1785490000000 sits *below* the live max, so neither re-runs on the shared DB
while a fresh one still gets 0076 → 0077 → 0078 in order.

**The renumber is not just the file and the journal.** Comments naming a migration number, and any
`probe-00NN.ts` script, go stale silently — carried through 10 source files plus `TEST_SCRIPT.md`,
and renamed `probe-0077` → `probe-0078`.

**Cheap check before authoring any migration:** `git ls-tree origin/main apps/backend/postgres/migrations/`
and compare the tail against your branch. A number collision is invisible to git until the merge,
because two *differently named* files never conflict — only `_journal.json` does.

## Snapshot drift (a separate, previously unrecorded fault)
Only 17 snapshots existed and filenames lagged by two (`0052_snapshot.json` was really the
post-**0054** state). `generate` diffs against `snapshots.sort().at(-1)`, so it wanted to re-emit
`outlet_swap_request` + `payment_voucher_dispute` + `pvl.component` — all already live. Fixed by
installing `meta/0056_snapshot.json` (true model state, `prevId` chaining to `0052_snapshot`).
`generate` now reports "No schema changes".

`payment_voucher_line.component` + its enum were created by **no migration at all** — live-only,
21 rows classified. `0056_pv_line_component.sql` (guarded) closes that hole; applied, ledger id 58.

## The second writer was jk, and both journals are now merged (28 Jul 2026, `2df9282`)
`origin/main` merged into SL. The union journal has **60 entries**, 1:1 with the `.sql` files,
idx renumbered 0..59. jk's three entries carry `when` **1785201601071–073** — exactly the
ledger ids the section below could not account for, so that mystery is closed.

Two faults the merge introduced with **no git conflict**, both fixed:
- Both branches' snapshots claimed `0052_snapshot` as `prevId`, so `drizzle-kit` refused to run
  at all ("pointing to a parent snapshot … which is a collision"). Re-chained
  **0052 → 0053 → 0057**. Any future cross-branch merge will hit this again — check `prevId`
  first when generate dies on a collision.
- `generate` then found one drifted column, jk's already-live `user_profile.languages`.
  `0060_damp_fixer.sql` carries it with **IF NOT EXISTS**; its `when` (1785226573408) is above
  the live max so it *will* run against a DB that already has the column. `generate` clean after.

`0053` is a **duplicate file prefix** — `0053_lovely_rawhide_kid` (SL) and `0053_fat_serpent_society`
(jk) both exist. Harmless: drizzle keys off the full `tag`, and idx is now 59 so the next generate
writes `0060`+, clobbering nothing. jk also added `IF NOT EXISTS` to our `0054`.

## ⚠️ The shared DB has a second writer
Ledger went 50 rows (max id 52) → 56 during one session. My migrate accounts for **one** row.
Ids **53–57** (`created_at` 1785201601071–075) match **no journal on any branch**, and `created_at`
is copied from `folderMillis`, so they came from a divergent journal — almost certainly jk's
uncommitted local work applied straight to `innocenz-test`. **Row 56 is byte-identical to
`0053_lovely_rawhide_kid.sql`, i.e. re-applied**; harmless only because 0053 is fully guarded.

**Live max `created_at` is now 1785225600000.** Anything generated with an earlier `when` is
silently skipped — the [[backend-migrations-shared-db]] 0016 trap, now operating *across
developers*. Confirm with jk before either side migrates. Write guarded/idempotent SQL always.

See [[pv-money-classification]], [[outlet-swap-feature-build]] (its "nothing applied to the DB"
claim is **wrong** — `outlet_swap_request` exists live).
