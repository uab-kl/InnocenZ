---
name: innocenz-plan-change-flow
description: Business rules the user specified for the admin Plan Request / Plan Change pages (July 2026)
metadata: 
  node_type: memory
  type: project
  originSessionId: 922f6200-8b41-46bf-b237-5e0b4400919a
---

Plan-switch rules the user specified (not fully derivable from code comments):

- Plan Request page (`/admin/service/requests`) holds EXACTLY two request kinds: outlet `pos_integration_quote` (the "Integrate with POS → Request admin quote" button on the outlet subscription page) and agency `custom_renegotiation` (the "Renegotiate Price" button on the agency Custom 151+ PV tier). `contact`/`other` were removed from this page per the user; `plan_change` lives on `/admin/service/plan-changes`. Columns are "From plan" (subscriber's tier) → "To plan" ("Integrate with POS" / "Custom"). The quote is an editable estimate before Resolve; Resolve finalises it (outlet POS defaults to the tier's plan price; Custom never falls back). Migration 0019 added the `custom_renegotiation` enum value.
- Agency plan switches happen **automatically based on how many PRs the agency has** — no admin approval; recorded with status `direct` and the price follows the to-plan (or negotiated quote for the Custom 151+ PV tier).
- Outlet plan switches require admin approval: created as `pending`, admin approves (`approved`, stamps the to-plan price as quotedAmount) or declines (`declined`, outlet stays on the from-plan price). While pending/declined the shown price is the **from-plan** price.
- The edit sheet on the Plan Change page must show a before ("From plan") / after ("To plan") price reminder.
- Statuses `direct`/`approved` were added to the `admin_request_status` PG enum in migration 0018 (0017 added `declined` + `requested_plan_id`). Seed data lives in `apps/backend/src/scripts/seed-sample-activity.ts`.

Related: [[innocenz-dev-environment]].
