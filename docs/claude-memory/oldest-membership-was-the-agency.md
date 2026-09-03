---
name: oldest-membership-was-the-agency
description: "🟢 FIXED 13 Aug 2026 — a PR's agency was resolved as their OLDEST agency_pr row, so the 2 multi-roster PRs of 32 could not be edited at all (404), and an admin's writes landed on the wrong agency. Carries: a symptom named after 3 fields was about none of them"
metadata: 
  node_type: memory
  type: project
  originSessionId: c5374656-51a7-450f-85aa-5d505e37faed
  modified: 2026-08-13T07:59:35.212Z
---

The owner asked why Alice's and Vicky's **height, weight and age** could not be edited while
the other 30 PRs' could. It was about none of those fields.

## The fault

`loadPrimaryMembership` (`pr.repository.ts`) resolved a PR's agency with
`.where(eq(userId)).orderBy(asc(createdAt)).limit(1)` — **the OLDEST membership, and no agency
argument at all**. But one person holds one `agency_pr` row **per agency**
(`agency_pr_agency_id_user_id_unique` is on the PAIR).

So `getById(prId)` handed a Why We Met caller **Alice's Atlas-shaped self**, the
`existing.agencyId !== scope.agencyId` gate fired, and `PUT /pr/:id` answered **404 before
reading a single field**. Nothing on those two could be saved.

⚠️ **The LIST path was correct all along** (`listPaginated` filters on `agency_pr.agency_id`),
which is exactly why it looked like a three-field bug: all 32 cards rendered with Alice's
`170cm 45kg` showing, and only the save failed. *Read filtered by agency, write resolved by
age.*

## Four sites, not one

Named after its symptom it would have been fixed in `update` alone. The same mis-resolution:

- `getById` — the same 404 on the detail read.
- `remove` — `removeLink(existing.agencyId, …)` detaches BY AGENCY, so an admin removing
  Alice from Why We Met would have detached her from **Atlas**.
- `penaltyBreaches` — `listByAgencyId(pr.agencyId)` priced her fines from **Atlas's** bands
  no matter who asked.

⚠️ **The admin lane is the dangerous one: an admin SKIPS the scope check**, so there was no
404 to make any of it visible. New `resolvePrForCaller` is shared by all four — non-admins
pinned to their own scope; for an admin a named `agencyId` wins, a **write** on a multi-roster
PR is **refused 409 rather than guessed**, and only a **read** may fall back to oldest.

⚠️ `getById(id, agencyId)` returns **null**, never an oldest-membership fallback, when the
person is not on that roster. The fallback *is* the bug.

## Measured, not assumed

**Exactly 4 of 52 PRs hold more than one membership**: Alice (4, oldest Atlas), Vicky (3,
oldest Delta), Arjun Kumar (2), Haziq Iskandar (2). Only the first two are on Why We Met —
which is precisely the two the owner reported. That match is what turned a plausible story
into a diagnosis.

## Age now follows the IC (same slice)

`dob` removed from `UpdatePrSchema`, `patch.age` dropped in `use-agency-prs`, `dob` removed
from the web service input type — **three gates, because zod discards unknown keys and would
answer 200 with nothing changed**. New leaf `features/pr-personnel/ic-dob.ts` derives it.

- A Malaysian **NRIC's first six digits ARE the birth date**, so the IC wins over stored `dob`.
- ⚠️ A **Passport / Work permit number carries no date**, so those fall back to stored `dob` —
  and since nothing may write it any more, a passport holder's DOB can never be corrected
  after signup. Alice is one.
- On live data the two sources genuinely disagreed: **Vicky's NRIC says 1995, her stored `dob`
  said 1996**, so her displayed age moved 30 → 31. That is the rule working.
- **49 of 52 PRs have no IC or no DOB**, so their age reads "—".

Served from **`/auth/me` AND `/pr`** so the PR's app and the agency's screen render one
number. Mobile used to compute its own `Math.max(18, thisYear − birthYear)` — ignored the
month and **invented 18 for anyone younger**.

Both editors show the field greyed with the reason on hover/click, **shown rather than
hidden**: the agency still reads age off the comcard, they just cannot author it.

## Also: the comcard now re-renders on save

`saveEdit` already called `generateComcard()` — but gated on "has ≥1 portfolio photo" when the
generator wants **four**, and it **swallowed the failure**, so a stale card silently outlived
the edit and the PR pressed "Update saved comcard" to fix it. Now gated on
`comcardTiles.mode !== 'empty'` and the failure is reported.

## Proof

Scoping **9/9** and age **5/5** against the live backend: log in as the Why We Met owner *and*
admin, hit the real endpoint, assert the status AND the read-back. Write-free where possible —
an empty `{}` body reaches the scope gate because every write below it is guarded on
`data.X !== undefined` (it does still bump `updated_by`).

⚠️ Never eyeballed — signing in needs a password typed into a form, which I do not do. See
[[pr-availability-built]] for the same standing limit.

Left open: `getMyPenaltyRules` (the PR's own `/mine` lane) still resolves by oldest
membership. Genuinely ambiguous — which of three agencies' bands apply to a PR with no shift
in hand? — so left rather than guessed.

See [[fix-named-by-symptom-hides-siblings]], [[org-scope-guard-family]],
[[probe-fixtures-must-match-production-shape]].
