---
name: chat-follows-the-system
description: "Landing chat facts are generated from the code (58 tables, RBAC snapshot, menus, TEST_SCRIPT §11) since 5 Oct 2026 — the generator REFUSES until a new table/module/lane has public wording; live rows never go in"
metadata:
  node_type: memory
  type: project
  originSessionId: c6cdc664-67bd-4076-92b6-99ab40e57077
  modified: 2026-10-15T04:40:02.299Z
---

`pnpm chat:facts` builds the Gemini facts from the written guide PLUS 11 "system" sections read from the code by `tools/scripts/landing-chat-system-facts.mts`: app tabs, both portal menus, "Who can do what" per team lane (from `rbac-grants.generated.ts`), "What InnocenZ keeps" (every backend table) and "What's new" (TEST_SCRIPT.md **§11**, `| date | side | EN | 中文 |`). Public wording lives only in `apps/web/src/components/landing/handoff/landing-chat-system.ts`. `public-safety.ts` (backend) scans the facts at build time and every Gemini reply at runtime (refused + not cached). CI runs `pnpm chat:facts:check`.

**Why:** owner, 5 Oct 2026 — *"the chatbot need read from my system flow, database structure, data, and md files"*; chose "Public chat knows the whole system". The facts go to Google on a free key and to anonymous visitors, so "data" was deliberately read as the system's SHAPE, never live rows.

**How to apply:** a new table, a newly checked `module:verb` grant, or a lane makes the generator fail with what to add — write public wording (`TABLE_SENTENCES` / `GRANT_PHRASES`) or a `hidden` entry with its reason; never weaken the check. Word a grant by what its gate OPENS (`workforce:read` = Roster, `workforce:update` = Manage PR) — the first per-module wording told visitors Finance could use Manage PR. A visible change → a §11 row then `pnpm chat:facts`. Cut-loss/live-floor lanes are parsed from `MATRIX_ONLY`; only the owner-pays rule is hand-kept (`TEAM_NOTES`, with a tripwire). **"Slow and not smart" on 5 Oct was a stuck `tsx watch` backend** (process from 13:42 ignoring edits; every answer = the 15 s written backup) — touch `apps/backend/src/main.ts` and confirm the PID's start time before judging the chat. Typed questions think "medium" (~2–6 s); a PRIVACY rule makes people-lookups ("which PR has…", a name) start with a kind refusal, then the rule. Phase 2 (send only relevant sections) is not built.

**15 Oct — the LIVE site never reached Gemini:** innocenz.net → 403 (the chat route kept its own site list built from FRONTEND_URL; now `util/site-origins.ts`, shared with CORS — fixed in code, deploy pending), www.innocenz.net → 503 (production has no `GEMINI_API_KEY`). Judge "is it Gemini" by the "✨ AI answer from InnocenZ's own guide" line or a probe from outside (`curl -X POST https://www.innocenz.net/api/v1/landing-chat -H "Origin: https://innocenz.net"`), never by localhost.

**Measured 5 Oct (iii):** 40 live questions → 40/40 Gemini, median 4.8 s; graded vs code 33 correct / 6 partly / 1 wrong, all fixed. Lessons: word a grant only after finding what the REAL (non-demo) session renders (`billing:update` "confirm daily" is demo-only); an adversarial trace found the CI facts check could never run (format:check first — generated file now in .prettierignore) and that the chat does NOT follow column changes, in-page flows, DB-only permission edits (rbac:sync reads the TEST db), unlisted lanes, or server-only lane gates — don't promise "follows everything by itself". The written backup never sees the generated sections. Related: [[chat-side-buttons-are-written]], [[record-every-enhancement-in-the-book]], [[absent-evidence-is-about-the-instrument]].
