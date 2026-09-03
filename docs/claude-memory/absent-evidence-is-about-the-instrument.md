---
name: absent-evidence-is-about-the-instrument
description: "A zero result — no grep hits, no fetch in the file, a SKIP, a green test run — is evidence about the instrument, not about the codebase. Four instances in one session, two published as false claims"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: aed993f6-53d2-4695-9554-c1646d82b25c
  modified: 2026-08-11T08:32:49.164Z
---

**When something comes back empty, the first question is whether the instrument could have found it.**
Four instances on 3–4 Aug 2026, and two were published to the audit page as fact before being caught.

- 🔴 **"No invite or member-management endpoint exists in the backend at all."** The grep was for
  `invite`. **The capability is called `members`** — `POST`/`PUT`/`DELETE /agency/:id/members` and
  four outlet equivalents all existed. *Searching for the feature's name instead of the capability's
  name*, one night after writing down that a filename is not a feature.
- 🔴 **"Neither file makes a single API call."** True of the files, false of the screens: both call
  `useAgencyProfile` / `useOutletProfile`, which fetch. **One indirection defeats a
  does-this-file-contain-`fetch` test.**
- ⚠️ **`SKIP — target venue has no pin to echo back`.** A probe defect wearing the costume of a fact
  about the data: the columns are `lat`/`lng`/`geoFenceRadius`, the probe guessed
  `geoFenceLat`/`latitude`. Every outlet is pinned. It landed on the single most dangerous case in
  the set. **A SKIP is a claim about the world and has to be verified like one.**
- ⚠️ **An `<img>` that "rendered" in the Browser pane while loading nothing (11 Aug 2026).** New
  avatar tiles reported the right `src` and the right classes, so I called them verified. They sat at
  `naturalWidth: 0`, `complete: false` — **`loading="lazy"` never fires in a pane that is not being
  displayed**, because nothing is composited and so nothing is ever "in view". Worse, the lazy image
  never reached `onError` either, so **a 404 URL was indistinguishable from a slow one**. That first
  check only looked green because I had fetched those same URLs by hand a minute earlier and warmed
  the cache; a sibling feature an hour later resolved every outlet logo to a 404 and wore the
  identical symptom. **A `src` on the element is not proof of a picture: assert `complete` AND
  `naturalWidth`, on a fresh load, without warming the URL yourself.**
- ⚠️ **A vitest run that passed having executed nothing.** `include` was `src/features/**`, the new
  security-rule spec lived in `src/util`, and `passWithNoTests: true` turned "found no tests" into a
  green run. **A green suite that ran zero of your tests is the worst possible signal for a security
  rule.**

**Why:** every one of these produced *confident* output. A grep with no hits, a file with no `fetch`,
a SKIP line and a passing suite all look like answers, so they get written down as findings and — in
two cases here — published. The failure is silent by construction: the instrument reports success at
measuring nothing.

**How to apply:**

- Before believing a zero, **run the instrument against something you know is there.** The
  production-build check that closed pre-pilot gate 2 counted `auth/login` (2) and
  `startAgencyRealSession` (4) alongside the four demo symbols (0). Without those controls the whole
  result would have been indistinguishable from a broken grep.
- **Grep for the capability, not the feature name** — and for the table, the route shape, the verb.
  Then open a file and read it.
- **Never report a SKIP without naming what made it unreachable**, and sanity-check that reason
  against known data.
- After adding a test in a new directory, **confirm the runner actually picked it up** (file count,
  not just a green tick).

Related: [[confirm-before-asserting]] · [[green-signals-that-lie]] · [[audit-entries-are-leads]]
