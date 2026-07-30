---
name: sync-memory-mirrors
description: "Standing rule — mirror Claude Code memory to repo docs/claude-memory + the Excel \"Claude Code Memory\" tab so other devices share it"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 88bfe12d-2821-45af-978c-7103c199f157
  modified: 2026-07-30T02:14:00.907Z
---

The user works on multiple devices (office PC + house PC, same Claude account) — file-based memory is per-machine, so it must be mirrored where every device can read it.

**Why:** (2026-07-30) "My house same Claude account but have no all those your current Claude code memory … so i can easily do in another devices and consistent and keep memory."

**How to apply:** After meaningful InnocenZ sessions (or when asked), sync BOTH mirrors:
1. Copy `memory/*.md` → repo `docs/claude-memory/` (verbatim) and keep the "InnocenZ project memory" section in repo `CLAUDE.md` current (condensed rules only — CLAUDE.md loads every session). Commit on `jk`; the user pushes.
2. Regenerate the **"Claude Code Memory" tab** in `C:\Users\jinkg\Downloads\InnocenZ_BuildSteps.xlsx` — script pattern: node + the repo's `exceljs` (no Python on this PC; require it by absolute path `C:/Users/jinkg/Downloads/InnocenZ/InnocenZ/node_modules/exceljs`). Back up the xlsx first. The workbook also holds "Next Steps Priority" (todo order) and "Database" (live ERD/FK proof) tabs — when updating priorities, verify claims against the repo (things get built by other sessions between refreshes).

Related: [[pr-mobile-backend-wiring]], [[verify-against-test-script]].
