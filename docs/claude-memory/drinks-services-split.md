---
name: drinks-services-split
description: Outlet Workspace now has two separate price lists — Drinks Price vs Service Entitlement — via a category column on the drink menu
metadata: 
  node_type: memory
  type: project
  originSessionId: 7ad4bcb1-2ae0-40e4-8420-0bcfc22895e5
  modified: 2026-07-22T03:19:43.831Z
---

DONE (branch SL, 2026-07-22, uncommitted): the outlet Workspace "Service Entitlement" list was split into **two** sections — **"Drinks Price"** (`category='drink'`) and **"Service Entitlement"** (`category='service'`) — so drink prices and service prices live on different lists.

Implementation ("Extend workspace drink menu" approach, one flat table, filtered by category):
- Migration `0045_drink_menu_category.sql` — adds `main.outlet_drink_menu.category varchar(20) NOT NULL DEFAULT 'service'`. **Applied + DB-verified** (7 existing rows backfilled to 'service').
- Backend: `outlet-workspace.model.ts` (column), `outlet-workspace.schema.ts` (`z.enum(['drink','service'])`), `outlet-workspace.controller.ts` (passthrough). Read path returns it via `select()` automatically.
- Frontend: `OutletDrinkPrice.category?` optional (undefined ⇒ 'service' via `outletDrinkCategory()`), `DEFAULT_OUTLET_DRINK_MENU` pre-categorized (Booking commission=service, rest=drink), `OutletDrinkMenuEditor` gained `category`/`itemLabel`/`onMoveItem`/`moveHint` props (per-row ArrowLeftRight button moves item between lists), `workspace.tsx` renders two `OutletSection`s filtering `draft.drinkMenu` and merging edited slices back, `outlet-workspace-map.ts` + `services/outlet-workspace` carry `category` both directions.

**Commission % is NOT per-item.** User confirmed all drinks/services share one common commission % — now and in future. So the `commission-config` per-item percentage matrix backend has **no frontend and never will**; drop it from any "unwired backend" list. See [[agency-portal-backend-wiring]] which flagged commission_config as "unconfirmed" — it's now confirmed unneeded. This split is about **prices only** (priceRm), unrelated to commission %.
