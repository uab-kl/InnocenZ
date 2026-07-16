import type { CutlostModel } from '@agency-portal/lib/outlet-cutlost-recommendations';

export type CutlostRequestKind = 'release_prs' | 'cut_slots' | 'best_effort';

export type PendingCutlostRequest = {
  id: string;
  shiftId: string;
  outletName: string;
  shiftEvent: string;
  shiftLabel: string;
  dateLabel: string;
  kind: CutlostRequestKind;
  model?: CutlostModel;
  status: 'pending' | 'approved' | 'rejected';
  releasedPrIds?: string[];
  releasedPrNames?: string[];
  slotsCut?: number;
  estimatedSavings: number;
  cutlostBefore: number;
  requestedAt: string;
  declineReason?: string;
  rationale?: string[];
};

export function cutlostRequestTitle(
  req: Pick<
    PendingCutlostRequest,
    'kind' | 'model' | 'releasedPrNames' | 'slotsCut'
  >,
): string {
  if (req.kind === 'best_effort' || req.model === 'best_effort') {
    return 'Best-effort cutlost plan';
  }
  if (req.kind === 'release_prs') {
    const names = req.releasedPrNames ?? [];
    if (names.length === 1) return `Release ${names[0]} early`;
    if (names.length === 2) return 'Release 2 PRs early';
    return `Release ${names.length} PRs early`;
  }
  const n = req.slotsCut ?? 0;
  return n === 1 ? 'Cut 1 open slot' : `Cut ${n} open slots`;
}

export function cutlostRequestDetail(req: PendingCutlostRequest): string {
  if (req.kind === 'best_effort') {
    const parts: string[] = [];
    if ((req.slotsCut ?? 0) > 0) {
      parts.push(`${req.slotsCut} slot${req.slotsCut === 1 ? '' : 's'} cut`);
    }
    if (req.releasedPrNames?.length) {
      parts.push(
        `release ${req.releasedPrNames.join(', ')} (80% unused wages)`,
      );
    }
    return `${req.outletName} · ${parts.join(' · ') || 'Early-release plan'}`;
  }
  if (req.kind === 'release_prs') {
    const names = req.releasedPrNames?.join(', ') ?? 'Selected PRs';
    return `${req.outletName} · ${names}`;
  }
  return `${req.outletName} · ${req.slotsCut ?? 0} unfilled slot${(req.slotsCut ?? 0) === 1 ? '' : 's'} off plan`;
}
