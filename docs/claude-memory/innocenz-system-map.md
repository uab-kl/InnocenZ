---
name: innocenz-system-map
description: "The four InnocenZ surfaces (PR mobile, Agency web, Outlet web, Admin web) and the end-to-end shift/money workflow connecting them"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9880c006-db77-4a08-94fc-cee9951666ce
  modified: 2026-07-29T15:04:02.749Z
---

**Four surfaces, one backend** (Express `/api/v1` + GraphQL, Postgres `main` schema, 36 tables, all with the audit quartet): **Admin web** (~21 screens, fully real, `requireAdmin` APIs); **Agency + Outlet webs** (prototype look wired to backend through `use-*` hooks + `*-map.ts` adapters); **PR mobile** (`apps/mobile`, React Native — login/shifts/check-in real, some screens still fall back to `demo-*.ts`).

**Core workflow (money spine):** Outlet posts a shift (`POST /shift`; `agency_id` stamped server-side from `outlet.onboarded_by_agency_id`, status forced `confirmed`; agencies can never author shifts) → Agency assigns PRs in Roster Planning (`POST /shift-assignment`; the week grid draws only ASSIGNED cells — unassigned shifts hide behind the "+"-cell picker) → PR checks in on the phone (server-side 50 m geofence, HTTP 422 outside, GPS proof stored; saving an outlet map pin is the fence master-switch) → drinks/tips logged via OCR receipt scan → weekly payout cron builds payment vouchers → PR signs (`POST /payment-voucher/mine/:id/sign`) → finance reconciles.

**Role links (FK tables, never duplicated data):** `agency_pr` (PR↔agency membership), `agency_user` / `outlet_user` (staff + `sub_role`, enforced server-side by `require-sub-role.ts` in 7 route files), `user_role` (portal role). PR↔outlet has NO direct table — only through `shift_assignment`.

**How to apply:** The #1 recurring bug class is the demo-store/backend split — reads are usually backend-real but some buttons still write only the local Zustand demo store (UI says X, DB says Y). When a portal "loses" data another portal expects, check whether the action ever hit the API before debugging the backend. Team split as of 2026-07-29: the user owns PR mobile + Admin + database; a teammate owns Outlet + Agency portals. Status truth lives in `InnocenZ_BuildSteps.xlsx` → Next Steps Priority tab. See [[innocenz-pr-mobile-app]], [[innocenz-remote-db]], [[innocenz-plan-change-flow]].
