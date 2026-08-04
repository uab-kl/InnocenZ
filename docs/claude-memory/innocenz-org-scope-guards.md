# Org scope guards, member management, and what a zero result proves

Mirror of the office-PC memory for 4 Aug 2026. Native copies:
`org-scope-guard-family.md`, `absent-evidence-is-about-the-instrument.md`,
`fix-named-by-symptom-hides-siblings.md`.

## 🔴 A role guard that never checks the ORGANISATION is not a scope check

Two cross-tenant write holes were live, and **both were found only when a screen was finally wired
to the endpoint**. *The gate looked fine for exactly as long as nothing called it.*

- **`d513e5c`** — `agencyOwnerOnly` resolved to `guard('agency', ['owner'])`: it asked *"are you an
  active owner?"* and never compared the membership against `req.params.id`. **Every agency owner
  satisfied it for every agency.** Worse on the outlet side, where the same unscoped guard covered
  `PUT /outlet/:id` **and both geo-fence routes** — so one operator could move another venue's fence
  centre, the coordinate every check-in is measured against. Fixed with
  `agencyOwnerOfParam` / `outletOwnerOfParam` on the 4 id-addressed routes. **Live-proven 7/0/1.**
- **`ede1aa1`** — `updateMember`/`removeMember` take **`:memberId`** and never checked it belonged to
  the org in **`:id`**. The scope guard *cannot* catch this: it validates `:id` while the write
  targets `:memberId`. Now a **404** in the controller, and the probe re-reads the foreign member
  afterwards to prove it survived. **Live-proven 8/0/3.**

**Member management is now open to org owners** behind three stacked guards (route scope → controller
ownership of `:memberId` → `guardMemberChange`, which refuses anything leaving an org with no active
owner; 9 unit tests). UI: `OrgMembersPanel` (`kind="agency"|"outlet"`) on both Settings screens,
clicked through on real logins.
⚠️ **Only the refusals are evidence** — add/remove leave permanent rows on the shared DB and were
never fired.

⚠️ **Re-run `apps/backend/src/scripts/probe-org-scope-guard.ts` after touching any guard** —
refactoring one voids its old proof. Both probes are safe to re-run: every cross-tenant case sends
the target's OWN current values, so a working guard refuses and writes nothing while a broken one
performs an idempotent write. *A probe for a guard must be harmless when the guard is what's broken.*

## A zero result is evidence about the INSTRUMENT

Four in one session; two were published to the audit page as fact before being caught.

- *"No member-management endpoint exists"* — the grep was for `invite`; **the capability is called
  `members`**. Searching for the feature's name instead of the capability's.
- *"Neither file makes an API call"* — true of the files, false of the screens, which fetch through
  their hooks. **One indirection defeats that test.**
- A probe `SKIP` that read as a fact about the data was a **wrong column name** (`lat`/`lng`, not
  `geoFenceLat`). **A SKIP is a claim about the world.**
- A **green vitest run that executed zero tests** — `include` was `src/features/**`, the new spec was
  in `src/util`, and `passWithNoTests` made "found nothing" look like success.

**Rule: before believing a zero, run the instrument against something you know is there.** The
production-build check that closed pre-pilot gate 2 counted `auth/login` (2) and
`startAgencyRealSession` (4) beside the four demo symbols (0) across 1,147 emitted files.

## A fix named by its SYMPTOM will not find its siblings

`832887d` — the roster's **cancel and no-show silently wrote nothing** from the Live tab: the
handlers branched on `viewMode === "planning"`, but both views render backend rows, so the demo
actions looked a `shift_assignment` UUID up in a demo slice that never held one. **The identical bug
was documented three lines above in the same file**, filed as being about *outlet swaps* rather than
about *ids*. *When a screen changes where its rows come from, every action keyed by row id has to
move with it.*

## Also 4 Aug

- **Demo-data leak into real sessions: 21 slices → 1.** `prComcard` left unblanked on purpose — the
  obvious constant is typed `ComcardDemoStyle`, a comcard's *styling*, not a comcard.
- **Pre-pilot gate 2 CLOSED** (`d5889f8`): the demo login is `import.meta.env.DEV`-gated and proven
  absent from a production build. ⚠️ **The gate named the wrong credential** — it is
  `demo@atlas-agency.invalid` (`.invalid` is a reserved TLD), not `owner@atlas-agency.my`, and the
  planted JWT is `alg:"none"`, which the backend rejects. It never opened a real portal.
- **Readiness is now scored on four axes, not one number:** features ~95% · wired ~93% · proven ~90%
  spine / ~62% branches · **production-ready ~27%**. The last one is what answers "can clients use
  this", and it is still gated on **a mailer, token revocation and a production database** — none
  started.
