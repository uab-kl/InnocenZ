---
name: accounts-cannot-be-removed
description: "FIXED 30 Jul 2026 (40c9098): PATCH /user/:id/status + DELETE /rbac/user-role, admin-only, with self-lockout and last-holder guards. Read for WHY it was invisible (absent routes), the 4-FK hard-delete recipe, and the MFA-401 trap."
metadata: 
  node_type: memory
  type: project
  originSessionId: 8853986f-5672-4e84-bcf9-9373f637ca51
  modified: 2026-08-04T03:11:26.208Z
---

**Found 30 Jul 2026 by trying to clean up after the MFA firing run** — not by reading the routers,
which had been swept twice. `TEST_SCRIPT.md` §8 X29.

## ⚠️ Which SCREENS have the controls (31 Jul, `f365537`) — and which tabs can never have them

Shared logic lives in **`apps/web/src/hooks/use-account-actions.tsx`** (`useAccountActions({roleName,
roleLabel, queryKeys})` → `busyUserId` / `askSetStatus` / `askRevokeRole` / `dialog`). Use it; do not
write a second copy of the confirm copy or the refusal handling.

- ✅ `admin.tsx` — Disable/Enable + Remove admin (`49d3220`, refactored onto the hook)
- ✅ `pr.tsx` — Disable/Enable + Remove PR. Rows are `GET /user?roleId=<pr>`, so **`PrUser.id` IS a
  user id**
- ✅ `legacy-member.tsx` — **PR rows only** get Reactivate. That tab is where a disabled PR lands
- ❌ **`agency.tsx` and `outlet.tsx` CANNOT take this column.** They list **organisations**
  (`fetchAgencies`/`fetchOutlets`), so `row.id` is an `agency`/`outlet` id — `PATCH /user/:id/status`
  would address a row that is not there. Their existing approve/suspend is **org** status, a
  different fact about a different table. The backlog entry that asked for "all four tabs,
  mechanical" was wrong about these two; see [[audit-entries-are-leads]].

🔴 **Open gap: agency and outlet ACCOUNTS have no screen at all.** Nothing in the admin portal lists
the users who sign in as an agency owner/finance or an outlet owner, so those can only be disabled
over the API. The fix is a list keyed on `GET /user?roleId=<agency|outlet>`, at which point the hook
drops straight in.

⚠️ **Amended 4 Aug 2026 — that sentence is about the ADMIN portal, and it was being read too
broadly.** Asked *"isn't the settings page the account management page?"*, the answer is that the
**agency and outlet portals DO carry their own member surfaces**:

- `routes/agency/profile.tsx` — a Finance Head **"sub-role invite · requires IC + e-signature for
  dual-sign PV"**
- `routes/outlet/settings.tsx` — owner profile, `accountActivated`

**But neither manages an account.** Neither file makes a single API call — no service import, no
`useMutation`, no `getClient`. The agency save lands in the zustand action
`saveAgencyProfileSettings` (`store.ts:3370`) and the invite is a **toast** reading *"Invite queued
for …"* when nothing is queued. **And there is nothing to call:**
`grep -rnE "invite" apps/backend/src/features/*/*.routes.ts` returns **nothing**.

So this is **a built screen with no capability behind it** — it belongs under *not wired*, not
*feature missing*, and needs a member-management API first (a working invite additionally waits on
the mailer, which does not exist — [[app-foundation-gaps]]).

**Why it was filed wrongly: judged from route FILENAMES instead of by opening the files.** Same
family as this entry's own lesson about absent routes — **a filename is not a feature**, and the
owner caught it. See [[confirm-before-asserting]].

`revokeAdminRole` is now **`revokeUserRole(userId, roleName, onRefreshFail)`** — it resolves the id
via `getRoleIdByName`, whose response the web mapper renames **`id` → `roleId`** (a probe reading the
raw key gets `undefined` and looks like a missing role).

## The hole

- **No `DELETE /user` route exists at all** (`user.routes.ts` has GET / PATCH / POST only).
- **`PATCH /user/:id` is SELF-EDIT ONLY** — `user.controller.ts:121`, *"Users may only edit their own
  account from the profile page for now"*. A platform admin gets **403** trying to set another
  account inactive.
- **`rbac/user-role` has `POST` and no `DELETE`** — a granted role cannot be revoked.

Together: **anyone who can create an account can mint a permanent admin.** Registration with a
`roleId` is admin-only (`da4657b` closed the public hole), so this needs an existing admin — but it
is one-way, and there is no undo.

## ✅ FIXED the same day — `40c9098`

- **`PATCH /user/:id/status`** — `active|inactive|blocked`, admin only.
- **`DELETE /rbac/user-role`** — body `{userId, roleId}`, admin only.

**It needed no enforcement code:** login already refused a non-active account
(`auth.controller.ts:79`), so the switch bit the moment it existed. **That is why two router sweeps
missed this — an ABSENT route is invisible to a sweep that asks whether routes are gated.** Add
"what is missing?" to any future gate audit.

Guards, both about locking everybody out: **no self-demote / self-disable** (the endpoint that would
undo it is the one you just lost) and **no removing the last holder** of a role.
`countUsersWithRole` **fails closed** — an error returns 0, which reads as "about to be emptied" and
refuses.

**Still no hard delete, on purpose** (see the FK recipe below).

✅ **A disabled account's live token dies on the NEXT request** — verified 30 Jul (§8 X31).
`authenticateJWT` re-reads the user via `getUserDataByToken` every request and refuses
`status !== 'active'`; it never trusts the token payload. Proven: live token 200 → account disabled
without touching that token → same token **401**.

⚠️ **I first recorded the OPPOSITE here, as fact, having never checked it** — reasoning from the
known "no token revocation" gap. **Status revocation works; per-session LOGOUT is what is missing**,
a different feature ([[app-foundation-gaps]]). Cost of that design, worth knowing: every
authenticated request does a user lookup.

✅ **The admin UI landed too** (`49d3220`) — an **Actions** column on
`routes/admin/user-management/admin.tsx`: Disable / Enable + Remove admin, each behind a confirm that
states the consequence. Refusals show the **server's sentence verbatim** (a toast), because every
refusal here explains itself. Live-proved by clicking Disable on my OWN row: the guard's message
appeared and the row stayed Active.

⚠️ **`currentUserId` is passed `null`:** the web auth context tracks *whether* someone is signed in,
not *who*, so no row can be marked "this is you" client-side. The prop exists for when it can.
⚠️ **A Radix confirm dialog renders its content while animating OUT** — reading live state there
flashed "undefined". Render from a last-target copy that outlives the close.

⚠️ **Verification trap:** the login response's `roles` array is **empty for every account**, so
"proving" a revoke from it confirms nothing. Check `GET /rbac/user-role?userId=…`.

## Removing an account by hand — the FK order

Nothing else could do it, so a direct script was needed. Four layers, in this order:

1. `audit_logs.user_id` → **NULL it**, do not delete the events.
2. `user_profile` → delete.
3. `admin_mfa` → delete.
4. `user_role` → delete, then `user`.

Check the row's EMAIL against the expected one before deleting by id.

## ⚠️ The trap that nearly wrote a false "it's gone"

After the failed delete, the throwaway's login returned **401 — and that was the MFA challenge, not
a missing account.** Once MFA is confirmed, the only way to ask whether an account still exists is to
log in **with a valid code**. Same failure shape as everything else on this project: a plausible
reading standing in for a fact.

Related: [[app-foundation-gaps]] (no logout / token revocation), [[ungated-router-sweep]] (gates on
routes that exist — this is about routes that do not), [[user-list-hash-leak]].
