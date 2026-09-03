---
name: biome-scope-and-mobile-style
description: "Run biome from apps/web ONLY. The repo root errors on the nested config, and apps/mobile has no biome.json — running it there reformats a whole file away from the single-quote style every other mobile file uses"
metadata: 
  node_type: memory
  type: project
  originSessionId: c8d8947f-3a09-4756-9fc7-2fb0c514a0e5
  modified: 2026-08-26T07:46:40.209Z
---

**Run biome from `apps/web`, on `apps/web` files only.**

- **From the repo root it fails outright:** `apps/web/biome.json` is a nested root config and biome
  refuses — *"Found a nested root configuration, but there's already a root configuration."*
- **`apps/mobile` has no `biome.json`**, and its files are **single-quoted, 2-space indent**. The root
  config disagrees, so running biome on a mobile file reformats the *entire* file to double quotes and
  tabs. On `PvDetailScreen.tsx` that turned a ~60-line change into **1208 insertions / 920 deletions**
  and left one mobile file out of step with every other one.

I did that on 30 Jul 2026, caught it via `git diff --stat`, reverted with
`git checkout -- <file>`, and redid the edits by hand in the file's own style. Final diff: 115
insertions. **Do not run biome on mobile at all** — match the surrounding file by hand.

## Verification habits that paid off the same day

- `npx tsc --noEmit` from `apps/web` and `apps/mobile` separately. Baselines: **web 121**,
  **backend 0**, **mobile 10**.

  🔴 **CORRECTED 2 Aug 2026, and the correction reverses an earlier "correction".** This line used to
  read *"mobile 0 (older notes said mobile was 10 — stale)"*. **The older note was RIGHT and the
  "fix" was wrong** — mobile really is 10, across 4 files (`PaymentScreen.tsx` 4, `proof-photo.ts` 3,
  `PhoneSheet.tsx` 2, `demo-shifts.ts` 1).

  ⚠️ **The cause is the command, and it is easy to repeat.** From `apps/mobile` you must run:

  ```
  npx tsc -p tsconfig.app.json --noEmit
  ```

  **`apps/mobile/tsconfig.json` is a SOLUTION-style config** — `"files": []`, `"include": []`,
  `"references"` to `tsconfig.app.json` + `tsconfig.spec.json` — so `tsc -p tsconfig.json` compiles
  **nothing, by design**. It reports 0 errors because the program is empty, not because the app is
  clean. Confirm with `--listFiles`: the real run puts **58** `src` files in the program.

  ⚠️ I then over-corrected the other way and filed a P0 claiming mobile *"has never been typechecked,
  its config is missing `jsx`"*. **That was wrong too, and was retracted the same day** —
  `tsconfig.app.json` already sets `"jsx": "react-jsx"`. **A zero-file program means "I aimed at the
  wrong thing" far more often than "the project is broken".** See [[green-signals-that-lie]].

  🟢 **RE-MEASURED 26 Aug 2026 — mobile is now 0, and this time the instrument was checked first.**
  `npx tsc --noEmit -p tsconfig.app.json` reports **0 errors** over **90** `src` files (was 58 — the
  app grew, so the program got bigger, not emptier). Given this file's own history of flip-flopping,
  a bare 0 is worth nothing on its own, so it was proven three ways before being believed:

  1. `--listFiles` → **90** `src` files in the program. Not a zero-file program.
  2. Re-run with `--noUnusedLocals` → **44 errors** across those same files. The compiler is live on
     them and *will* speak when it has something to say.
  3. The old 10 are gone at source, not suppressed: the DOM-globals in `PhoneSheet.tsx` /
     `proof-photo.ts` / `PaymentScreen.tsx` and the `demo-shifts.ts:317` narrowing error are absent.

  **Consequence: on mobile there is no baseline left to subtract.** Any error after your change is
  yours. That is a *better* net than web's — do not carry the old "~11 is fine" number forward, and
  never accept a pass on `-p tsconfig.json` in its place.

  ⚠️ `CLAUDE.md` still says *"The REAL baseline is ~11 errors"*. That line is now stale. It was left
  alone deliberately — `CLAUDE.md` is rules-only by the owner's instruction, and the **rule** it
  carries (always `-p tsconfig.app.json`, never `-p tsconfig.json`) is still exactly right.
- When biome reports lint errors it cannot fix, check whether they are yours before owning them:
  `git diff -U0 -- <file>` and read the `@@` hunk headers for your changed line ranges. On
  `bookings.tsx` the 8 findings sat at lines 132/206/211/654 while the diff touched
  37/69-77/86-89/511-531 — pre-existing debt, proven rather than assumed.
- Biome reformats after commits, so expect a follow-up `style:` commit on web work.
