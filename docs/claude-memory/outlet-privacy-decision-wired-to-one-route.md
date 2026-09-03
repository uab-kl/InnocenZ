---
name: outlet-privacy-decision-wired-to-one-route
description: "FIXED 3 Sept 2026 — the owner decision hiding PR identity docs from outlets was middleware wired to /user and nothing else, so /pr shipped icNo + dob and /shift-assignment shipped cancel fees and GPS. Carries the two-sided proof a privacy fix needs"
metadata: 
  node_type: memory
  type: project
  originSessionId: 121dc04c-c50c-4d26-84cc-8792fe6d88e7
  modified: 2026-09-03T02:38:38.659Z
---

**🟢 FIXED the same day — see "The fix" at the end for what shipped and how it was proven.**

**Outlet privacy sweep, 3 Sept 2026.** All 55 outlet-reachable GETs fired with a real outlet token,
deep-scanning live responses. **25 refused (403) — every discipline surface held**:
`/pr/:id/penalties`, `/agency/:id/penalty-rules`, `/penalty-proposals`, `/uncharged`,
`/agency/:id/prs`, `/payment-voucher` (deductions live there), `/payout-batch`,
`/shift-assignment/attendance-fixes`, `/shift-assignment/overtime/pending`. **Two endpoints leak.**

## The rule is written down and wired to exactly one route

`redact-identity-docs.ts` carries it verbatim: *"OWNER DECISION (30 Jul 2026): an outlet may see WHO
is working at its venue, not who they are. Coordinates stay closed … and IC number, date of birth,
home address and both sides of the ID photo now go with them."* The middleware is correct. It is
applied to `/user`. **It is applied to nothing else.**

Its own header records this failing once before — the check matched a deprecated role name, so the
decision "was documented for three weeks without ever being enforced". It has now failed a second
time, differently: enforced on the route somebody was looking at, assumed on the rest. See
[[fix-named-by-symptom-hides-siblings]].

- **`GET /pr`** ships `icNo`, `profile.dob`, `phone`, `email`, `profile.race`. With `?pageSize=200`:
  **44 PRs across 2 agencies — 5 ICs, 23 DOBs — where only 6 ever worked at that venue.** The 44 is
  NOT a scoping bug: the controller deliberately serves "its approved agencies' rosters", the
  booking pool the plan sells. **The row set is intended; the field projection was never narrowed.**
  The same file already withholds `stats.totalPaidRm` from outlets — the instinct was there, applied
  once.
- **`GET /shift-assignment`** ships `cancelFeeRm`/`Pct`/`ChargedAt`/`VoucherId` (a PR's cancellation
  fine, plus a pointer into their voucher) and metre-level `checkInLat`/`Lng`/`checkOutLat`/`Lng`
  (**15 and 14 rows**, 8 dp). The coordinates directly contradict "coordinates stay closed" — that
  call was made while gating `attendance-fixes`, and the main list was never looked at.
  `leaveProofPhotos` (a photographed MC) is in the projection too, unpopulated here.

**Fix is a SHAPE, not a gate** — a 403 blanks PR names on live outlet screens, which is precisely
why the module chose a flag. Wire the existing middleware onto both routes, have their mappers
honour `req.redactIdentityDocs`, and sweep every other user- or assignment-shaped payload in the
same pass.

**By design, but worth re-confirming:** `GET /user` is not org-scoped for an outlet — all **74
platform users**, 74 emails, 36 phones. Identity docs ARE redacted and `dob` becomes `age`
(verified), which is the stated mitigation; gating it blanks two live screens. Accepted trade, large
blast radius. Relates to [[user-list-hash-leak]].

## ⚠️ The first run of this sweep reported all of it CLEAN

Three instrument faults, all now fixed in `_probe-outlet-privacy-sweep.ts`:

1. **`\bic\b` does not match `icNo`** — the word boundary fails against the following `N`.
2. `lat` / `lng` / `leaveProof` were not in the vocabulary at all.
3. It scanned only the **first 2 array elements**, so a penalty on row 25 of 35 was invisible.

What found the leaks was `_probe-outlet-pii-scope.ts` **enumerating FIELD NAMES** instead of
pattern-matching them. A regex sweep only finds what you already thought of; an enumeration shows
what is there. **Never trust a privacy sweep that has not been shown to catch a known-present
field** — [[ci-instruments-that-passed-unconditionally]],
[[absent-evidence-is-about-the-instrument]].

## 🟢 The fix (same day)

`util/outlet-redaction.ts` blanks the fields; `redactIdentityDocsForOutlet` is now wired to
`GET /pr`, `/pr/:id`, `GET /shift-assignment` and `/shift-assignment/:id`, and both controllers
honour the flag. `IDENTITY_DOC_FIELDS` is **exported and reused**, not re-typed — two lists of
"what an outlet must not see" is one list that gets updated and one that does not.

Kept on purpose: `cancelNoticeHours`, `checkIn/OutDistanceM` + `AccuracyM` (measured FROM the
venue's own location — distance from a point you own is not a position, and it is the geofence
evidence), `leaveStatus` (know the PR is not coming, not the doctor's note), `phone`/`email`.
Blanked to `null`, never deleted — a missing key throws on a destructure and the fix gets reverted.

⚠️ **A privacy fix needs a TWO-SIDED test.** Hiding a column from everybody is an outage, not a fix
— the agency roster reads `icNo`, the payroll lane reads the coordinates. So
`_probe-redaction-counter-test.ts` asserts outlet=0 **AND** agency>0, and reports INCONCLUSIVE when
the agency column is empty, because a field null for everyone proves nothing. Result: **7/7 fields
discriminating, NO LEAKS.** A one-sided check would have passed just as happily on a broken fix.

Also **deleted rather than shipped**: a derive-age-from-`dob` fallback in the redactor. `age` is
already derived upstream (verified — no live profile carries a `dob` without an `age`), so the
branch never fired, and a branch that never runs is one nobody notices going wrong.

Related: [[pr-spend-excluded-commission]] (the deduction rule that prompted this),
[[org-scope-guard-family]], [[outlet-read-a-foreign-agencys-tier]], [[agency-read-paths-ungated]].
