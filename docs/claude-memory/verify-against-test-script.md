---
name: verify-against-test-script
description: Standing rule — verify every InnocenZ change against TEST_SCRIPT.md and add new requirements into it
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 7b94d59a-ea45-4dd5-87ac-8b513035ce33
  modified: 2026-07-23T02:03:08.104Z
---

For all InnocenZ work, verify every change against the repo's analysis test script `TEST_SCRIPT.md` (repo root) — it is the single source of truth. When a new requirement surfaces mid-task, add it INTO the script (§9 To-Do, promote to §8 Done when verified, append §10 Changelog row) — don't leave the requirement living only in code.

**Why:** The user said (2026-07-23) "from now everytimes do verify from the analysis test script, because sometime also need to add somethings due to new requirements." The script is the shared 4-role checklist (jk + SL); if a change isn't reflected there, the other owner can't see it and the daily run-through drifts from reality.

**How to apply:** Before/after a change, (1) find the matching §3 spine step or §4 solo item, (2) confirm the change satisfies it, (3) if it's genuinely new, add a §9 line and, once verified, move it to §8 with role-link + data-source columns and append a §10 Changelog row (newest at top). Honors [[innocenz-daily-test-tracker]] (Option-2, no automation; .md is source of truth). Related: [[pr-mobile-backend-wiring]].
