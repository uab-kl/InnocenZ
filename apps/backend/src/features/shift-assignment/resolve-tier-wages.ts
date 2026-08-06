import {
  ResolvedTierRate,
  ShiftAssignmentRepositoryClass,
  ShiftTierOverride,
} from './shift-assignment.repository';

/**
 * The `pr.tier` enum maps to the outlet workspace's tier-rate labels. Ranked
 * tiers carry a label (`outlet_tier_rate.kind='tier'`); commission-only is a
 * label-less row (`kind='commission_only'`), so it resolves via the flag, not a
 * label. Keep in step with `prTierValues` and the outlet portal's
 * `OUTLET_PR_TIERS`.
 */
export const PR_TIER_TO_OUTLET_LABEL: Record<string, string> = {
  tier_1: 'Tier I',
  tier_2: 'Tier II',
  tier_3: 'Tier III',
  tier_4: 'Tier IV',
  tier_5: 'Tier V',
  servant: 'Servant',
};

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
  const commissionOnly = pr.tier === 'commission_only';
  if (commissionOnly) return null;
  const tierLabel = PR_TIER_TO_OUTLET_LABEL[pr.tier] ?? null;
  const [rateByOutlet, overrideByShift] = await Promise.all([
    repository.resolveTierRatesForOutlets({ outletIds: [outletId], tierLabel, commissionOnly }),
    repository.resolveShiftTierOverrides({ shiftIds: [shiftId], tierLabel, commissionOnly }),
  ]);
  const rate = mergeRate(rateByOutlet.get(outletId), overrideByShift.get(shiftId));
  if (rate?.wagePerHour == null || rate.wagePerHour === '') return null;
  const n = Number(rate.wagePerHour);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}
