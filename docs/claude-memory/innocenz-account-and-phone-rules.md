# Accounts, roles and the phone number

Two rules settled on 30 Jul 2026, both found by *running* things rather than reading them.

## 1. A person has ONE phone number: `user.phone_num`

The app signs in by mobile number and matches `user.phone_num`. Every agency-facing screen — roster,
PV, payroll — used to read `pr.phone`. **The same fact lived in two tables and had already drifted**:
one PR's roster number was not the number their account signs in with, so they could not log in with
the number their agency had given them. That is the duplicated-column rule in
`innocenz-database-rules.md` being broken and then diverging.

**Owner's call: `user.phone_num` wins.** Reads resolve through `pr.user_id → user`
(`PrRepository.withAccountPhone`, and the PV export bundle joins it too — a printed voucher is the
document a PR is paid against). Login matches on **digits**, so `+60123456801`, `60123456801` and
`012-345 6801` all work, and **refuses on ambiguity** rather than picking between two matching
accounts.

⚠️ **`pr.phone` is deliberately NOT dropped yet.** The agency PR search and the PV export still read
it directly, and it is the only number a PR has **before** they have an account (an agency adds
someone to the roster first). Dropping a column out from under a shared database breaks whoever is
mid-request. Sequence: repoint the search, repoint the export, decide what a pre-account phone is
called, then drop.

The same fix closed a credential leak next door: the login lookup used to log the **whole matched
user row, `password_hash` included**, on every sign-in attempt.

## 2. An account can be disabled, and a role can be taken back

Until 30 Jul neither was possible: there was **no `DELETE /user`**, `PATCH /user/:id` is **self-edit
only**, and `rbac/user-role` granted roles with **no revoke**. So an account was permanent once
created, and an account promoted to admin stayed admin — **anyone who could create an account could
mint a permanent admin.**

Now, both admin-only:

- `PATCH /user/:id/status` — `active | inactive | blocked`
- `DELETE /rbac/user-role` — body `{userId, roleId}`

**It needed no enforcement code:** login already refused a non-active account, so the switch bit the
moment it existed. **That is why two router sweeps missed it — an ABSENT route is invisible to a
sweep that asks whether routes are gated.** Add *"what is missing?"* to any future gate audit.

Guards, both about locking everybody out: **no self-demote / self-disable** (the endpoint that would
undo it is the one you just lost) and **no removing the last holder** of a role. The holder count
fails closed — an error reads as "about to be emptied" and refuses.

**No hard delete, on purpose.** If one is ever needed, four layers reference a user, in this order:
`audit_logs.user_id` (**NULL it**, keep the events), `user_profile`, `admin_mfa`, `user_role`, then
`user`. Check the row's email before deleting by id.

Still open: an admin **UI** for both (API-only today), and whether a disabled account's live JWT
should die immediately — it currently survives until expiry, because there is no token revocation.

## Two verification traps that nearly wrote false results

- **A 401 after "deleting" an account was the MFA challenge, not a missing account.** Once MFA is on,
  the only way to ask whether an account exists is to log in **with a valid code**.
- **The login response's `roles` array is empty for every account**, so "proving" a revoke from it
  confirms nothing. Check `GET /rbac/user-role?userId=…`.
