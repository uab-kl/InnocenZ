---
name: pr-is-under-an-agency-not-a-member
description: "Standing rule (owner, 10 Sep 2026) — a PR is UNDER an agency via agency_pr; 'member' is reserved for org staff on user_role, never a PR"
metadata:
  node_type: memory
  type: feedback
---

Two different relationships, and they must never share a word on screen:

- **PR under an agency** — an `agency_pr` row (`approve_status` + `tier`). The PR holds **no**
  `user_role` for that organisation and never appears on its team. Approving a join writes
  `agency_pr.approve_status` and nothing else.
- **Member of the organisation** — staff carrying a `user_role` plus an `agency_user` /
  `outlet_user` row, created only by org sign-up (owner), invite acceptance, or an admin —
  see [[innocenz-role-grant-rule]].

**Why:** owner, 10 Sep 2026, pointing at Agency → Approvals — *"pr is pr who under which agency
organisation, not the membership of the organisation"*. Once org-member invites shipped, "Member"
had two meanings in one portal: the approvals list pill read **Member** and the detail line read
**Membership approved** on people who are only `agency_pr` rows. The data was right; the words
were not, which is worse — an owner reading "member" reasonably concludes that approving a PR let
them into the organisation.

**How to apply:** on any PR surface say the PR is *under* / *signed to* the agency — EN
`approvals.agencyPr` = "Agency PR", `agencyPending.joinApprovedDetail` = "Approved — now a PR under
this agency"; ZH 「签约 PR」/「已批准 — 现为本经纪公司签约 PR」. Departure lines follow the same
vocabulary ("still / no longer under this agency"), never "membership continues". The i18n keys were
renamed on purpose — `PortalTranslations` is `typeof en`, so a stale `t.approvals.member` fails
typecheck and the word cannot drift back. Internal type names like `AgencyMembership` are fine; this
rule is about what the owner reads. Related: [[innocenz-tier-is-per-membership]] (the tier is a
per-agency fact on that same row) and [[role-plus-membership-both-required]].
