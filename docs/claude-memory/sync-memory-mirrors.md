---
name: sync-memory-mirrors
description: "Standing rule — mirror Claude Code memory to repo docs/claude-memory + the Excel \"Claude Code Memory\" tab so other devices share it"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 88bfe12d-2821-45af-978c-7103c199f157
  modified: 2026-07-30T07:12:22.270Z
---

The user works on multiple devices (office PC + house PC, same Claude account) — file-based memory is per-machine, so it must be mirrored where every device can read it.

**Doc-role mapping (2026-07-30, user adopted the "4 md files" agent-memory system from a Xiaohongshu post — "memory.md is my testscript.md"):**
- `CLAUDE.md` = RULES ONLY — update ONLY when a rule changes ("got new rules only renew at the claude.md"), never as routine session sync.
- `TEST_SCRIPT.md` = the Memory.md role — the LIVING session record; renew it on EVERY work slice (§8 done / §9 to-do next / §10 changelog).
- `docs/claude-memory/*.md` + the Excel "Claude Code Memory" tab = the Learning/Wiki layer — full memory mirror for other devices.

**Why:** (2026-07-30) "My house same Claude account but have no all those your current Claude code memory … so i can easily do in another devices and consistent and keep memory."

**How to apply:** After meaningful InnocenZ sessions (or when asked), sync BOTH mirrors:
1. Copy `memory/*.md` → repo `docs/claude-memory/` (verbatim, ALL files including MEMORY.md — a partial copy once dropped innocenz-database-rules.md) and keep the "InnocenZ project memory" section in repo `CLAUDE.md` current (condensed rules only — CLAUDE.md loads every session). Commit on `jk`; the user pushes/merges to `main` so `git pull` on the other device receives it. On a new device: copy `docs/claude-memory/*.md` into `%USERPROFILE%\.claude\projects\C--Users-jinkg-Downloads-InnocenZ-InnocenZ\memory\` to restore native memory.
2. Regenerate the **"Claude Code Memory" tab** in `C:\Users\jinkg\Downloads\InnocenZ_BuildSteps.xlsx` — script pattern: node + the repo's `exceljs` (no Python on this PC; require it by absolute path `C:/Users/jinkg/Downloads/InnocenZ/InnocenZ/node_modules/exceljs`). Back up the xlsx first. The workbook also holds "Next Steps Priority" (todo order) and "Database" (live ERD/FK proof) tabs — when updating priorities, verify claims against the repo (things get built by other sessions between refreshes).

Related: [[pr-mobile-backend-wiring]], [[verify-against-test-script]].
