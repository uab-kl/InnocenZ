---
name: realapp-mvp-sheet
description: A real-app MVP spec workbook (v4) was generated from the actual monorepo; captures the honest current architecture status
metadata: 
  node_type: memory
  type: project
  originSessionId: 18297c7d-233f-4d39-9f37-a9c1faef93f1
  modified: 2026-07-23T08:08:03.339Z
---

Generated `C:/Users/User/Downloads/InnocenZ_MVP_v4_RealApp.xlsx` (2026-07-23) — the MVP spec workbook in the v3 house style but sourced from the REAL Nx app instead of the demo prototype. 11 tabs: Overview · Backend—API · Data Model · Functions(Services & Hooks) · E2E Flow · Modules 1-12 · Role Matrix · RBAC Matrix · Money Model · Build Plan · Changelog. Built with Node + ExcelJS (Python is NOT installed on this machine, so the skill's `build_workbook.py` can't run). Generator script lives in scratchpad only — copy into repo `tools/` if reproducibility is wanted. Run with `NODE_PATH=<repo>/node_modules node build_realapp_mvp.js`.

The `anthropic-skills:innocenz-mvp-sheet` skill targets the demo PROTOTYPE (single `src/lib/store.ts` + demo rbac files); it does NOT map to the real app.

**Honest architecture status (verified from source 2026-07-23):**
- Backend `apps/backend`: real Express `/api/v1` (22 features, 20 mounted route-groups / 24 router files, ~141 REST endpoints) + GraphQL; JWT (bcrypt + access/refresh + reset-password token); Postgres/Drizzle, 34 tables (incl. `agency_pr`, `audit_logs`).
- PV lifecycle (verified): status enum `pending_review→sent→signed→paid`(+`disputed`) with finance-head/pr/paid timestamps EXISTS; gaps = no PR self-sign endpoint (`/mine` = view/lines/dispute only), `paid` is a manual flag (no payout/transfer job), mobile PV screens on demo data, and agency route allows DELETE though RBAC intends CRU.
- Real RBAC engine: 4 ROLE-level roles (admin/agency/outlet/pr) x 12 modules x CRUD, from `apps/backend/src/scripts/seed-rbac.ts` MATRIX (admin=`*`). Enforced by `requireRole`/`requireAdmin` middleware; editable at `/admin/rbac`.
- Admin web portal: native on `@/services` — fully real.
- Agency + Outlet web portals: the prototype UI (`apps/web/src/agency-portal/*`, still with demo `store.ts`/`agency-rbac.ts`) progressively wired to the backend via 33 `use-agency-*`/`use-outlet-*`/`use-roster-*` hooks + `*-map.ts` adapters.
- PR app is now MOBILE (`apps/mobile`): real `lib/api.ts` + session, but most screens still on `demo-shifts`/`demo-services`/`demo-payment-history`.

**2026-07-23 product-notes added to the sheet (v4, sheet-only):** OCR is now **Phase-1 MANDATORY** (P0) across To-Do + Build Plan (was P2) — scan auto-populates item/qty/amount → shift-sale, no agency-verify on scanned entries. PR shift page = only Today/To-do/Upcoming (Job Posting tab removed, On-Duty off Upcoming). **All Job Posting for all roles → Phase 2**. Special Service = Transportation + Makeup & Grooming. Google Map distance set with outlet. Money Model tips/commission: some outlets tips-only (drink-commission=0 valid); Booking Commission is a bucket UNDER tips (PR brings a customer); PR tip share = 60% and that's what PR sees.

**Confirmed gaps (headline items):** sub-roles (Owner/Finance/Ops) are NOT in the backend RBAC — only the demo `agencyCan()`/`outletCan()` enforce them; no runtime zero-sum "Golden Audit" money check found in the reviewed API layer; PR mobile screens still demo-backed; `/agency/special-service` still gates on the demo sub-role check. See also [[outlet-portal-backend-wiring]], [[agency-portal-backend-wiring]], [[roster-backend-wiring]].
