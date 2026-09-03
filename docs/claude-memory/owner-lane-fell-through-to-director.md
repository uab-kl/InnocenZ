---
name: owner-lane-fell-through-to-director
description: "Every outlet AND agency OWNER resolved as a view-only Director — the lane map never named `owner`, it relied on a fallback that had since been changed to least privilege"
metadata:
  type: project
---

**26 Aug 2026.** Symptom the owner reported: **"Reduce cutlost" was missing from the outlet's
Today page** on a live `confirmed` shift with 6 unfilled seats. Nothing was deleted — the
section is wired at `OutletBookings.tsx` and gated on `can("requestCutLoss")`.

## The bug — a fall-through that stopped being safe

`outletSubRoleFromBackend` (outlet-identity.ts) named finance / operations_head / director /
guarantor and **never named `owner`**. An owner fell through to the final `return`, whose
comment still said the fallback was `outlet_owner` — true when it was written. The fallback had
since become `OUTLET_LEAST_PRIVILEGE` = `outlet_director`. **So every owner ran view-only.**
`agencySubRoleFromBackend` carried the identical miss. Both now name `owner` explicitly.

⚠️ **A comment describing a fallback is load-bearing when a case relies on falling through to
it.** Changing the fallback silently re-routed a case nobody re-read.

## Why only ONE feature noticed

`outletCan` consults the sub-role matrix **only for permissions with no `OUTLET_FEATURE_MODULE`
entry** — everything else is answered by the backend module grants, which were fine. And
`requestCutLoss` is the **only outlet permission with no mapping** (deliberate: the server gates
`POST /cutlost` by LANE, because outlet Finance holds no `booking` grant at all). So Post Job,
Workspace and Settings kept working, the sidebar looked like a full owner's, and one section
vanished with no error, no 403, nothing in a log. On the agency side the unmapped one is
`viewLiveFloor`. **When a permission model has two answering paths, the few cells only one path
covers are where a broken lane shows up — and they will look like an unrelated feature bug.**

## The other hole, hardened at the same time

`iz-outlet-identity` / `iz-agency-identity` are **tab-scoped but SEEDED from localStorage**, and
the portal mount PREFERRED the cache over re-deriving — so a new tab could run one account on
another account's venue and lane. The identity now carries the `userId` it was derived for;
`getOutletIdentity(expectedUserId)` / `getAgencyIdentity(expectedUserId)` refuse a foreign cache
**and an unstamped one** (every cache written before this), and the mount waits for `profile.id`
before trusting anything — least privilege until the account is known, then re-derive and write
back, so a stale lane self-heals with no re-login.

## What found it

A unit test written to *pin* the expected behaviour **failed on its first run** — the fix was
not what the analysis predicted (the cache theory was plausible and was NOT the cause). Tests:
`outlet-identity.test.ts`, `agency-identity.test.ts`, `outlet-rbac.test.ts` (26 cases).
See [[confirm-before-asserting]], [[green-signals-that-lie]], [[fix-named-by-symptom-hides-siblings]].
