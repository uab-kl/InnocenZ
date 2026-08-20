---
name: sync-memory-mirrors
description: "Standing rule — mirror Claude Code memory to repo docs/claude-memory in BOTH directions so every device shares it; the Excel workbook is no longer a memory mirror"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 88bfe12d-2821-45af-978c-7103c199f157
  modified: 2026-08-13T00:35:21.966Z
---

The user works on multiple devices (office PC + house PC, same Claude account) — file-based memory is per-machine, so it must be mirrored where every device can read it.

⚠️ **Sessions run in PARALLEL across devices (confirmed 20 Aug 2026** — "this session i use different devices while use claude can continue the session memory"**).** The owner drives Claude on BOTH machines at once against the same repo: one device was on `jk`, the other on `main`, editing the same files in the same hour. Consequences: (1) files changing under a running session are the owner's other device, not corruption — take the newer content and continue, never revert; (2) expect merge conflicts in `TEST_SCRIPT.md` §10 (both sides append changelog rows at the same anchor) — resolve by UNION of both sides' rows, deduplicated, never pick-a-side; (3) a fix you reported may already be BUILT on the other device (the PV per-agency re-key was migration 0129 on main while `jk` still carried the analysis) — check `git log main` before re-implementing; (4) keep the memory mirror + TEST_SCRIPT current on every slice, because the other device may resume from them within minutes, not days.

**Doc-role mapping (2026-07-30, user adopted the "4 md files" agent-memory system from a Xiaohongshu post — "memory.md is my testscript.md"):**
- `CLAUDE.md` = RULES ONLY — update ONLY when a rule changes ("got new rules only renew at the claude.md"), never as routine session sync.
- `TEST_SCRIPT.md` = the Memory.md role — the LIVING session record; renew it on EVERY work slice (§8 done / §9 to-do next / §10 changelog). ENFORCED by the repo's Stop hook `.claude/hooks/renew-test-script.js` (registered in project `.claude/settings.json` hooks.Stop): it blocks ending a turn while apps/packages/tools changes aren't reflected by a renewed TEST_SCRIPT.md.
- `docs/claude-memory/*.md` = the Learning/Wiki layer — **the only** full memory mirror for other devices.
- `InnocenZ_BuildSteps.xlsx` = the owner's **one and only book** — 14 numbered tabs in three colour-coded parts (blue *Understand it* 1-8 · amber *Judge it* 9-12 · grey *Look it up* 13-14). **Not a memory mirror and not a log.**

⚠️ **THE MVP WORKBOOK IS RETIRED (owner's call, 2026-08-17).** `InnocenZ_MVP_v4_RealApp.xlsx` became `…ARCHIVED-20260817.xlsx`. About 10 of its 14 tabs were a staler second copy of a page already in the flow book, and the two had begun contradicting each other — its Overview said sub-roles were done while its own E2E Flow said they were not. Only its services-and-hooks inventory was unique; that is folded into tab `14 Database + Services`. **Do not create a second workbook.** One fact, one place — see [[innocenz-database-rules]], the same rule applied to documents.

⚠️ **SUPERSEDED 2026-08-11 (owner's call):** the Excel **"Claude Code Memory" tab is gone and must NOT be regenerated.** The workbook was rewritten as a flow-only book; its "Next Steps Priority", "Overall + Implementation" and "Build Steps" pages were deleted with it because they had become dated session logs. Anything dated belongs in `TEST_SCRIPT.md` §8/§10; the "why" belongs here in `docs/claude-memory/`.

**Why:** (2026-07-30) "My house same Claude account but have no all those your current Claude code memory … so i can easily do in another devices and consistent and keep memory."

**How to apply.** After meaningful InnocenZ sessions (or when asked), sync the mirror **in BOTH directions** — this is the whole rule, not a detail:

1. **Compare first, copy second.** Hash every `.md` in `memory/` against `docs/claude-memory/`, normalising CRLF, and classify each as native-only / repo-only / differs / same. Only then copy.
2. **Union, never overwrite wholesale.** Native-only files go to the repo; repo-only files come back to native. `MEMORY.md` is regenerated as the union of everything, never copied from one side.
3. **On a conflict, the file that names real code wins** — check the claim against the repo before choosing.
4. Keep the "InnocenZ project memory" section in repo `CLAUDE.md` current (condensed rules only — CLAUDE.md loads every session). Commit on `jk`; the user pushes/merges to `main` so `git pull` on the other device receives it.

**Why both directions (2026-08-13, learned the hard way):** the two stores had silently drifted **13 files apart** — 8 memories existed only in native (`confirm-every-action`, `day-status-lifecycle`, `deploy-blockers`, `dispute-rule`, `mobile-flexible-ui`, `payee-name-format`, `r2-buckets`, `tier-is-per-membership`) and 5 only in the repo (`account-and-phone-rules`, `org-scope-guards`, `rbac-portal-cru`, `receipt-lifecycle`, `run-the-pr-app`), while each `MEMORY.md` indexed only its own half. A one-way copy would have destroyed one side. Two same-named files had also diverged, and in **both** cases the repo copy was the correct one (native still said `features/pr/`, the real path is `features/pr-personnel/`).

**Restoring memory on a NEW device:**
1. `git clone` / `git pull` the repo (branch `jk`, or `main` once merged) — any path works.
2. Copy `docs\claude-memory\*.md` into `%USERPROFILE%\.claude\projects\C--Users-jinkg-Downloads-InnocenZ-InnocenZ\memory\`. (The folder name is the working directory with separators replaced by `-`; if the repo sits elsewhere, match the folder name that Claude Code creates on that machine.)
3. Read `MEMORY.md` first — it indexes the rest.

Related: [[verify-against-test-script]], [[innocenz-database-rules]], [[innocenz-env-gotchas]].
