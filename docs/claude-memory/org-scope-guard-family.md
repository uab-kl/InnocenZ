---
name: org-scope-guard-family
description: "A role guard that never compares against the id being written is not a scope check — two cross-tenant write holes closed 4 Aug, plus member management widened to org owners"
metadata: 
  node_type: memory
  type: project
  originSessionId: aed993f6-53d2-4695-9554-c1646d82b25c
  modified: 2026-08-04T05:20:22.361Z
---

**A gate that checks your ROLE but not the ORGANISATION is not a scope check. Two of them were live,
and both were found only when a screen was finally wired to the endpoint.**

## Hole 1 — the org record (`d513e5c`, live-proven 7/0/1)

`agencyOwnerOnly` resolves to `guard('agency', ['owner'])`, which asks *"are you an active owner?"*
and **never compares the membership against `req.params.id`**. Every agency owner satisfied it for
**every** agency. The outlet side was worse: the same unscoped `outletOwnerOnly` guarded
`PUT /outlet/:id` **and both geo-fence routes**, so one operator could move another venue's fence
centre — the coordinate every check-in is measured against.

Fixed with `requireAgencySubRoleScoped` / `requireOutletSubRoleScoped`, exposed as
`agencyOwnerOfParam` / `outletOwnerOfParam`, on the 4 id-addressed routes. The 7 existing exports
were left alone — the unscoped question is still right for routes whose target comes from the
session, not from a path param.

⚠️ **Found only because a Settings save was being wired to it.** *The gate looked fine for exactly
as long as nothing called it.*

## Hole 2 — the id you check is not the id you write (`ede1aa1`, live-proven 8/0/3)

`updateMember` / `removeMember` take **`:memberId`** and never checked it belonged to the org in
**`:id`**. The scope guard from hole 1 **cannot** catch this — it validates `:id` while the write
targets `:memberId` — so an owner passing their OWN org id and a FOREIGN member id passes every
gate. Now a **404** in the controller (not 403: a foreign member id must not be confirmed as
existing), and the probe **re-reads the foreign member afterwards** to prove it survived.
*A refusal you do not check for side effects is only half a test.*

## `guardMemberChange` — `util/member-change-guard.ts`, 9 unit tests

Refuses removal, demotion **or** deactivation that would leave an org with no ACTIVE owner. Needs no
separate self-demotion rule: *"you are the last active owner"* covers an owner locking themselves
out **and** one owner locking out the last OTHER owner, which a self-check alone would miss. An
inactive owner is not cover. **Deliberately allowed:** an owner may appoint another owner in their
own org, including handing ownership away — that is tenancy, not escalation.

## 🔴 The probe caught an OVER-APPLIED denial before it shipped

The scoped guard refused **any** body containing `status` — correct for `PUT /agency/:id`, where
that is the admin approve/suspend lane. Reusing the guard on the MEMBER routes carried the rule with
it, where `status` means the MEMBER'S status, a field an owner is entitled to set. It refused a
legal change **while citing admin approval**. *The rule was right; its blast radius was not.* Split
into `refuseOrgStatusChange()`, applied only to the two org-record PUTs. **One middleware, one job.**

⚠️ **Re-run `probe-org-scope-guard.ts` after touching any of this** — refactoring a guard voids its
old proof. Both probes are kept in `apps/backend/src/scripts/` and are safe to re-run: every
cross-tenant case sends the target's OWN current values, so a working guard refuses and writes
nothing while a broken one performs an idempotent write. *A probe for a guard must be harmless when
the guard is the thing that is broken.*

## State

Member management is open to org owners and has a UI: `OrgMembersPanel` (`kind="agency"|"outlet"`)
on both Settings screens, clicked through on real logins — the 409 reaches the user in the server's
own words. **Not proven: the happy-path 200s.** Add and remove leave permanent rows on the shared
DB, so only the refusals are evidence.

Related: [[prove-guards-live-without-writing]] · [[accounts-cannot-be-removed]] ·
[[ungated-router-sweep]]
