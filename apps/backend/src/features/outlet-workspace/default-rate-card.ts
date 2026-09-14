import { eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import type { DbTransaction } from '@/types/db-transaction';
import { logger } from '@/util/logger.js';
import {
  OutletDrinkMenuTable,
  type OutletTierRateInsertType,
  OutletTierRateTable,
  OutletWorkspaceTable,
} from './outlet-workspace.model.js';
import { newTipsMenuRow } from './tips-menu-row.js';

/**
 * The rate card a venue starts life on.
 *
 * These are UAB Emhub's numbers, made the product default on the owner's
 * instruction (10 Sep 2026) — until then a new outlet got NO `outlet_workspace`
 * row at all, and the portal fell back to `DEFAULT_OUTLET_WORKSPACE` in
 * `apps/web`, a demo fixture still labelled "Velvet 23" that showed RM 40/50/55
 * with 0% on every commission column. Four live venues were sitting on that
 * fallback: a rate card nobody chose, that no server-side query could read, and
 * that the venue could not have edited because there was nothing to edit.
 *
 * ⚠️ A STARTING POINT, NOT A POLICY. Once a venue saves its Workspace these
 * rows are its own, and nothing here may reach back in — see
 * `createDefaultRateCard`, which refuses outright rather than merging.
 *
 * `wagePerHour` is the DAILY wage (the column is `daily_wage`) and
 * `otAfterHours` is the STANDARD SHIFT LENGTH in hours (the column is
 * `standard_shift_hours`); both TS names are wire-compatibility relics the
 * model documents. RM/hr and OT/hr are derived from the pair, never stored.
 */
const TIER_RATES = [
  // tier,      daily wage, target sales, HH drink %, NH drink %, tip %
  ['Tier I', 500, 1000, 5, 10, 15],
  ['Tier II', 600, 1200, 6, 11, 16],
  ['Tier III', 700, 1500, 7, 12, 17],
  ['Tier IV', 825, 1800, 8, 13, 18],
  ['Tier V', 1000, 2000, 9, 14, 19],
  ['Servant', 200, 800, 3, 8, 12],
] as const;

/** The standard shift the hourly and OT rates are derived over. */
const STANDARD_SHIFT_HOURS = 6;

/**
 * The one `kind='commission_only'` row: a PR paid purely on commission, so it
 * carries no wage and no shift length (both null) and much higher percentages.
 */
const COMMISSION_ONLY = { happyHourDrinkPct: 75, drinkPct: 80, tipPct: 85 };

/**
 * Parent scalars. The happy-hour WINDOW is included because the per-tier
 * "HH drinks %" above is unreadable without one — a happy-hour rate with no
 * happy hour is a column that can never apply.
 *
 * ⚠️ `happyHourDrinkDiscountPct` is deliberately NOT copied from Emhub (which
 * runs 15). That is a discount on MENU PRICES, not part of the rate card the
 * owner asked to standardise, and quietly giving every venue a 15% drinks
 * discount would move money nobody asked to move. It stays at the column
 * default of 0 for the venue to set.
 */
const WORKSPACE_PARENT = {
  basePayPerHour: '500',
  drinkPct: '10',
  tipPct: '15',
  otAfterHours: String(STANDARD_SHIFT_HOURS),
  perDrinkRm: '0',
  happyHourStart: '21:00',
  happyHourEnd: '23:00',
};

/**
 * Give an outlet the default rate card — ONCE.
 *
 * Returns the number of tier rows written; `0` means the venue already had a
 * workspace and was left completely alone. That refusal is the whole contract:
 * this runs at outlet creation and from a backfill script, and the backfill
 * must be safe to re-run without reverting a venue that has since priced its
 * own tiers. Same rule the starter templates follow — seeded once, then the
 * venue's to edit or delete.
 *
 * Callers wrap this in their own try/catch: a venue with no rate card is
 * recoverable by saving its Workspace, so it must never take a registration
 * down with it.
 */
export async function createDefaultRateCard(params: {
  outletId: string;
  actor: string;
  tx?: DbTransaction;
}): Promise<number> {
  const { outletId, actor, tx } = params;
  const client = tx ?? db;

  // Presence of the PARENT is the test, not the tier rows: a venue that
  // deliberately deleted every tier still has a workspace, and re-seeding it
  // would put back rows it had removed on purpose.
  const [existing] = await client
    .select({ id: OutletWorkspaceTable.id })
    .from(OutletWorkspaceTable)
    .where(eq(OutletWorkspaceTable.outletId, outletId))
    .limit(1);
  if (existing) return 0;

  const [workspace] = await client
    .insert(OutletWorkspaceTable)
    .values({ ...WORKSPACE_PARENT, outletId, createdBy: actor, updatedBy: actor })
    // outlet_id is unique — two concurrent creates cannot leave a venue with
    // two workspaces, and the loser writes no tiers.
    .onConflictDoNothing()
    .returning({ id: OutletWorkspaceTable.id });
  if (!workspace) return 0;

  const tierRows: OutletTierRateInsertType[] = TIER_RATES.map(
    ([tier, wage, target, hhDrinkPct, drinkPct, tipPct], i) => ({
      workspaceId: workspace.id,
      outletId,
      kind: 'tier',
      tier,
      wagePerHour: String(wage),
      targetSalesRm: String(target),
      happyHourDrinkPct: String(hhDrinkPct),
      drinkPct: String(drinkPct),
      tipPct: String(tipPct),
      otAfterHours: String(STANDARD_SHIFT_HOURS),
      sortOrder: i,
      createdBy: actor,
      updatedBy: actor,
    }),
  );
  tierRows.push({
    workspaceId: workspace.id,
    outletId,
    kind: 'commission_only',
    tier: null,
    wagePerHour: null,
    targetSalesRm: null,
    happyHourDrinkPct: String(COMMISSION_ONLY.happyHourDrinkPct),
    drinkPct: String(COMMISSION_ONLY.drinkPct),
    tipPct: String(COMMISSION_ONLY.tipPct),
    otAfterHours: null,
    sortOrder: TIER_RATES.length,
    createdBy: actor,
    updatedBy: actor,
  });

  const written = await client
    .insert(OutletTierRateTable)
    .values(tierRows)
    .returning({ id: OutletTierRateTable.id });

  // The one price row a venue starts with. The two price LISTS stay empty —
  // every drink and every service is the venue's own — but tips are a line
  // nobody thinks to add, and an outlet that never adds it has no price for a
  // PR's tip to be logged against. Unpriced, so it still reads as theirs to set.
  await client.insert(OutletDrinkMenuTable).values({
    ...newTipsMenuRow(0),
    workspaceId: workspace.id,
    outletId,
    createdBy: actor,
    updatedBy: actor,
  });

  logger.info('[defaultRateCard] Seeded', { outletId, tiers: written.length });
  return written.length;
}
