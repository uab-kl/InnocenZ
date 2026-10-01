---
name: kpi-formula-never-displayed
description: "STANDING RULE (owner, 29 Sep 2026) — the PR KPI is a 0–100 number; its formula is never shown to anyone. The WEIGHTS live only in the server-only env KPI_WEIGHTS (never in code/git); only `kpiScore` leaves the server"
metadata:
  type: feedback
---

Owner, 29 Sep 2026, answering "should KPI be a numeric score?": *"yes just make sure the KPI
formula won't be displayed to anyone"*.

**What exists (built 29 Sep):** `apps/backend/src/features/pr-personnel/kpi-score.ts` holds the
scoring (a pure function, no env, no logging) and the check-in grace, window and star scale. The
WEIGHTS are NOT in the code (owner, 29 Sep: "Move to a private setting"): `pr-kpi.ts` reads the
server-only env `KPI_WEIGHTS=reliability=<n>,punctuality=<n>,rating=<n>` through
`parseKpiWeights`; unset/malformed → no query, every PR shows "—", ONE warning per process that
never echoes the value. Every server needs its own value (this machine's root `.env` was set on 29
Sep; staging/production `.env.backend` — see `tools/deploy/*.example` — are the owner's to set).
The tests use made-up weights so no ratio can be read from them. `pr-kpi.ts` loads the inputs in one query per `GET /pr` list request. Only
`kpiScore: number | null` is attached to each row. Agency callers are scored on their own
agency's shifts; admin across all agencies (or `?agencyId=`); outlet callers never get it
(`kpiScore` is also on the outlet redaction list); the PR role cannot call `GET /pr`. The agency's
A/B/C grade is now labelled "Agency grade", never "KPI". Tests pin the exposure:
`pr-kpi-exposure.test.ts` (no formula words in any response).

**Why:** a PR who can read how the score is computed can game it, and the owner wants the number
to be a judgement, not a target.

**How to apply:**
- Never render the components, weights, grace or window in any UI, tooltip, export, notification,
  API response or log line — not even an "info" popover explaining the score. Show the number or
  "—".
- A new screen that needs the score reads `kpiScore` from the list; do not add a breakdown field.
- Never write the real weights into code, tests, comments, docs, commit messages or chat summaries —
  the repo is public by choice ([[repo-public-is-intentional]]). Retune by changing `KPI_WEIGHTS` on
  each server.

Related: [[innocenz-rbac-portal-cru]], [[demo-data-leaks-into-real-sessions]].
