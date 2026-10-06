---
name: chat-follows-the-system
description: "Landing chat facts are generated from the code (58 tables, RBAC snapshot, menus, TEST_SCRIPT §11) since 5 Oct 2026 — the generator REFUSES until a new table/module/lane has public wording; live rows never go in"
metadata:
  node_type: memory
  type: project
  originSessionId: c6cdc664-67bd-4076-92b6-99ab40e57077
  modified: 2026-10-05T06:42:11.225Z
---

`pnpm chat:facts` builds the Gemini facts from the written guide PLUS 11 "system" sections read from the code by `tools/scripts/landing-chat-system-facts.mts`: app tabs, both portal menus, "Who can do what" per team lane (from `rbac-grants.generated.ts`), "What InnocenZ keeps" (every backend table) and "What's new" (TEST_SCRIPT.md **§11**, `| date | side | EN | 中文 |`). Public wording lives only in `apps/web/src/components/landing/handoff/landing-chat-system.ts`. `public-safety.ts` (backend) scans the facts at build time and every Gemini reply at runtime (refused + not cached). CI runs `pnpm chat:facts:check`.

**Why:** owner, 5 Oct 2026 — *"the chatbot need read from my system flow, database structure, data, and md files"*; chose "Public chat knows the whole system". The facts go to Google on a free key and to anonymous visitors, so "data" was deliberately read as the system's SHAPE, never live rows.

**How to apply:** a new table/module/lane makes the generator fail with what to add — write a plain sentence or a `hidden` entry with its reason; never weaken the check. A visible change → a §11 row then `pnpm chat:facts`. Lane-gated rules (`orgOwnerPaysOnly`, cut-loss, `viewLiveFloor`) are hand-kept in `TEAM_NOTES`. A running `tsx watch` backend may not restart on the generated file — restart it before testing live. Phase 2 (send only relevant sections) is not built. Related: [[chat-side-buttons-are-written]], [[record-every-enhancement-in-the-book]], [[absent-evidence-is-about-the-instrument]].
