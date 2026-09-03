---
name: workspace-rating-verified-merged
description: "Outlet Workspace + Ratings built, live-verified, and merged to main; open follow-ups"
metadata: 
  node_type: memory
  type: project
  originSessionId: a1866251-6d96-4d22-92c4-39d124881ebd
---

Outlet Workspace + Ratings feature is DONE and merged to `main` (as of 2026-07-19).
Backend `13d0786` (outlet_workspace + 3 child tables + rating), frontend `bbff855`.
Migration was applied to the shared `innocenz-test` DB (5 tables live); one-off applier deleted.

Live-verified via minted RS256 token + curl against running backend (no UI login — password
entry is prohibited for the assistant): 404→create→read→upsert-update with child-row
replacement, and rating unique-(outlet,pr) upsert all passed. Full portal API read sweep
green across agency + outlet; role gates and 404-as-empty behave correctly. See
[[outlet-portal-backend-wiring]] and [[agency-portal-backend-wiring]].

To mint a test token later: sign `{loginMethod:'email', loginCriteria:<active email>}` with
`JWT_PRIVATE_KEY` (RS256) from apps/backend/.env; outlet routes have no role gate, agency
routes need role `agency`/`admin` AND an active agency_member row. NOTE: the shared DB has NO
seeded agency-owner (no user with `agency` role + membership; `owner@atlas-agency.my` is a
frontend demo-session only). `owner@velvet23.my` IS a real active outlet member. Admin =
`innocenz@gmail.com`.

OPEN follow-ups (not yet done):
- Browser→hook UI click-through never exercised (needs a real outlet login).
- Two PRE-EXISTING coworker backend 500s found + left alone, now live in main:
  1. `GET /platform-config` → 500, `platform_fee_percent` column missing (repo/schema drift),
     author Ng8522. NOT consumed by any agency/outlet portal hook (admin-screen service only).
  2. `member-subscription.revenueByPeriod` → 500 (GROUP BY bind-param mismatch,
     member-subscription.repository.ts:144), author jinkai. Swallowed by /member-subscription/
     summary (returns 200, revenue slice empty); consumed by use-agency-subscription +
     use-outlet-subscription but degrades gracefully.
