import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import type { DbTransaction } from '@/types/db-transaction';
import { logger } from '@/util/logger.js';
import {
  type OutletDrinkMenuInsertType,
  OutletDrinkMenuTable,
  OutletWorkspaceTable,
} from './outlet-workspace.model.js';

/**
 * TIPS IS A LINE EVERY VENUE HAS, NOT ONE THEY HAVE TO KNOW TO TYPE.
 *
 * A venue's Workspace opens on two price lists it must fill in, and until
 * 14 Sep 2026 both started completely empty — so tips were only ever priced by
 * an outlet who worked out on their own that "Tips" is a row you add under
 * Service Entitlement. Of the eight live venues exactly one had done it. The
 * rest could be staffed, sell a night's drinks and take tips, with no price for
 * a tip to be logged against.
 *
 * So the row is seeded at outlet creation and cannot be deleted afterwards: the
 * venue sets its PRICE (it opens at 0, which reads as unset and keeps the "set
 * your prices" reminder naming tips), never whether the line exists.
 */

/** The seeded row's slug. Stable across renames — it is how the row is found. */
export const TIPS_MENU_SLUG = 'tips';

/** What the seeded row is called on screen and on a receipt. */
export const TIPS_MENU_NAME = 'Tips';

/**
 * ⚠️ `tip`, NOT `service` — this is a MONEY BUCKET, not a label.
 *
 * `outlet_drink_menu.category` is packed into the receipt line's `ref` and read
 * back by `shift-sale-from-receipts`: `tip` lands in `tip_rm`, `service` in
 * `service_sales_rm` (the split in migration 0109 exists to keep those apart,
 * and services are the majority bucket). Filing the tips row under `service`
 * would book every tip a PR logs as bar service revenue on the Floor Sales
 * breakdown. It still SHOWS under Service Entitlement — the portal folds
 * everything that is not `drink` into that list.
 */
export const TIPS_MENU_CATEGORY = 'tip';

/** A menu row as the API receives it — no ids, the repository supplies those. */
export type DrinkMenuRowInput = Omit<
  OutletDrinkMenuInsertType,
  'id' | 'workspaceId' | 'outletId'
>;

/**
 * Is this the venue's tips row?
 *
 * Three tests, because the row predates the seed. The venues that added tips
 * themselves carry a generated slug (`service-1785132698158`) and got there
 * either by picking the third category or by simply naming the row "Tips", so
 * matching on the slug alone would miss them and seed a duplicate.
 */
export function isTipsMenuRow(row: {
  slug: string;
  name: string;
  // Optional because the INSERT shape leaves it to the column default — an
  // untagged row is a `service`, which is not tips.
  category?: string | null;
}): boolean {
  return (
    row.slug === TIPS_MENU_SLUG ||
    row.category === TIPS_MENU_CATEGORY ||
    row.name.trim().toLowerCase() === TIPS_MENU_NAME.toLowerCase()
  );
}

/** The row a venue with no tips line starts on: named, unpriced, in the tip bucket. */
export function newTipsMenuRow(sortOrder: number): DrinkMenuRowInput {
  return {
    slug: TIPS_MENU_SLUG,
    name: TIPS_MENU_NAME,
    // Unpriced on purpose. A seeded RM 50 is a plausible wrong price nobody
    // would think to correct; RM 0 is visibly unset, and it is what keeps the
    // outlet's "set your prices" reminder naming tips until they price it.
    priceRm: '0',
    category: TIPS_MENU_CATEGORY,
    sortOrder,
  };
}

/** The stored tips row a save must not be allowed to drop. */
export interface StoredTipsRow {
  slug: string;
  name: string;
  priceRm: string;
}

/**
 * The tips rule applied to a whole incoming menu — pure, so it can be tested
 * against real menu shapes and not only the empty one a new venue has.
 *
 * Two jobs, and the second is the subtle one:
 *
 *  1. A save that no longer carries the tips row PUTS IT BACK, at the price the
 *     venue had already set. The upsert deletes every menu row before
 *     re-inserting what it was handed, so "absent from the payload" is a
 *     deletion — the same shape that once cost two venues their rate cards.
 *
 *  2. A save that DOES carry it is pinned back to the `tip` category. The
 *     portal's own mapper used to flatten the three stored categories into two
 *     (`d.category === 'drink' ? 'drink' : 'service'`), so an older client
 *     hands the row back as a `service` — which would silently move that
 *     venue's tips into the service-sales bucket on their next unrelated save.
 */
export function withTipsMenuRow(
  incoming: DrinkMenuRowInput[],
  stored: StoredTipsRow | null,
): DrinkMenuRowInput[] {
  // Identity is the SLUG: it is what survives the client round-trip (the portal
  // sends the row back as `slug: d.id`), while the name and the category are
  // both things a client can arrive with changed.
  const sentAsTips = stored
    ? incoming.find((r) => r.slug === stored.slug)
    : incoming.find((r) => isTipsMenuRow(r));

  if (sentAsTips) {
    return incoming.map((r) =>
      r === sentAsTips ? { ...r, category: TIPS_MENU_CATEGORY } : r,
    );
  }

  const nextSort =
    incoming.reduce((max, r) => Math.max(max, r.sortOrder ?? 0), -1) + 1;
  const restored: DrinkMenuRowInput = stored
    ? {
        slug: stored.slug,
        name: stored.name,
        priceRm: stored.priceRm,
        category: TIPS_MENU_CATEGORY,
        sortOrder: nextSort,
      }
    : newTipsMenuRow(nextSort);
  return [...incoming, restored];
}

/**
 * Give an outlet its tips row if it has not got one — idempotent, so the
 * backfill is safe to re-run and creation is safe to retry.
 *
 * Returns `true` only when a row was written. `false` covers both "already had
 * one" and "has no workspace yet": there is nothing to hang a menu row off
 * until the workspace parent exists, and `createDefaultRateCard` is what
 * creates that.
 */
export async function ensureTipsMenuRow(params: {
  outletId: string;
  actor: string;
  tx?: DbTransaction;
}): Promise<boolean> {
  const { outletId, actor, tx } = params;
  const client = tx ?? db;

  const [workspace] = await client
    .select({ id: OutletWorkspaceTable.id })
    .from(OutletWorkspaceTable)
    .where(eq(OutletWorkspaceTable.outletId, outletId))
    .limit(1);
  if (!workspace) return false;

  const menu = await client
    .select({
      slug: OutletDrinkMenuTable.slug,
      name: OutletDrinkMenuTable.name,
      category: OutletDrinkMenuTable.category,
      sortOrder: OutletDrinkMenuTable.sortOrder,
    })
    .from(OutletDrinkMenuTable)
    .where(eq(OutletDrinkMenuTable.workspaceId, workspace.id))
    .orderBy(asc(OutletDrinkMenuTable.sortOrder));
  if (menu.some(isTipsMenuRow)) return false;

  const nextSort = menu.reduce((max, r) => Math.max(max, r.sortOrder), -1) + 1;
  await client.insert(OutletDrinkMenuTable).values({
    ...newTipsMenuRow(nextSort),
    workspaceId: workspace.id,
    outletId,
    createdBy: actor,
    updatedBy: actor,
  });
  logger.info('[tipsMenuRow] Seeded', { outletId });
  return true;
}

/**
 * The venue's stored tips row, or null — read before an upsert replaces the
 * list, so the replacement can carry the venue's own price forward.
 *
 * Narrowed in memory rather than in SQL: the three-way test does not express as
 * one index-friendly predicate, and a venue's menu is a handful of rows.
 */
export async function findStoredTipsRow(
  client: DbTransaction | typeof db,
  workspaceId: string,
): Promise<StoredTipsRow | null> {
  const rows = await client
    .select({
      slug: OutletDrinkMenuTable.slug,
      name: OutletDrinkMenuTable.name,
      priceRm: OutletDrinkMenuTable.priceRm,
      category: OutletDrinkMenuTable.category,
    })
    .from(OutletDrinkMenuTable)
    .where(eq(OutletDrinkMenuTable.workspaceId, workspaceId));

  /*
   * ⚠️ ORDERED, because more than one row can match and the answer becomes the
   * row's ADDRESS — `withTipsMenuRow` looks the incoming payload up by this
   * slug. A venue that had named a service "Tips" before the seed existed has
   * two candidates, and an unordered `.find()` would pick whichever the planner
   * returned first: the same save could restore a different row each time.
   * Canonical first (the seeded slug), then the stored money bucket, then the
   * name — weakest, and only because it is how such a row was ever recognised.
   */
  const found =
    rows.find((r) => r.slug === TIPS_MENU_SLUG) ??
    rows.find((r) => r.category === TIPS_MENU_CATEGORY) ??
    rows.find(isTipsMenuRow);
  return found
    ? { slug: found.slug, name: found.name, priceRm: found.priceRm }
    : null;
}
