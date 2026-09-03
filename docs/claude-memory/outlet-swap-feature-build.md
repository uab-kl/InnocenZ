---
name: outlet-swap-feature-build
description: "Outlet swap is BUILT AND WORKING end-to-end (backend + agency web + PR mobile), live-verified on branch SL; nothing committed"
metadata: 
  node_type: memory
  type: project
  modified: 2026-07-27T06:51:35.659Z
  originSessionId: b93ee527-4f2e-4dc6-9663-c19ef6157fa1
---

**Outlet swap is DONE and proven working end to end** (agency moves a rostered
PR to another outlet's shift the same night; the PR approves). Branch `SL`,
**all uncommitted**.

**Live-verified over HTTP 2026-07-27:** agency raised a request from the roster
UI → PR saw it at `/outlet-swap/mine` → PR approved → `shift_assignment.shift_id`
moved Velvet 23 → Emhub Testing. Then swapped back the same way (Vicky is at
**Velvet 23**, her original outlet — the test left no drift).

**Backend** (migration `0052_add_outlet_swap_request`, APPLIED): model /
repository / controller / routes in `apps/backend/src/features/outlet-swap/`,
`src/schema/outlet-swap.schema.ts`, wired in `composition-root.ts`, mounted at
`/outlet-swap`. Endpoints: agency `GET /`, `GET /targets?assignmentId=`,
`POST /`, `POST /:id/cancel`; PR `GET /mine`, `POST /mine/:id/approve|decline`.

**Agency web**: `services/outlet-swap/`, `use-swap-outlet-targets` (rewritten to
hit `/outlet-swap/targets`), `use-outlet-swap-mutations`, roster modal now picks
a SHIFT (full ones disabled, sheet stays open on refusal).

**PR mobile**: `lib/api.ts` (+`OutletSwapRecord`, fetch/approve/decline),
`lib/outlet-swaps.tsx` (`useOutletSwaps`), `components/OutletSwapRequests.tsx`,
rendered in ShiftsScreen's **To-do** section, counted in the To-do hub badge,
and the section **auto-opens once** when a request arrives — there is no push
transport, so the card appearing IS the notification.

**`shift.filled` IS DEAD DATA — never use it.** Only seed scripts write it. The
"full → reject" rule counts live assignments (status not in
cancelled/no_show/leave_approved), matching `listBackfillSlots`.

**Settled design (don't re-litigate):** store destination `shift_id`; approval is
ONE transaction repointing `shift_assignment.shift_id` **and `agency_id`**;
capacity check + move share `SELECT … FOR UPDATE` on the destination shift; a
partial unique index allows one `pending_pr` per assignment; approval also
refuses `date_mismatch` / `already_assigned` / `not_pending`.

**Gotchas learned the hard way:**
- **PR demo password is `password`, NOT `Password123!`** (`seed-sample-prs.ts:111`,
  mirrors the proto portal). Agency owners DO use `Password123!`.
- Login field is `email`, not `identifier`.
- Backend scripts: run from `apps/backend` with `POSTGRES_*` exported from the
  ROOT `.env` — `db/index.ts` reads `POSTGRES_*`, not `DATABASE_URL`.
- Mobile has NO lucide — icons come from `components/icons.tsx`; fonts are
  `F.sora`/`F.manrope`/`F.playfair` (no `F.bold`/`F.reg`).
- Web `tsc` is red with **187 pre-existing errors**, mobile with **15** — both
  unrelated to this work. Don't chase them.
- **Don't `git stash` in this repo** to get a clean-tree baseline: `routeTree.gen.ts`
  regenerates and the pop conflicts. Cost a scare; recovered intact.

**Known hazard, NOT fixed:** `PrRepository.getByUserId` (pr.repository.ts:50) is
`LIMIT 1` with no ORDER BY, and Vicky has TWO `pr` rows on one user account
(multi-agency). The swap approve path 404s on a mismatch, so this can randomly
tell a PR their own swap doesn't exist. Spawned as a task chip.

Related: [[pr-cannot-accept-decline]] does NOT apply — PRs *do* approve/decline
a swap. [[app-foundation-gaps]] (no notification transport).
