<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

# THE FIX RULES — run these on EVERY change (owner, 13 Sep 2026)

**Stated by the owner as a standing instruction, for every device, every session, and
everyone who touches this repo** — *"everytime in different device or different session when
other people touch this innocenz repo folder project, do anything or function, or fixing,
remember the below"*. They are first in this file because they come first in the work.

1. **Remember the rules in this InnocenZ.** Everything below in this file — the database
   rules, RBAC from the database, the status colours, no demo data on a real session, the
   typography ladder. A fix that breaks a rule is not a fix.
2. **Check the DATABASE first.** Before believing any claim about behaviour, look at the
   rows. Most "bugs" here are settled by one read-only query, and several have turned out to
   be the data rather than the code (see the Havoc and rate-card entries in `TEST_SCRIPT.md`
   §9).
3. **Does it work with the UI *and* the database?** A green typecheck is not the product
   working. Verify the screen and the stored row together.
4. **Do the functions and modules work on ALL pages — can the user SEE it and USE it?**
   Walk the pages the change touches, not just the one that was edited.
5. **After fixing, say what is LEFT.** Which errors, failures or bugs are solved, what still
   stands, and what else was found. An unreported remainder is a bug nobody is looking for.
6. **Check EVERY member, account and role — and every organisation.** Outlet, PR agency, PR
   and admin, on the WEB and in the APPLICATION. A fix verified as the owner only is verified
   for one of eleven lanes; `_probe-mint-session.ts` mints a read-only session for each.
7. **Then CONTINUE — and keep remembering these rules while you do.** One fix is not the job;
   the backlog in `TEST_SCRIPT.md` §9 is. Carry on to the next item and apply 1-6 again to it,
   rather than stopping at the first thing that goes green.

⚠️ Two rules that override any instinct to "just try it":
* **NEVER probe a write gate with a write.** A previous session destroyed two venues' entire
  rate cards that way. Read the code, read the rows, unit-test the parse.
* **A zero result is evidence about the INSTRUMENT, not about the codebase.** No grep hits, a
  SKIP, a clean run — prove the tool would have found something before reporting nothing.

# InnocenZ project memory (works on ANY device with this repo)

Full session memory is committed at **`docs/claude-memory/*.md`** — 26 memories plus
`MEMORY.md`, which indexes the rest and must be read first.

**Syncing it is one command, on any device** (3 Sep 2026 — it replaces the hand-copy that used
to live here):

```bash
node tools/scripts/sync-claude-memory.mjs          # union both ways, then rebuild MEMORY.md
node tools/scripts/sync-claude-memory.mjs --check  # report drift only, exit 1 if any
```

On a new machine: `git pull`, then run it — it creates the native folder and fills it.

⚠️ **Never hand-copy into a folder name written down somewhere.** Claude Code names the native
folder after the repo's ABSOLUTE PATH, `:` and every separator replaced by `-`, so this machine's
`C:\Users\jinkg\Downloads\InnocenZ\InnocenZ` is `C--Users-jinkg-Downloads-InnocenZ-InnocenZ`
(a DOUBLE dash after the drive letter — not a typo). A machine that clones to `D:\work\InnocenZ`
needs `D--work-InnocenZ`; copying into the name above would write where **nothing ever reads** —
no error, no memories, and the session simply behaves as if it had never met the project. The
script derives the name from wherever the repo actually is.

⚠️ **Sync runs in BOTH directions** (rule corrected 13 Aug 2026). The mirror and the machine's
own `memory/` folder are each other's backup, not source and copy: **compare first** (hash every
`.md` both ways, normalising CRLF), then **union** — never overwrite one side wholesale — and
regenerate `MEMORY.md` from the union rather than copying it. A one-way copy is what let the two
stores drift 13 files apart, hiding 8 standing rules from the second device. The script encodes
all of that and **refuses to resolve a two-sided conflict** — it prints both paths and exits 1,
because preferring the file whose claims match real code needs someone to read the code. Re-run
with `--prefer-repo` / `--prefer-native` once you have.

⚠️ **Session transcripts do NOT travel, and are not meant to.** `~/.claude/projects/<slug>/*.jsonl`
is ~3 GB over ~85 files here, per-device and not gittable. What carries the project between
devices is `CLAUDE.md` + `TEST_SCRIPT.md` + the memory mirror, all three in git — "same session"
elsewhere means the same KNOWLEDGE resumed from those, not the same scrollback.

⚠️ The memory mirror is NO LONGER kept in the workbook (owner's call, 11 Aug 2026).
`InnocenZ_BuildSteps.xlsx` is the **one and only book** (owner's call, 17 Aug 2026 — the MVP
workbook was retired to `InnocenZ_MVP_v4_RealApp.ARCHIVED-20260817.xlsx` because ~10 of its 14
tabs were a staler second copy of a page already here, and the two had started contradicting
each other). **Never create a second workbook**: one fact, one place — the database rule,
applied to documents.

Its 14 tabs are NUMBERED and colour-coded into three parts, and both facts must be preserved
when regenerating:
- **Part 1 · blue — Understand it** (1-8): START HERE · The Week — money · Money model ·
  PR — phone · Outlet — venue · Agency — web · Admin — web · Shared rails.
- **Part 2 · amber — Judge it** (9-12): Who may do what · Where it stops · What to build next ·
  Build tracker.
- **Part 3 · grey — Look it up** (13-14): The API · Database + Services.

It carries **no dates and no session log** — those belong in `TEST_SCRIPT.md` §8/§10, and the
"why" belongs in `docs/claude-memory/`. Its flow pages are generated by reading the code and
then re-checked by trying to disprove every "built"; regenerate that way after a big slice
rather than hand-editing many cells. **Two pages are pure arithmetic over the flow pages and
must be regenerated with them, never hand-edited**: `12 Build tracker` (the counts) and
`10 Where it stops` (one line per ⚠️/❌). Leaving them behind is how the book starts lying —
on 17 Aug the tracker said 493 steps while the pages carried 545, and "Where it stops"
described 106 gaps against 141.

## Database rules (non-negotiable — every schema change)

1. If an existing table fits, USE it — never create a new table when one fits.
2. If a table has audit columns, `created_at` / `updated_at` / `created_by` / `updated_by`
   must ALL be present together.
3. Use FOREIGN KEYS to read data from other tables (outlet/PR name, …) — never duplicate a
   column like `name`. One fact lives in one table; no duplicated data anywhere.
4. Every table's `id` (uuid PK) is the FIRST column; UI features that store data reference
   rows by that primary id.
5. Migrations: run `pnpm migrate:deploy` from the repo ROOT (NEVER `pnpm migrate`), then
   restart the backend (tsx watch serves stale routes). The workbook's **Database** tab is the
   live ERD/FK proof — 45 tables and 68 declared foreign keys, re-derived from the models on
   11 Aug 2026. `rating.pr_id` is varchar with no FK — ⚠️ DELIBERATE, not a gap to close.
   The model comment (`rating.model.ts:6-9`) records why: an outlet's PR list is not
   backend-enumerable from an outlet token, so the id may be a real PR uuid OR the frontend's
   own identifier. Converting it to a uuid FK would break outlet ratings. This line used to
   call it "ONE weak edge left … (needs uuid + FK)"; confirm with the team before migrating it.
   `user_role` now carries both of its FKs. There is no `pr` table — it was dropped; a PR is a
   `user` row and the membership (with its tier) lives on `agency_pr`.

## RBAC comes from the DATABASE (owner, 11 Sep 2026 — non-negotiable)

**"The rbac must ensure what can do what cannot do, ofcourse must from the database … web
matrix must follow what database given."**

`role_permission` is the authority. The server already obeys it —
`requirePermission(moduleKey, verb)` resolves the caller's membership of the ACTING org, maps
that row's `sub_role` to a role name (`portalRoleNameForSubRole`) and asks
`roleHasPermission`. What the table says is what the API allows.

The portals used to carry a hand-written SECOND copy of that table in
`outlet-rbac.ts` / `agency-rbac.ts`, and it had drifted **14 cells** — the database won every
one of them at runtime, so the copy was a stale description contradicting the screen (it
called outlet Finance "view only" while Post Job sat in their sidebar and `POST /shift`
admitted them). The matrix is now DERIVED:

```bash
pnpm rbac:sync     # rewrite apps/web/src/agency-portal/lib/rbac-grants.generated.ts
pnpm rbac:check    # exit 1 while that snapshot disagrees with the live table
```

- **To change what a role may do, edit `apps/backend/src/scripts/seed-rbac.ts`, run
  `pnpm migrate:deploy`, then `pnpm rbac:sync`.** Editing the web matrix does nothing — the next
  sync overwrites it and `rbac-matrix.test.ts` fails.
- ⚠️ **`seed-rbac.ts` is what WRITES `role_permission`**, and it runs on every
  `migrate:deploy`. A migration that INSERTs grants is the wrong tool: the billing-grant
  migration tried it, was ledgered, never applied (the standing `migrate:deploy` trap), and was
  deleted — it would only have been a second quieter source of the same rows. ⚠️ That file was
  numbered 0164, and **0164 is now `0164_audit_log_portal.sql`, an unrelated migration that DID
  apply** — do not read the number as evidence about the audit-log column.
- ⚠️ **The seeder only ADDS — it "ensures" and never removes.** That is how outlet Finance came
  to hold 19 grants while the seeder listed 7 (fixed 11 Sep 2026, the file now matches).
  `pnpm rbac:seed-check` now diffs the live rows against `ROLE_GRANTS` and exits 1 on drift —
  run it beside `rbac:check`, which only proves web == database. ⚠️ **Removing** a grant still
  needs the row deleted by hand; the seeder only ever adds, and `rbac:seed-check` is what tells
  you one is left over.
- ⚠️ **TWO permissions are deliberately matrix-only**, because the server gates them by LANE and
  there is no module to grant: outlet `requestCutLoss` (no `cutlost` module — `POST /cutlost`
  is `requireOutletSubRole('owner','finance','operations_head')`) and agency `viewLiveFloor`
  (unmapped on purpose so no grant can hand it to finance). Their lane lists live in
  `MATRIX_ONLY` and must mirror the server's — a wrong entry is a button that collects a 403.
- ⚠️ `/auth/me` returns the UNION of every role an account holds **across portals**, and
  `settings` / `dashboard` / `history` are a SEPARATE module row per portal. Every grant now
  carries `portalCode` and `grantsForPortal()` drops the other console's rows — without it an
  agency owner who is merely a Finance head at some venue was offered Edit on that venue.
- **Outlet `billing:update` (`confirmDaily`, the daily reconciliation confirm) is held by the
  Owner and the Guarantor** — granted 11 Sep 2026, re-verified against the live
  `role_permission` on 12 Sep. Finance, Ops Head and Director hold `billing:read` and are
  refused. ⚠️ This line used to say it was held by nobody and to "grant it and re-sync"; that
  was true only before 11 Sep, and acting on it now re-grants a row that already exists.

## Working rules

- **Doc roles:** `CLAUDE.md` = rules only — update ONLY when a rule changes.
  `TEST_SCRIPT.md` = the living session memory — renew it on EVERY work slice
  (§8 done / §9 to-do next / §10 changelog). `docs/claude-memory/` = full memory mirror for
  other devices. `InnocenZ_BuildSteps.xlsx` = the flow book for the owner (flows, where each
  one stops, and the schema) — flows only, never a log.
- `TEST_SCRIPT.md` (repo root) is the single source of truth: verify every change against it,
  add new requirements to §9, promote to §8 when verified, append a §10 changelog row.
- Typecheck baselines — judge ONLY files you touched. ⚠️ **Backend and `apps/web` are BOTH at
  ZERO errors as of 27 Aug 2026** (backend re-measured: 400 files, exit 0). The old "26
  pre-existing TS2883 router errors + 2 `pr.repository.ts` lines" NO LONGER HOLDS — treat any
  backend or web error as yours until proven otherwise, and prove it by stashing and re-running,
  not by assuming. (`apps/mobile` still has the real baseline described below.)
- ⚠️ **`apps/mobile` MUST be checked with `npx tsc --noEmit -p tsconfig.app.json`.** Its
  `tsconfig.json` is SOLUTION-STYLE (`"files": []`, `"include": []`, references only), so
  `-p tsconfig.json` compiles **zero files** and always reports clean. That is where the old
  "`apps/mobile` is 0-error" claim came from, and it hid a real crash: `Check` used in
  PaymentScreen without being imported, which blanked the screen on opening the dispute sheet
  (5 Aug 2026). The baseline was ~11 errors (DOM globals in `PhoneSheet.tsx`, `proof-photo.ts`,
  `PaymentScreen.tsx`, and `demo-shifts.ts:317`); **re-measured 17 Sep 2026 it is 0** — treat any
  `tsconfig.app.json` error as yours. Test files are not covered by it (`tsconfig.spec.json` needs
  `tsc -b`).
- `apps/web`: biome (tabs, double quotes); new routes need `npx tsr generate`.
- PR-scoped backend endpoints use the `/mine` pattern (derive `pr.id` server-side via
  `prRepository.getByUserId`, placed BEFORE `/:id` and OUTSIDE role guards).
- Branch `jk` = this user; branch `SL` = teammate (outlet + agency web).
- **Status colour code (owner, 23 Aug 2026), every receipt/PV surface:** green = settled
  (verified, sealed wages, totals, signed/paid), amber = waiting — pending AND approved
  share it deliberately, white = mixed states, red = disputed/deductions. Mobile authority:
  `cellReviewTone()` in `receipt-review.ts`; web: `STATUS_VARIANT` in AgencyReceiptsPanel.
- **Real outlet/agency logins: NEVER leave Velvet/Atlas demo data on screen.**
  Use `BLANK_OUTLET_*` / `BLANK_AGENCY_*` in `buildBlankPortalReset` and Settings
  overlays — not `DEFAULT_*`. See `.cursor/rules/no-demo-data-on-real-sessions.mdc`.
- **TYPOGRAPHY IS ENFORCED, NOT ADVISED (owner, 8 Sep 2026).** The ladder rule below is now a
  check, because a rule nothing runs is a rule that erodes — that is how the portals
  reached 27 sizes and a font that was never loaded.

  ```bash
  pnpm check:type          # fails on any NEW breach
  pnpm check:type:update   # bank an improvement into the baseline
  ```

  `tools/scripts/check-portal-typography.mjs` scans `agency-portal/`, `routes/agency/`
  and `routes/outlet/` for four things: **A** a `font-family` that is not
  `var(--iz-font)`, **B** a `font-size` that is not a `--iz-fs-*` step, **C** a Tailwind
  class NAMING a font (`font-sora` / `font-manrope` / `font-display` / `font-mono`), and
  **D** an arbitrary size (`text-[13px]`, **and its `!text-[13px]` twin** — they are
  different classes, which is how 163 call sites escaped the ladder unseen).

  ⚠️ **It is a RATCHET, not a zero.** The 7 Sep pass put every RENDERED element on the
  ladder using override layers, so the source still carries **1,004 raw values** that the
  cascade normalises. Demanding zero would fail on day one and be switched off on day two.
  Today’s counts are frozen per file+rule in `portal-typography-baseline.json`; the check
  fails only when a count GROWS. Fixing legacy is always welcome — `--update` banks it and
  the baseline can then only tighten. **Never re-baseline to make a new breach go away.**

  A genuine exception goes in `EXCEPT[]` in that script **with its reason** (today: the
  `.iz-pv-doc` printed voucher, and container-query sizes) — never by disabling the check.

  ⚠️ This checks the SOURCE. It does not replace measuring the rendered page: the 7 Sep
  bugs were found by `getComputedStyle` in a live browser, not by reading files.

- **Portal type comes from the ladder, never from a raw px value (owner, 7 Sep 2026).**
  `prototype-theme.css` `:root` defines ONE font (`--iz-font`) and EIGHT sizes —
  `--iz-fs-` `micro` 11 · `tiny` 12 · `caption` 14 · `label` 16 · `body` 18 ·
  `title` 22 · `head` 28 · `display` 34. Size encodes depth in the hierarchy and
  nothing else. Adding a raw `font-size: 13px` or a new family is what produced 27
  different sizes and a "Sora" that **was never loaded in any import** — 243 rules
  silently rendering Arial beside real Manrope. Titles take `--iz-title` (lavender);
  champagne gold stays reserved for *act* on buttons. Two deliberate exceptions:
  `.iz-pv-doc` (the printed voucher keeps Segoe UI + Georgia to match its PDF/Excel)
  and `clamp()`/`cqw` sizes that are meant to be responsive.
  ⚠️ **Tailwind's `!` prefix makes a DIFFERENT class** — `!text-[9px]` compiles to
  `.!text-[9px]`, which a rule written for `.text-[9px]` never matches. And for
  `!important` declarations the cascade REVERSES layer order, so an un-layered override
  LOSES to Tailwind's `@layer utilities`: the portal's bang remaps live inside
  `@layer utilities` for exactly that reason. ⚠️ **`clamp()` interpolates**, so it renders
  values between steps — size fluidly with a breakpoint or a container query, never a clamp.
  ⚠️ The font classes are `iz-heading` (heading/figure hook) and `iz-nums` (tabular
  numerals). `font-sora`, `font-manrope` and portal `font-mono` are GONE — they named
  fonts that were not loaded. `font-mono`/`font-display` outside the portals are real.

<!-- nx configuration end-->
