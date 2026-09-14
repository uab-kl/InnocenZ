---
name: tips-row-is-seeded-and-locked
description: Every outlet is created with a Tips row on Service Entitlement that it may price but not delete — and its category is 'tip', a money bucket, never 'service'
metadata:
  node_type: memory
  type: project
---

**Owner, 14 Sep 2026:** *"since when a new outlet goes into their workspace for the first time,
the tips should already be under the Service Entitlement and as an undeletable option as they
would not know that they would need to input "Tips" as a row themselves"*.

**The database sized it before any code was written:** of the eight live venues, **exactly one**
(JK House) had a tips row. Five had no menu rows at all. A venue could be staffed, sell a night
and take tips with no price for the tip to be logged against.

## The rule

`outlet_drink_menu` carries one row per venue with `slug='tips'`, `name='Tips'`,
**`category='tip'`**, seeded unpriced (RM 0). The venue sets the PRICE; it never decides whether
the line exists. Three places enforce that, and all three are needed:

1. **Creation** — `createDefaultRateCard` writes it with the workspace parent
   (`features/outlet-workspace/tips-menu-row.ts`).
2. **Save** — `upsertByOutletId` DELETES the whole menu before re-inserting, so an omitted row is a
   deletion. It now reads the stored tips row *before* the delete and `withTipsMenuRow` puts it
   back **at the venue's own price**. `PUT {drinkMenu: []}` returns it intact.
3. **Screen** — `OutletDrinkMenuEditor` hides Delete and Move on that row and fixes its name
   (renaming it is deleting it by another route). A lock chip sits in the Delete slot, with a
   spacer where Move was, or the price column slides out of line.

Existing venues were caught up by `scripts/backfill-tips-menu-row.ts` (dry run by default) — 7
seeded, JK House skipped, a re-run wrote 0.

## ⚠️ `tip` is a MONEY BUCKET, not a label — and `service` was the plausible wrong answer

`shift-sale-from-receipts` buckets a receipt line on the menu row's category: `tip` → `tip_rm`,
`service` → `service_sales_rm`. That split is what migration 0109 exists for, and services are the
majority bucket. A tips row filed under `service` — which is the list it *displays* in — books
every tip a PR logs as bar-service revenue. The portal folds everything that is not `drink` into
Service Entitlement, so the row shows where the owner asked for it while staying in the right
bucket. See [[innocenz-tier-rate-card]] and [[history-read-never-opened-shift-sale]].

## ⚠️ The round-trip was already destroying that category

`workspaceSettingsFromBackend` flattened the three stored values into two
(`d.category === 'drink' ? 'drink' : 'service'`), and `workspace.tsx` PUTs its whole draft — so
JK House's `tip` row would have become a `service` on their next save **on any unrelated field**.
Both directions now carry the category verbatim, and the server pins it back whatever an older
client sends. Which of the two LISTS a row draws in is `outletDrinkCategory()`'s job, not the wire
format's. Same family as [[line-rewrite-drops-columns]] and [[post-job-read-demo-menu-not-backend]].

**How to apply:** when a screen shows N buckets and the database stores N+1 values, find out what
the extra one *decides* before collapsing it. Here it decided which column a night's money lands
in, and the flattening had been in place, silently, since the drinks/services split.

Found alongside: the Delete button was hidden by `drinks.length > 1`, so a venue pared down to one
wrong item could only rename it — the empty state the section's own hint describes ("Add drinks
below") was unreachable. The row that must survive is now **named**, not counted.
