---
name: innocenz-role-grant-rule
description: "Standing rule (owner, 10 Sep 2026) — a portal role is created in exactly three places; nothing auto-grants on login"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: a7b8abfd-011d-4a43-aca6-75746d0ee700
  modified: 2026-09-10T13:52:11.753Z
---

A `user_role` row may be created in exactly THREE places, and nowhere else:
1. organisation sign-up — the OWNER alone, never a second member,
2. invite acceptance (`org_member_invite`, emailed via Brevo SMTP — not Gmail),
3. an admin acting deliberately through `/rbac/user-role`.

**Why:** owner, 10 Sep 2026 — *"the other organizations team members is not allowed to created
automatically also, unless the organization send Invite link"*. `/auth/me` used to call
`ensurePortalRolesFromMembership`, which granted a role to anyone holding an active membership
without one — so a READ silently created authority. It is deleted; a tombstone comment sits in
`auth.repository.ts` so it is not re-added.

⚠️ **It was an ESCALATION, not the view-only heal its own doc claimed, and the reason is subtle.**
Since migration 0160, `holdsAgencyLane` uses the `user_role` row only as a DOOR check (may this
account open the agency portal) and reads the actual AUTHORITY off `agency_user.sub_role`. Removal
deliberately leaves `sub_role` intact so the row can still say what somebody WAS — so healing a
removed OWNER handed back OWNER authority. The heal was written when the lane lived on `user_role`;
0160 moved the lane and nobody revisited it.

**How to apply:** if an account ends up active-with-no-role, fix the path that created that state —
never add a heal. The one real case was reinstatement: the grant block in `updateMember` was gated on
`subRole !== target.subRole`, so restoring a member with the lane they already held (what the UI
sends, since it pre-selects their remembered lane) skipped the grant entirely. That gate now tests
only that a title was NAMED.

Distinct from [[role-plus-membership-both-required]], which says an account needs BOTH halves — this
one says WHO may create the role half. See also [[innocenz-database-rules]].
