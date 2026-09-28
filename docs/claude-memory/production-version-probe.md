---
name: production-version-probe
description: "How to tell which build innocenz.net / staging runs without credentials — authed routes all 401 (useless), use a dated PUBLIC route; plus the 28 Sep 2026 reading and the repo-is-public finding"
metadata:
  node_type: memory
  type: project
  originSessionId: 9b91b63a-a374-4bab-8706-1adf2e265fbb
  modified: 2026-09-28T05:47:34.722Z
---

**Method (no login, read-only GETs).** Every unknown `/api/v1/*` path answers **401**, because the
auth catch-all runs before any 404 — so probing authenticated routes tells you nothing (a control
path `/api/v1/definitely-not-a-route` also returns 401; always include that control). Use a
**public** route whose first commit date you know (`git log -S"'/outlets'" -- apps/backend/src/features/auth`):
`GET /api/v1/auth/outlets` was added 11 Sep 2026 (2a9cacb9) → 200 means the API is at least that
new, 401 means older. For the web, fetch `/en/login`, pull its `/assets/*.js` and grep for dated
strings (`x-org-kind` first appears 12 Sep, `contact-change` 17 Sep).

**Reading on 28 Sep 2026:** production `innocenz.net` API older than 11 Sep and web older than
12 Sep; staging `innocenz.duckdns.org` had 17 Sep code. Both `/api/v1/health` and `/health/db`
healthy. So all of 11–24 Sep (member joining, account security, auto-charge, PV bulk actions)
was not live in production.

**Also found that day:** GitHub `uab-kl/InnocenZ` is **public** (`private:false`) — the owner
confirmed that is DELIBERATE, see [[repo-public-is-intentional]]; do not report it. `main` is
**unprotected**, and every CI run since at least 9 Sep failed yet was merged (3 web lint ERRORS —
two index keys in RosterBackendTimetable, one assignment-in-expression in auto-assign.test — plus
the date-dependent mobile test; all fixed 28 Sep, branch protection still the owner's to switch
on). See [[innocenz-deploy-blockers]] and [[absent-evidence-is-about-the-instrument]].

**Why:** "is it deployed?" kept being answered from the deploy log, which does not say which
environment a run went to.
**How to apply:** re-run the probe before claiming any fix is live; re-check repo visibility
before committing anything personal to docs/ or seeds.
