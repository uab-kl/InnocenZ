import type {
  AgencyManagedPR,
  OutletPrTier,
  OutletTierRateSettings,
} from '@agency-portal/lib/agency-demo';
import type { ShiftRequest } from '@agency-portal/lib/store';
import {
  mergeReleasedEarlyPrIds,
  outletPlanningReleaseClock,
  outletShiftActivePrIds,
  outletShiftCutLossSavings,
  outletShiftEarlyReleaseUnusedWages,
  outletShiftLaborCostForPrIds,
  releasedEarlyAtForPrIds,
} from '@agency-portal/lib/outlet-demo';

export type CutlostModel = 'guaranteed' | 'best_effort';

export type BestEffortCutlostPlan = {
  prIds: string[];
  prNames: string[];
  /** Phase 1: best effort focuses on early releases; slot cuts are a separate action. */
  slotsCut: number;
  estimatedSavings: number;
  unusedWages: number;
  clearsCutlost: boolean;
  rationale: string[];
};

function prReleaseScore(pr: AgencyManagedPR, laborRm: number): number {
  const tierNum = Number.parseInt(pr.trainingLevel.replace(/\D/g, ''), 10) || 3;
  const ratingPenalty = Math.max(0, 5 - pr.rating);
  return ratingPenalty * 10 + tierNum * 2 - laborRm / 500;
}

/**
 * Best-effort Phase 1: recommend early releases.
 * Outlet saves 80% of unused wages (hours not worked × hourly). Slot cuts stay separate.
 */
export function recommendBestEffortCutlost(opts: {
  shift: ShiftRequest;
  tierRates: Record<OutletPrTier, OutletTierRateSettings>;
  prTierById: Record<string, string | undefined>;
  agencyPRs: AgencyManagedPR[];
  releaseAtClock?: string;
}): BestEffortCutlostPlan | null {
  const { shift, tierRates, prTierById, agencyPRs } = opts;
  const releaseAtClock =
    opts.releaseAtClock ?? outletPlanningReleaseClock(shift.shift);
  const releasable = outletShiftActivePrIds(shift);
  if (!releasable.length) return null;

  const ranked = releasable
    .map((id) => {
      const pr = agencyPRs.find((p) => p.id === id);
      const laborRm = outletShiftLaborCostForPrIds(
        [id],
        shift.shift,
        tierRates,
        prTierById,
      );
      return {
        id,
        name: pr?.name ?? id,
        pr,
        laborRm,
        score: pr ? prReleaseScore(pr, laborRm) : 999,
      };
    })
    .sort((a, b) => b.score - a.score || b.laborRm - a.laborRm);

  const maxReleases = Math.max(1, Math.ceil(releasable.length / 2));
  const prIds: string[] = [];
  const rationale: string[] = [];

  for (const candidate of ranked) {
    if (prIds.length >= maxReleases) break;
    const trialIds = [...prIds, candidate.id];
    const nextReleased = mergeReleasedEarlyPrIds(
      shift.releasedEarlyPrIds,
      trialIds,
    );
    const patch = {
      releasedEarlyPrIds: nextReleased,
      releasedEarlyAt: releasedEarlyAtForPrIds(nextReleased, releaseAtClock),
      releaseAtClock,
    };
    const savings = outletShiftCutLossSavings(
      shift,
      tierRates,
      prTierById,
      patch,
      'best_effort',
    );
    const prevPatch =
      prIds.length === 0
        ? null
        : {
            releasedEarlyPrIds: mergeReleasedEarlyPrIds(
              shift.releasedEarlyPrIds,
              prIds,
            ),
            releasedEarlyAt: releasedEarlyAtForPrIds(
              mergeReleasedEarlyPrIds(shift.releasedEarlyPrIds, prIds),
              releaseAtClock,
            ),
            releaseAtClock,
          };
    const prevSavings = prevPatch
      ? outletShiftCutLossSavings(
          shift,
          tierRates,
          prTierById,
          prevPatch,
          'best_effort',
        )
      : 0;
    if (savings <= prevSavings) continue;

    prIds.push(candidate.id);
    const unusedAlone = outletShiftEarlyReleaseUnusedWages(
      shift,
      {
        releasedEarlyPrIds: mergeReleasedEarlyPrIds(shift.releasedEarlyPrIds, [
          candidate.id,
        ]),
        releaseAtClock,
      },
      tierRates,
      prTierById,
    );
    rationale.push(
      `Release ${candidate.name} early — pay exact hours worked; ~RM ${Math.round(unusedAlone).toLocaleString('en-MY')} unused wages (80% outlet save).`,
    );
  }

  if (!prIds.length) return null;

  const releasedEarlyPrIds = mergeReleasedEarlyPrIds(
    shift.releasedEarlyPrIds,
    prIds,
  );
  const patch = {
    releasedEarlyPrIds,
    releasedEarlyAt: releasedEarlyAtForPrIds(
      releasedEarlyPrIds,
      releaseAtClock,
    ),
    releaseAtClock,
  };
  const unusedWages = outletShiftEarlyReleaseUnusedWages(
    shift,
    patch,
    tierRates,
    prTierById,
  );
  const estimatedSavings = outletShiftCutLossSavings(
    shift,
    tierRates,
    prTierById,
    patch,
    'best_effort',
  );
  if (estimatedSavings <= 0) return null;

  return {
    prIds,
    prNames: prIds.map((id) => agencyPRs.find((p) => p.id === id)?.name ?? id),
    slotsCut: 0,
    estimatedSavings,
    unusedWages,
    clearsCutlost: false,
    rationale:
      rationale.length > 0
        ? rationale
        : [
            'Release selected PRs early — outlet keeps 80% of unused wages; commissions stay earned.',
          ],
  };
}
