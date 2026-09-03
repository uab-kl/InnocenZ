---
name: backend-pr-feature-renamed-pr-personnel
description: "apps/backend/src/features/pr/ is now features/pr-personnel/ — renamed 6 Aug 2026 by a concurrent session, so every memory and note citing features/pr/* has a stale path"
metadata: 
  node_type: memory
  type: project
  originSessionId: efcdecd7-22b8-4478-b091-4c5c79c63a5e
  modified: 2026-08-06T08:27:42.840Z
---

**6 Aug 2026.** `apps/backend/src/features/pr/` no longer exists. The same files now live at
**`apps/backend/src/features/pr-personnel/`** — `pr.repository.ts`, `pr.controller.ts`, `pr.model.ts`,
`pr.routes.ts`, `pr-penalty.ts`. Contents unchanged; git tracked it as a rename.

Noticed only because `git diff --cached --stat` reported my edit under
`features/pr-personnel/pr.repository.ts` while I had read and written
`features/pr/pr.repository.ts` **and both paths worked** — the directory moved under me mid-task,
done by a concurrent session sharing this checkout (see [[shared-checkout-git-state-moves]]).

**Why this matters more than a path:** several notes and memories cite the old location — the
`GET /pr` scope work in [[outlet-read-a-foreign-agencys-tier]], the `listPaginated` /
`buildSyntheticPr` / `composePr` details, `[PrRepository.*]` log-prefix greps, and the
`main.pr`-is-dropped cutover notes. A `Read` of `features/pr/...` failing is **not** evidence the
code is gone; look under `pr-personnel` before concluding anything about a missing PR file.

The API surface did not move: routes are still `/api/v1/pr`, and `pr.routes.ts` is still one of the
26 routers. Nothing about `id === userId` or the `agency_pr` composition changed with the rename.
