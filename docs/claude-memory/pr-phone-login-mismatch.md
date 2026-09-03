---
name: pr-phone-login-mismatch
description: "ANSWERED + FIXED 30 Jul 2026 (e936030): user.phone_num WINS. Reads resolve through the FK, login matches on digits. The DROP COLUMN is deliberately deferred — 3 live readers. Read before touching pr.phone or the login lookup."
metadata: 
  node_type: memory
  type: project
  originSessionId: 8853986f-5672-4e84-bcf9-9373f637ca51
  modified: 2026-07-30T14:12:48.611Z
---

**Found 30 Jul 2026, in the first minute the PR app was ever executed** (see
[[mobile-app-runs-on-web]]). Blocking for any real PR pilot.

## The fault

`login()` in `apps/mobile/src/lib/api.ts` sends `phoneNum` when the identifier has no `@`, and the
backend matches **`user.phone_num`**. Every agency-facing surface — roster, PV, payroll — reads
**`pr.phone`**. They are different columns holding the same fact, and on live data they have already
diverged:

- Alice: `pr.phone = +60123456805`, `user.phone_num = +60987654321`.
- Both forms of the pr number (`60…` and `+60…`) were refused **401** by `POST /auth/login`.
- Only the `user` row's number worked.

So a PR handed the number their agency holds for them **cannot get into the app**.

## Two faults, not one

1. **One fact in two tables** — `CLAUDE.md`'s database rule 3 forbids exactly this ("never duplicate
   a column like `name`; one fact lives in one table"). The divergence is what the rule exists to
   prevent, and it has already happened.
2. **No normalisation** — a stored `+60…` against a typed `60…` would still miss even if the rows
   agreed. The sign-in field's placeholder is `60123456789`, without the `+`.

## ✅ ANSWERED + FIXED the same hour — `e936030`

**Owner's call: `user.phone_num` WINS.** Measuring first is what made it cheap — **6 pr rows, 5
agree, 1 conflict (Alice), 0 accounts without a phone, 0 pr rows without an account** — so there was
nothing to backfill and nobody to lock out.

- **Reads:** `PrRepository.getById`/`listPaginated` already left-joined `user`, so it took a select
  plus `withAccountPhone()`. The **PV export bundle** joins it too — a printed voucher is the
  document a PR is paid against. Live: the agency roster now shows Alice's **account** number.
- **Login:** matches on DIGITS (`regexp_replace(phone_num,'\D','','g')`) via
  `phoneLoginCandidates()`, accepting `+60123456801` / `60123456801` / `012-345 6801`. All three
  verified 200 where `60…` had been a 401. **Refuses on ambiguity** (fetches 2, returns null) — a
  login must not pick between two matching accounts. Candidate forms are deliberately narrow (leading
  `0` ↔ `60` only); a suffix match would let one country's number open another's account.
- **Bonus leak closed:** `getUserByLoginMethod` was logging the whole matched `UserType` — including
  `passwordHash` — on every sign-in attempt. Now an id. Second hash leak found on this project while
  doing something else; see [[user-list-hash-leak]].

## ⚠️ The DROP COLUMN is NOT done, on purpose

Three live readers still use `pr.phone`: the agency PR search (`ilike(PrTable.phone, term)` in
`agency-pr.repository.ts`), **jk's PV export**, and the create/update path — and it is the only
number a PR has **before** an account exists (an agency adds someone to the roster first). Dropping
a column out from under a database jk also runs breaks whoever is mid-request. Sequence for later:
repoint the search, repoint jk's lane, decide what a pre-account phone is called, then drop.

One conflicting row remains (Alice: roster `+60123456805`, account `+60987654321`). Display and login
both follow the account now, so nothing is broken by it — it is an orphan copy.

Related: [[pr-signup-mobile]] (the sign-up wizard writes both), [[db-table-conventions]] (the rule),
[[current-state-and-audit]] (`TEST_SCRIPT.md` §8 X23).
