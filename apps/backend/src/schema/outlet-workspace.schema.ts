import { z } from 'zod';
import { tierRateKindValues } from '@/features/outlet-workspace/outlet-workspace.model.js';
import { PR_TIER_TO_OUTLET_LABEL } from '@/features/shift-assignment/tier-demand.js';

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

/**
 * 🔴 A TIER ROW IS FOUND BY ITS EXACT LABEL — SO ONLY THE SIX LABELS MAY BE SAVED.
 *
 * `agency_pr.tier` is an enum; `outlet_tier_rate.tier` and `shift_pay_tier.tier`
 * are free text. The pay resolver bridges them through `PR_TIER_TO_OUTLET_LABEL`
 * with an exact, case-sensitive match (`resolveTierRatesForOutlets`), so a row
 * saved as 'Tier 1' or 'Tier I ' is simply never found: the PR's day goes
 * 'unpriced' (assign refused 409), commission falls back to the built-in 15/10,
 * and happy hour switches off for them, because the window travels with the
 * tier row. Nothing said so at the door. Commission-only is matched on `kind`
 * and deliberately carries no label.
 *
 * The labels are DERIVED from the map, never retyped, so a seventh tier is one
 * edit there (plus `prTierValues` and the web's `OUTLET_PR_TIERS`). Every live
 * row (48 rate-card + 316 shift rows, 12 Nov 2026) already uses exactly these.
 *
 * Shared with `shift.schema.ts`: Post Job's pay tiers are the same rows per shift.
 */
export const OUTLET_TIER_LABELS: readonly string[] = Object.values(PR_TIER_TO_OUTLET_LABEL);

const TIER_LABEL_LIST = OUTLET_TIER_LABELS.join(', ');

export const TIER_ROW_NEEDS_LABEL = `Every tier rate must name its tier: one of ${TIER_LABEL_LIST}.`;
export const COMMISSION_ONLY_HAS_NO_TIER =
  'The commission-only rate has no tier — leave its tier empty.';
export const unknownTierLabelRefusal = (tier: string): string =>
  `"${tier}" is not a PR tier — use one of ${TIER_LABEL_LIST}.`;

/** Why one rate row's label cannot be priced, or null when it can. */
export function tierRowLabelRefusal(row: { kind?: unknown; tier?: unknown }): string | null {
  if (row.kind === 'commission_only') {
    // Null only — '' is not "no tier" to the database, and a CHECK added later
    // (or the resolver) would read it as a label.
    return row.tier == null ? null : COMMISSION_ONLY_HAS_NO_TIER;
  }
  if (typeof row.tier === 'string' && OUTLET_TIER_LABELS.includes(row.tier)) return null;
  if (typeof row.tier === 'string' && row.tier !== '') return unknownTierLabelRefusal(row.tier);
  return TIER_ROW_NEEDS_LABEL;
}

/**
 * 🔴 ONE ROW PER TIER. The upsert replaces the card with whatever list it is
 * sent, there is no unique key on (workspace, kind, tier), and the resolver has
 * no ORDER BY and keeps the LAST matching row — so a card holding two 'Tier II'
 * rows priced a PR by query order. The web always sends each tier once; this is
 * for every other caller. `where` names the list in the refusal.
 */
export function repeatedTierRowRefusal(
  rows: readonly { kind?: unknown; tier?: unknown }[],
  where: string,
): string | null {
  const seen = new Set<string>();
  let commissionOnly = 0;
  for (const row of rows) {
    if (row.kind === 'commission_only') {
      commissionOnly += 1;
      if (commissionOnly > 1) return `The commission-only rate appears more than once ${where} — keep one.`;
      continue;
    }
    // A missing label is refused per row (`tierRowLabelRefusal`); not a repeat.
    if (typeof row.tier !== 'string' || row.tier === '') continue;
    if (seen.has(row.tier)) return `${row.tier} appears more than once ${where} — keep one row per tier.`;
    seen.add(row.tier);
  }
  return null;
}

/**
 * 🔴 ONE ITEM PER ID ON A PRICE LIST. The PR's phone keys quantities by the slug
 * (`drinkQtys[d.id]`), so two rows sharing one both take the quantity typed and
 * the drink is logged — and commissioned — twice. Billing matches by NAME, so
 * this is deliberately an id rule, not a name rule: two honest items may share
 * a name across Drinks and Services. The web mints `${category}-${Date.now()}`
 * ids, so only a non-web caller can repeat one.
 */
export function repeatedSlugRefusal(
  items: readonly { slug?: unknown }[],
  listName: string,
): string | null {
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item.slug !== 'string') continue;
    if (seen.has(item.slug)) {
      return `Two items on the ${listName} share the id "${item.slug}" — give each item its own id.`;
    }
    seen.add(item.slug);
  }
  return null;
}

/**
 * ⚠️ zod 4.4: a refinement on a z.object makes `.partial()` / `.pick()` /
 * `.omit()` THROW AT IMPORT. TierRateSchema is only ever used inside an array;
 * keep it that way, or split an unrefined base first.
 */
export const TierRateSchema = z
  .object({
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
  })
  .superRefine((row, ctx) => {
    const refusal = tierRowLabelRefusal(row);
    if (refusal) ctx.addIssue({ code: 'custom', message: refusal, path: ['tier'] });
  });

/**
 * 🔴 HAPPY HOUR IS A 24-HOUR 'HH:MM' PAIR, OR BLANK — NOTHING ELSE.
 *
 * The columns are varchar and the screen's boxes were free text, so '9pm' or
 * '21.00' saved happily — and both readers (the PR's phone, which sets the
 * price and the commission, and the web's live-sales split) treat anything but
 * 'H:MM'/'HH:MM' as "no happy hour", silently. This accepts exactly what those
 * parsers accept and stores it zero-padded ('9:00' → '09:00'), so every reader
 * and a later CHECK see one spelling. '' stays the deliberate "no happy hour".
 */
const HAPPY_HOUR_TIME = /^(?:[01]?\d|2[0-3]):[0-5]\d$/;

export const happyHourTimeRefusal = (label: string): string =>
  `${label} must be a 24-hour time such as 21:00, or blank for no happy hour.`;
export const HAPPY_HOUR_NEEDS_BOTH =
  'Set both a start and an end for happy hour, or leave both blank for no happy hour.';
export const HAPPY_HOUR_SAME_TIME =
  'Happy hour cannot start and end at the same time — leave both blank for no happy hour.';

const happyHourTime = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || HAPPY_HOUR_TIME.test(v), happyHourTimeRefusal(label))
    .transform((v) => (v === '' ? '' : v.padStart(5, '0')));

/**
 * The PAIR rule — checked only when BOTH ends are sent. An omitted field means
 * "keep what is stored" (below), so a PUT carrying one end alone is legal and
 * cannot be judged here without the stored row.
 */
export function happyHourPairRefusal(
  start: string | undefined,
  end: string | undefined,
): string | null {
  if (start === undefined || end === undefined) return null;
  if ((start === '') !== (end === '')) return HAPPY_HOUR_NEEDS_BOTH;
  if (start !== '' && start === end) return HAPPY_HOUR_SAME_TIME;
  return null;
}

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
 *
 * ⚠️ This object carries a refinement (the happy-hour pair), so under zod 4.4
 * it must never be `.partial()`'d / `.pick()`'d / `.omit()`'d — that throws at
 * import and takes the backend down. Nothing derives from it today.
 */
export const UpsertOutletWorkspaceSchema = z
  .object({
    basePayPerHour: money('Base pay').optional(),
    drinkPct: pct('Drink commission').optional(),
    tipPct: pct('Tip commission').optional(),
    otAfterHours: money('Overtime-after hours').optional(),
    perDrinkRm: money('Per-drink amount').optional(),
    happyHourStart: happyHourTime('Happy hour start').optional(),
    happyHourEnd: happyHourTime('Happy hour end').optional(),
    // A DISCOUNT off the guest's price, so it is also a 0-100 percentage.
    happyHourDrinkDiscountPct: pct('Happy-hour discount').int().optional(),
    tierRates: z
      .array(TierRateSchema)
      .superRefine((rows, ctx) => {
        const refusal = repeatedTierRowRefusal(rows, 'on this rate card');
        if (refusal) ctx.addIssue({ code: 'custom', message: refusal });
      })
      .optional(),
    drinkMenu: z
      .array(DrinkMenuItemSchema)
      .superRefine((items, ctx) => {
        const refusal = repeatedSlugRefusal(items, 'price list');
        if (refusal) ctx.addIssue({ code: 'custom', message: refusal });
      })
      .optional(),
  })
  .superRefine((d, ctx) => {
    const refusal = happyHourPairRefusal(d.happyHourStart, d.happyHourEnd);
    if (refusal) ctx.addIssue({ code: 'custom', message: refusal, path: ['happyHourEnd'] });
  });

export type UpsertOutletWorkspaceInput = z.infer<
  typeof UpsertOutletWorkspaceSchema
>;
