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

# InnocenZ project memory (synced 30 Jul 2026 — works on ANY device with this repo)

Full session memory is committed at **`docs/claude-memory/*.md`** (verbatim copies of the
office PC's Claude Code memory) and mirrored in the **"Claude Code Memory" tab of
`InnocenZ_BuildSteps.xlsx`**. Read `docs/claude-memory/MEMORY.md` first — it indexes the rest.
On a new machine you may also copy those files into
`%USERPROFILE%\.claude\projects\C--Users-jinkg-Downloads-InnocenZ-InnocenZ\memory\` to restore
native memory. After meaningful sessions, update both `docs/claude-memory/` and the Excel tab.

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
   live ERD/FK proof; known weak edges: `rating.pr_id` is varchar (needs uuid + FK) and
   `user_role` is missing its two FKs.

## Working rules

- **Doc roles (the 4-md memory system):** `CLAUDE.md` = rules only — update ONLY when a rule
  changes. `TEST_SCRIPT.md` = the living session memory — renew it on EVERY work slice
  (§8 done / §9 to-do next / §10 changelog). `docs/claude-memory/` + the Excel
  "Claude Code Memory" tab = full memory mirror for other devices.
- `TEST_SCRIPT.md` (repo root) is the single source of truth: verify every change against it,
  add new requirements to §9, promote to §8 when verified, append a §10 changelog row.
- Typecheck baselines — judge ONLY files you touched: backend has 26 pre-existing TS2883
  router errors (one per `*.routes.ts`) + 2 known `pr.repository.ts` lines; `apps/web` has its
  own pre-existing baseline; `apps/mobile` is 0-error.
- `apps/web`: biome (tabs, double quotes); new routes need `npx tsr generate`.
- PR-scoped backend endpoints use the `/mine` pattern (derive `pr.id` server-side via
  `prRepository.getByUserId`, placed BEFORE `/:id` and OUTSIDE role guards).
- Branch `jk` = this user; branch `SL` = teammate (outlet + agency web).

<!-- nx configuration end-->
