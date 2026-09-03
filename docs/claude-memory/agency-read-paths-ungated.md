---
name: agency-read-paths-ungated
description: "6 Aug 2026 — the agency router's five READ paths have no guard at all; a PR token reads every agency's SSM/owner contact and any agency's full PR roster with IC numbers. Also: check:drift is blind, and the pr table is gone"
metadata: 
  node_type: memory
  type: project
  originSessionId: bb93f16e-eb99-4a5a-9ea6-cd3516f62096
  modified: 2026-08-06T01:26:53.731Z
---

**P0, found on a live read-only sweep 6 Aug 2026 (HEAD `e2aea97`), NOT yet fixed.**
`apps/backend/src/features/agency/agency.routes.ts` lines **8, 9, 11, 12, 35** —
`GET /agency`, `/agency/memberships`, `/agency/pr-links`, `GET /agency/:id`,
`GET /agency/:id/prs` — carry **no `requireRole` and no org scope**.

Live: a **PR token** (`pr.vicky`) read all 3 agencies (`ssmNo`, owner name/email/phone),
then read **Starline's** full roster — an agency she is not in — returning populated
`idNo` (Malaysian IC), `phoneNum`, `dob`, `email`, plus the comcard measurement fields.
`/agency/:id/members` **is** correctly 403, which is what makes the gap read as accidental.

**The lesson is the shape, not the bug.** The same file's WRITE path was hardened for
*exactly* this class — its comments at lines 14–22 describe an unscoped owner check that let
one agency rewrite another's SSM number. The fix was named after the write symptom, so the
read paths sitting beside it were never looked at. Same family as
[[org-scope-guard-family]] and [[fix-named-by-symptom-hides-siblings]]. An **absent guard is
invisible to an RBAC audit** — there is no grant to be wrong, so the seeded matrix looks fine.

**How to apply:** when you fix a scope hole, re-derive *every* sibling path in that router
before closing the item — and gate on the router, not the finding.

## Two other things that rotted the same day

- **`check:drift` is BLIND and its FAIL is not evidence.** `check-schema-drift.ts`
  `newestSnapshot()` takes the highest `meta/*_snapshot.json`; snapshots stop at **0070**
  while the journal is at **0096** (because `drizzle-kit generate` cannot run —
  [[migration-journal-corrupt]]). It exits 1 with *"TABLE MISSING in live DB: pr"* and
  *"COLUMN MISSING: agency_pr.pr_id"* — **both are the correct post-0095 state.** See
  [[green-signals-that-lie]]: this one is a RED signal that lies.
- **The `pr` table is GONE** (0093 retire, 0095 drop; `agency_pr` keyed by `user_id` in 0091).
  A person legitimately holds **one `agency_pr` row per agency** — I nearly filed the 11-rows-
  over-6-users reading as a duplicate bug before checking the migrations. **`UNIQUE pr.user_id`
  is moot, not broken.** Anything still describing `pr.agency_id` is stale.

Sweep result: **76/84 as expected**; of the 8 mismatches, **6 were wrong expectations in the
docs**, 2 were real. Read-only throughout — a refusal writes nothing
([[prove-guards-live-without-writing]]). Backend needs `pnpm install` first or it dies on
`@aws-sdk/client-s3`. ⚠️ Counts like `[10]` from list endpoints are the **default page size**,
not totals — see [[confirm-before-asserting]].
