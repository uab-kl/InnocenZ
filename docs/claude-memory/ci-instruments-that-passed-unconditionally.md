---
name: ci-instruments-that-passed-unconditionally
description: The typecheck target was a no-op echo, check:drift compared against a 60-migration-stale snapshot, and mobile tests never ran — all three fixed 21 Aug 2026
metadata:
  type: project
---

CI runs `nx run-many -t lint test typecheck e2e` (`.github/workflows/ci.yml:41`).
Three of those were lying, and had been for a long time.

**1. `typecheck` passed unconditionally.** For `innocenz-admin` and
`innocenz-backend` the inferred target just echoed *"The 'typecheck' target is
disabled because one or more project references set 'noEmit: true'"* and exited
**0**. 19 real web type errors had never been seen by CI. Fixed by giving each app
an explicit `typecheck` **script** in package.json (package.json scripts become
nx targets here, and beat the inferred one).
`apps/mobile` uses `-p tsconfig.app.json` — its `tsconfig.json` is
SOLUTION-STYLE and compiles ZERO files, the trap CLAUDE.md documents.

**2. `check:drift` compared the live DB against `0070_snapshot.json`** while the
repo carries **131 migrations**. Snapshots stopped at 0070 because the migration
journal is corrupt and `drizzle-kit generate` cannot run. So it reported the same
5 FALSE problems on every run — `pr` (dropped in 0095), the two `sub_role`
columns (0107), `outlet_penalty_rule` (0113), `agency_pr.pr_id` (0121/0123/0129)
— and was BLIND to real drift in everything added after 0070. Rewritten to
compare against the **drizzle models** (`src/features/**/*.model.ts` via
`getTableConfig`), which cannot go stale. 36 tables → **51**.

**3. `@org/mobile:test` never ran a single test.** `react-native-maps` resolves a
native TurboModule at require() time; `CheckInScreen.tsx` requires it eagerly
whenever `Platform.OS !== 'web'`, so the only spec died on import.

**Why:** a check that always passes and a check that always fails are the same
bug — nobody reads either. See [[green-signals-that-lie]] and
[[absent-evidence-is-about-the-instrument]].

**How to apply:**
- **Prove a checker can FAIL before trusting it.** After rewriting check:drift I
  injected a bogus column into a model and confirmed it reported
  `COLUMN MISSING in live DB: agency.drift_probe_column` and exited non-zero,
  then reverted. Do that every time you touch it.
- Don't read a target's name and assume it runs. Run it with
  `--skip-nx-cache` and read the actual output — the cache was replaying the
  echo, which is how it looked green twice.
- `check:drift` reports orphan live tables (`dispute`, `platform_standards`) as
  a NOTE and does not fail on them — a dropped feature's leftovers are not a
  break in the running code.
