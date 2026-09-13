import { z } from 'zod';
import { tierRateKindValues } from '@/features/outlet-workspace/outlet-workspace.model.js';

/**
 * Every number on this rate card was `z.coerce.number()` and nothing else — no
 * floor, no ceiling. A venue could save a drink commission of -50% or of 5000%,
 * and a daily wage of -500.
 *
 * It is not theoretical arithmetic: `resolveCommissionPcts` prices a PR's
 * earnings off these columns, and `resolveTierWages` prices their day off
 * `wagePerHour`. A negative percentage is a voucher line that SUBTRACTS from
 * someone's pay for selling a drink; a 5000% one is a commission fifty times the
 * bar's takings. Neither is a state any screen offers, which is exactly why the
 * API had to be the place that refuses it.
 *
 * A percentage is 0-100 and money is not negative. Deliberately no upper bound
 * on the money itself — a venue may legitimately price a bottle or a day at any
 * figure, and inventing a maximum would refuse an honest one.
 */
const pct = (label: string) =>
  z.coerce
    .number()
    .min(0, `${label} cannot be negative`)
    .max(100, `${label} cannot be more than 100%`);
const money = (label: string) =>
  z.coerce.number().min(0, `${label} cannot be negative`);

export const TierRateSchema = z.object({
  kind: z.enum(tierRateKindValues).default('tier'),
  tier: z.string().max(50).optional().nullable(),
  // Despite the name this is the DAILY wage — see the alias note on
  // `OutletTierRateTable`. Tier I is 500, not 500 an hour.
  wagePerHour: money('Daily wage').optional().nullable(),
  drinkPct: pct('Drink commission').default(0),
  happyHourDrinkPct: pct('Happy-hour drink commission').optional().nullable(),
  tipPct: pct('Tip commission').default(0),
  otAfterHours: money('Overtime-after hours').optional().nullable(),
  targetSalesRm: money('Target sales').optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
});

export const DrinkMenuItemSchema = z.object({
  slug: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  priceRm: money('Price').default(0),
  // 'drink' | 'service' | 'tip' — reuses the existing outlet_drink_menu.category
  // varchar(20) column (no migration needed). 'tip' rows show under the TIPS
  // workspace list and the PR tips scan/self-log.
  category: z.enum(['drink', 'service', 'tip']).default('service'),
  sortOrder: z.coerce.number().int().default(0),
});

/**
 * 🔴 AN OMITTED FIELD MEANS "LEAVE IT ALONE" — IT USED TO MEAN "ERASE IT".
 *
 * Every field here carried a `.default()`, and the repository's upsert DELETES
 * both child tables before re-inserting whatever it was handed. So a PUT that
 * simply left `tierRates` out deleted the venue's entire rate card, inserted
 * nothing in its place, and answered 200 "Workspace saved". The same shape
 * zeroed `drinkPct`, `tipPct` and `perDrinkRm` and blanked the happy-hour window
 * on the parent row.
 *
 * That is not a hypothetical: `use-outlet-workspace.ts` carries the note — two
 * venues lost their whole rate card and all seven tier rows this way once
 * already, when a failed GET rendered an empty form and Save sent it. The client
 * side of that was closed by withholding Save on a failed load; this is the
 * server side, and it is the half that has to hold, because the screen is not
 * the only thing that can call a PUT.
 *
 * `.optional()` rather than `.default()`, so the three states stay distinct:
 * absent = keep what is stored, `[]` = the caller really is clearing the list,
 * a populated array = replace. The repository reads `undefined` and skips.
 */
export const UpsertOutletWorkspaceSchema = z.object({
  basePayPerHour: money('Base pay').optional(),
  drinkPct: pct('Drink commission').optional(),
  tipPct: pct('Tip commission').optional(),
  otAfterHours: money('Overtime-after hours').optional(),
  perDrinkRm: money('Per-drink amount').optional(),
  happyHourStart: z.string().max(10).optional(),
  happyHourEnd: z.string().max(10).optional(),
  // A DISCOUNT off the guest's price, so it is also a 0-100 percentage.
  happyHourDrinkDiscountPct: pct('Happy-hour discount').int().optional(),
  tierRates: z.array(TierRateSchema).optional(),
  drinkMenu: z.array(DrinkMenuItemSchema).optional(),
});

export type UpsertOutletWorkspaceInput = z.infer<
  typeof UpsertOutletWorkspaceSchema
>;
