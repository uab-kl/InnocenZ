---
name: schema-reshape-backlog
description: "Ordered backlog of the InnocenZ table reshape — what is done, what is unapplied, and the spec for the tables not started yet"
metadata: 
  node_type: memory
  type: project
  originSessionId: b687fb8d-84de-4f81-8e3f-e7c353c2a893
  modified: 2026-07-20T09:24:01.868Z
---

Schema reshape the user is driving table-by-table from spec screenshots (started 2026-07-20, branch `SL`). Work in this order; each numbered block is independent.

## DONE and APPLIED — migrations 0030–0033

**All four are applied to the shared DB and verified.** The 0030 trap from the previous handoff is cleared — nothing is left in a broken intermediate state.

- **0030** `user_profile` — `first_name`+`last_name` → `full_name`; dropped `under_agency`/`agency_id` and the four dead `accept_*` columns. Applied 2026-07-20 (12 rows, 7 got a full_name; the other 5 had neither name). Commit `844592d`.
- **0031** `user` — dropped `is_locked`/`locked_at`/`locked_by` (they existed in the DB but were never on `UserTable` and nothing read them), renamed `lock_reason` → `blocked_reason`, and declared `userStatusValues = active | inactive | blocked` via `$type` on the varchar. Commit `b9be39c`.
- **0032** `agency_pr` NEW join table (`agency_id`, `pr_id`, `approve_status` pending|approved|rejected, 4 audit cols, unique on the pair). Backfilled 10 rows from `pr.agency_id` as `approved`. **`pr.agency_id` deliberately kept** — every read path still filters on it. Commit `6d5c9b2`.
- **0033** `agency_member` → **`agency_user`**, `outlet_member` → **`outlet_user`**. Deleted the 10 `sub_role='pr'` rows; `agency_user` is down to the 3 owner accounts. Commit `660bc76`.

### The sub_role decision (important — the screenshot says "Sub_Role delete", we did NOT)

The user's stated reason was "there should not be PRs listed in this table". But `sub_role` is the **only** input deciding `agency_finance` vs `agency_owner` in `agency-identity.ts`, which drives portal nav + the `agencyCan` matrix — dropping the column would have silently promoted every finance operator to owner. User was shown this and chose: **delete the PR rows, keep the column, narrow the enum to `owner|finance`.** A PR can never be inserted there again, which was the actual intent.

### What 0033 dragged along

Two web read paths sourced PRs from the deleted rows, so they moved to `agency_pr` in the same commit — new `AgencyPrRepository` + `GET /agency/pr-links` (was `/agency/memberships?subRole=pr`) and `GET /agency/:id/prs` (was `/agency/:id/members?subRole=pr`). `/agency/memberships` no longer defaults to `'pr'`. Both PR seeds now write `pr` + `agency_pr` instead of `agency_member`.

**BROWSER-VERIFIED 2026-07-20** (dev server on port 3001 — 3000/4000 were held by another chat; added a `web-3001` config to `.claude/launch.json`, and 3001 is already in the backend CORS allowlist at `src/main.ts:46`). Confirmed working in the real UI:

- Agency portal loads and resolves identity (Atlas owner), and `/agency/memberships` returns `subRole:"owner"` → `agency_owner` mapping intact.
- Admin PR list: **Agencies column populated incl. multi-agency "+1"** — the `agency_pr` rewire works end to end.
- Admin Special Service: outlet names render via the new join, vendor names via `vendor_name`.
- Admin Plan: Audience column correct per row; Create Plan sheet has the new Audience select (defaults Outlet).
- Outlet details sheet: Subscription field gone.
- All changed endpoints probed live with a token (`/agency/pr-links`, `/agency/:id/prs`, `/special-service`, `/subscription`, `/outlet`); a bogus route 404s, proving the new routes are real.

**Still unverified:** the agency-details → **PRs tab panel** (`org-members-panel` → `/agency/:id/prs`). Its endpoint returns correct data, but the panel itself never rendered — the Radix tab resisted synthetic clicks and then the shared DB host went unreachable. Do this one first next session.

**Tip:** to verify authenticated UI without typing passwords, mint a token via `POST /api/v1/auth/login` and inject `access_token`/`refresh_token`/`token_expiry` into localStorage (keys in `src/lib/auth/auth-storage.ts`). Access tokens last only ~15 min, so re-mint often. Note this skips the sign-in flow, so `iz-agency-identity` stays null — test the membership call directly instead.

## DONE and APPLIED — migrations 0034–0036 (the screenshot spec is now COMPLETE)

- **0034** `outlet` — dropped `subscription_id`. `member_subscription`'s 'outlet' rows had orphan `subscriber_id`s matching no outlet, so nothing joined; they were repointed by name first. All 5 live outlets now resolve their plan there. Two rows ('Jade Garden Bar', 'Marble Hall') have no outlet at all — pre-existing demo noise, left alone. One conflict resolved in favour of member_subscription: Onyx KL is 'Scale' there, was 'Plus' on the outlet. Commit `e965969`.
- **0035** `special_service` — `assigned_agency_name` → **`vendor_name`** (a rename, not a data migration: probing showed `assigned_agency_id` NULL on all 10 rows, so the name column only ever held external vendors). Dropped `assigned_agency_id` and `outlet_name`; `listPaginated`/`getById` now select an explicit column list joined to `main.outlet` so responses keep `outletName`. The assign endpoint takes a free-text `vendorName`. `posting_agency_*` untouched. Commit `9de295e`.
- **0036** `subscription` — added `subscription_type` (agency|outlet, NOT NULL) + `role_id` FK → `main.role`. Backfilled from the old billing-cycle rule (6 weekly→agency, 6 monthly→outlet), roles resolved by `role_name`. Every audience heuristic now reads the column: `seed-plans` (keys `findPlanId` on it, writes `roleId`), `seed-sample-activity`, `seed-sample-orgs`, and `audienceFor` in `subscriptions-table.tsx`. The admin plan form gained an Audience select. Commit `914b7e8`.

**This closed the rule-2 exception** recorded in [[db-table-conventions]] for `special_service.assigned_agency_name` — it was never dual-purpose, just misread.

## NOT STARTED — what's left

- **Follow-up from 0032:** drop `pr.agency_id` once roster/shift/payroll/`resolveScope` reads select through `agency_pr`.
- Rule 2's remaining safe FK items (`payment_voucher.pr_name`/`pr_ic`/`outlet`, `payment_voucher_line.outlet`, `outlet_transaction.outlet_name`, `special_service.posting_agency_name`, `member_subscription.plan_name`) — list in [[db-table-conventions]].
- The one rule-1 duplicate: `outlet_workspace` vs `outlet_tier_rate` (both empty, needs a precedence call).

Also still open: rule 2's 6 approved FK items (list in [[db-table-conventions]]) and the one rule-1 duplicate (`outlet_workspace` vs `outlet_tier_rate`).

**Why:** the user drives this from screenshots one table at a time across sessions, so the next session starts cold and needs the decisions already made spelled out rather than re-asked.

**How to apply:** read [[db-table-conventions]] for the three schema rules, and [[backend-migrations-shared-db]] for migration mechanics — migrations are hand-written, and the journal `when` must exceed the current max (0033 used 1784500000017). Probe the live DB before writing any migration.
