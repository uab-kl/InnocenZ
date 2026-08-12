import {
  ResolvedTierRate,
  ShiftAssignmentRepositoryClass,
  ShiftTierOverride,
} from './shift-assignment.repository';

/**
 * The `pr.tier` -> outlet tier-rate label map now lives in the leaf module
 * `tier-demand.ts`, so the wage resolver and the per-tier demand counter share
 * ONE definition. Re-exported here because this was its home and several callers
 * still import it from this path.
 */
export { PR_TIER_TO_OUTLET_LABEL } from './tier-demand';
import { PR_TIER_TO_OUTLET_LABEL } from './tier-demand';

/**
 * Effective rate for one assignment: the per-shift override wins field-by-field
 * over the outlet workspace default; the happy-hour window always comes from the
 * workspace (a shift override never moves it). `overridden` flags that a shift
 * override applied, so the mobile app can show "rate set for this shift".
 * Null only when neither source has a rate configured.
 */
export function mergeRate(
  ws: ResolvedTierRate | undefined,
  ov: ShiftTierOverride | undefined,
): (ResolvedTierRate & { overridden: boolean }) | null {
  if (!ws && !ov) return null;
  return {
    wagePerHour: ov?.wagePerHour ?? ws?.wagePerHour ?? null,
    drinkPct: ov?.drinkPct ?? ws?.drinkPct ?? '0',
    happyHourDrinkPct: ov?.happyHourDrinkPct ?? ws?.happyHourDrinkPct ?? null,
    tipPct: ov?.tipPct ?? ws?.tipPct ?? '0',
    otAfterHours: ov?.otAfterHours ?? ws?.otAfterHours ?? null,
    targetSalesRm: ov?.targetSalesRm ?? ws?.targetSalesRm ?? null,
    happyHourStart: ws?.happyHourStart ?? '',
    happyHourEnd: ws?.happyHourEnd ?? '',
    // Like the window, the guest-facing drink discount is a WORKSPACE fact: a
    // per-shift pay-tier override sets what the PR earns, never what the bar
    // charges a customer. 0 when unset — "no discount", never a null the
    // pricing helper would have to interpret.
    happyHourDrinkDiscountPct: ws?.happyHourDrinkDiscountPct ?? 0,
    overridden: !!ov,
  };
}

/**
 * The DAY RATE for this PR's tier on this shift: the per-shift override from
 * Post Job "Pay by PR tier → Wages", else the outlet workspace tier rate.
 * Commission-only PRs have no wages row, so null.
 *
 * 🔴 Shared, not duplicated. This is the figure `sealCheckOut` pro-rates and the
 * figure overtime is priced against, and it now has two callers — a PR closing
 * their own shift, and an approved cut-loss releasing them early. A second copy
 * would be a second answer to "what does this shift pay", which is the exact
 * fault this whole area was built to remove.
 *
 * Despite the field name, `wagePerHour` is the DB column `daily_wage` — a DAILY
 * figure (Tier I = 500), never an hourly one. See the alias note on
 * `OutletTierRateTable`.
 */
export async function resolveTierWages(
  repository: ShiftAssignmentRepositoryClass,
  pr: { tier: string },
  shiftId: string,
  outletId: string,
): Promise<string | null> {
  const outcome = await resolveTierWageOutcome(repository, pr, shiftId, outletId);
  return outcome.kind === 'priced' ? outcome.wage : null;
}

/**
 * Why there is no wage — the distinction `resolveTierWages`'s `null` cannot make.
 *
 * `commission_only` is a PR who is CORRECTLY unpaid a day rate: they earn on
 * commission and no wages row is supposed to exist. `unpriced` is a PR whose tier
 * this outlet never put a price on — an accident of configuration.
 *
 * Both collapsed to `null`, and the assign path spent that null as `'0.00'`. So a
 * PR assigned to a tier the outlet never costed was booked at RM0.00 and told
 * nobody: identical, byte for byte, to a legitimately commission-only booking.
 * Anything that must refuse one and allow the other has to read THIS, not the
 * number.
 */
export type TierWageOutcome =
  | { kind: 'priced'; wage: string }
  | { kind: 'commission_only' }
  | { kind: 'unpriced'; tierLabel: string | null };

/**
 * Merged rate -> outcome. Extracted so the single-shift and many-shift entry
 * points below cannot answer "what does this pay" differently.
 */
function outcomeFromRate(
  rate: ReturnType<typeof mergeRate>,
  tierLabel: string | null,
): TierWageOutcome {
  if (rate?.wagePerHour == null || rate.wagePerHour === '') return { kind: 'unpriced', tierLabel };
  const n = Number(rate.wagePerHour);
  // A non-numeric rate is a broken price, not an absent one — but it buys the PR
  // exactly as little, so it refuses down the same path.
  return Number.isFinite(n)
    ? { kind: 'priced', wage: n.toFixed(2) }
    : { kind: 'unpriced', tierLabel };
}

export async function resolveTierWageOutcome(
  repository: ShiftAssignmentRepositoryClass,
  pr: { tier: string },
  shiftId: string,
  outletId: string,
): Promise<TierWageOutcome> {
  const outcomes = await resolveTierWageOutcomesForShifts(repository, pr, [{ shiftId, outletId }]);
  return (
    outcomes.get(shiftId) ?? { kind: 'unpriced', tierLabel: PR_TIER_TO_OUTLET_LABEL[pr.tier] ?? null }
  );
}

/**
 * The same answer for MANY shifts at once, keyed by shiftId.
 *
 * Batched on purpose: both repository lookups already take arrays, so asking
 * about a whole day's shifts costs the same two queries as asking about one.
 * Looping `resolveTierWageOutcome` would be 2N queries for identical rows.
 *
 * This exists so the agency can be SHOWN what a PR will earn before assigning
 * them, off the same resolver that later seals the wage — a preview computed any
 * other way would be a second answer, and the one place it could disagree is the
 * one that matters: `unpriced`, which the assign path spends as '0.00'.
 */
export async function resolveTierWageOutcomesForShifts(
  repository: ShiftAssignmentRepositoryClass,
  pr: { tier: string },
  shifts: readonly { shiftId: string; outletId: string }[],
): Promise<Map<string, TierWageOutcome>> {
  const out = new Map<string, TierWageOutcome>();
  if (shifts.length === 0) return out;

  const commissionOnly = pr.tier === 'commission_only';
  if (commissionOnly) {
    for (const s of shifts) out.set(s.shiftId, { kind: 'commission_only' });
    return out;
  }

  const tierLabel = PR_TIER_TO_OUTLET_LABEL[pr.tier] ?? null;
  const [rateByOutlet, overrideByShift] = await Promise.all([
    repository.resolveTierRatesForOutlets({
      outletIds: [...new Set(shifts.map((s) => s.outletId))],
      tierLabel,
      commissionOnly,
    }),
    repository.resolveShiftTierOverrides({
      shiftIds: shifts.map((s) => s.shiftId),
      tierLabel,
      commissionOnly,
    }),
  ]);

  for (const s of shifts) {
    const rate = mergeRate(rateByOutlet.get(s.outletId), overrideByShift.get(s.shiftId));
    out.set(s.shiftId, outcomeFromRate(rate, tierLabel));
  }
  return out;
}
