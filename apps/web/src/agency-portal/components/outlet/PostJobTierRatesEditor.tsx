import { useState, type ReactNode } from 'react';
import { Award, Crown, Medal, Percent, Star, UserRound } from 'lucide-react';
import {
  type OutletPrTier,
  type OutletTierRateSettings,
} from '@agency-portal/lib/agency-demo';
import {
  applyPayTierRowChange,
  ensureAllPayTierRows,
  isCommissionOnlyPayTier,
  isServantPayTier,
  outletTierForPostJobPayTier,
  payTierDisplayOrder,
  postJobPayTierLabel,
  totalPrCountFromPayTierRows,
  type PostJobPayTierId,
  type PostJobPayTierRow,
  clampPayTierRowsToMax,
  type CommissionOnlyRateSettings,
} from '@agency-portal/lib/post-job-pay-tiers';
import { cn } from '@agency-portal/lib/utils';
import {
  TierCountStepper,
  TierMoneyInput,
  TierPayInput,
  TierPctStepper,
} from '@agency-portal/components/outlet/tier-rates-table-ui';

const TIER_COLUMN_ICONS = [Star, Medal, Award, Award, Crown] as const;

function tierColumnIcon(payTierId: PostJobPayTierId) {
  if (isCommissionOnlyPayTier(payTierId)) return Percent;
  if (isServantPayTier(payTierId)) return UserRound;
  const rank = payTierDisplayOrder(payTierId);
  return TIER_COLUMN_ICONS[rank] ?? Star;
}

function tierColumnIconClass(payTierId: PostJobPayTierId): string {
  if (isCommissionOnlyPayTier(payTierId))
    return 'iz-post-job-tier-col-head__icon--commission';
  if (isServantPayTier(payTierId))
    return 'iz-post-job-tier-col-head__icon--servant';
  const rank = payTierDisplayOrder(payTierId);
  return `iz-post-job-tier-col-head__icon--${Math.min(rank + 1, 5)}`;
}

function formatCommissionHint(row: PostJobPayTierRow): string {
  if (isCommissionOnlyPayTier(row.payTierId)) return '+ drinks & tips';
  const parts: string[] = [];
  if (row.drinkPct > 0) parts.push('drinks');
  if (row.tipPct > 0) parts.push('tips');
  if (parts.length === 0) return '—';
  if (parts.length === 1) return `+ ${parts[0]}`;
  return `+ ${parts.join(' & ')}`;
}

export function PostJobTierRatesEditor({
  rows,
  workspaceTierRates,
  commissionOnlyRates,
  maxPrTotal,
  onChange,
  planHint,
}: {
  rows: PostJobPayTierRow[];
  workspaceTierRates: Record<OutletPrTier, OutletTierRateSettings>;
  commissionOnlyRates?: CommissionOnlyRateSettings;
  /** Max total PRs across all tier rows (people needed). */
  maxPrTotal?: number;
  onChange: (rows: PostJobPayTierRow[]) => void;
  planHint?: ReactNode;
}) {
  const allRows = ensureAllPayTierRows(
    rows,
    workspaceTierRates,
    commissionOnlyRates,
  );
  const allocatedTotal = totalPrCountFromPayTierRows(allRows);
  const [commissionExpanded, setCommissionExpanded] = useState(() =>
    allRows.some((row) => row.drinkPct > 0 || row.tipPct > 0),
  );

  const patchRow = (id: string, patch: Partial<PostJobPayTierRow>) => {
    let nextRows = allRows.map((row) =>
      row.id === id
        ? applyPayTierRowChange(
            row,
            patch,
            workspaceTierRates,
            commissionOnlyRates,
          )
        : row,
    );
    if (maxPrTotal != null && patch.prCount != null) {
      nextRows = clampPayTierRowsToMax(nextRows, maxPrTotal, id);
    }
    onChange(nextRows);
  };

  const rowLabels = commissionExpanded
    ? (['Wages', 'Drinks', 'Tips', 'Target', 'PR count'] as const)
    : (['Wages', 'Commission', 'Target', 'PR count'] as const);

  const commissionRowIndex = 1;
  const drinksRowIndex = 1;
  const tipsRowIndex = 2;
  const targetRowIndex = commissionExpanded ? 3 : 2;
  const prCountRowIndex = commissionExpanded ? 4 : 3;

  return (
    <div className="space-y-2">
      {maxPrTotal != null && maxPrTotal > 0 && (
        <p className="text-[10px] text-[var(--iz-muted)]">
          {allocatedTotal} of {maxPrTotal} PR{maxPrTotal === 1 ? '' : 's'}{' '}
          allocated across tiers
        </p>
      )}
      <div className="-mx-1 overflow-x-auto pb-1">
        <div className="min-w-[520px] px-1">
          <div
            className="iz-post-job-tier-grid"
            style={{
              gridTemplateColumns: `minmax(4.5rem, 5.5rem) repeat(${allRows.length}, minmax(0, 1fr))`,
            }}
          >
            <div className="iz-post-job-tier-grid__corner" aria-hidden />
            {allRows.map((row) => {
              const Icon = tierColumnIcon(row.payTierId);
              const tierLabel =
                outletTierForPostJobPayTier(row.payTierId) ??
                postJobPayTierLabel(row.payTierId);

              return (
                <div
                  key={`head-${row.id}`}
                  className="iz-post-job-tier-col-head"
                >
                  <span
                    className={cn(
                      'iz-post-job-tier-col-head__icon',
                      tierColumnIconClass(row.payTierId),
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="iz-post-job-tier-col-head__label">
                    {tierLabel}
                  </div>
                </div>
              );
            })}

            {rowLabels.map((label, labelIndex) => (
              <div key={label} className="contents">
                <div className="iz-post-job-tier-grid__row-label">{label}</div>
                {allRows.map((row) => {
                  const commissionOnly = isCommissionOnlyPayTier(row.payTierId);
                  const allocatedOthers = allRows
                    .filter((r) => r.id !== row.id)
                    .reduce((sum, r) => sum + r.prCount, 0);
                  const rowMax =
                    maxPrTotal != null
                      ? Math.max(0, maxPrTotal - allocatedOthers)
                      : undefined;

                  if (labelIndex === 0) {
                    return (
                      <div
                        key={`${row.id}-pay`}
                        className="iz-post-job-tier-pay-cell"
                        title="Tap to edit wages"
                      >
                        {commissionOnly ? (
                          <span className="text-xs font-medium text-[var(--iz-muted)]">
                            No base
                          </span>
                        ) : (
                          <>
                            <span className="text-[10px] font-semibold text-[var(--iz-muted)]">
                              RM
                            </span>
                            <TierPayInput
                              value={row.wagePerHour}
                              onChange={(wagePerHour) =>
                                patchRow(row.id, { wagePerHour })
                              }
                            />
                          </>
                        )}
                      </div>
                    );
                  }

                  if (
                    labelIndex === commissionRowIndex &&
                    !commissionExpanded
                  ) {
                    const hint = formatCommissionHint(row);
                    return (
                      <button
                        key={`${row.id}-comm`}
                        type="button"
                        className={cn(
                          'iz-post-job-tier-comm-cell iz-post-job-tier-comm-cell--btn',
                          hint === '—' && 'iz-post-job-tier-comm-cell--none',
                        )}
                        onClick={() => setCommissionExpanded(true)}
                        title="Tap to edit drinks and tips commission"
                      >
                        {hint}
                      </button>
                    );
                  }

                  if (commissionExpanded && labelIndex === drinksRowIndex) {
                    return (
                      <div
                        key={`${row.id}-drinks`}
                        className="iz-post-job-tier-comm-edit-cell"
                        title="Tap to edit drinks commission"
                      >
                        <span className="text-[9px] font-semibold text-[var(--iz-muted)]">
                          Dr
                        </span>
                        <TierPctStepper
                          value={row.drinkPct}
                          onChange={(drinkPct) =>
                            patchRow(row.id, { drinkPct })
                          }
                        />
                      </div>
                    );
                  }

                  if (commissionExpanded && labelIndex === tipsRowIndex) {
                    return (
                      <div
                        key={`${row.id}-tips`}
                        className="iz-post-job-tier-comm-edit-cell"
                        title="Tap to edit tips commission"
                      >
                        <span className="text-[9px] font-semibold text-[var(--iz-muted)]">
                          Tip
                        </span>
                        <TierPctStepper
                          value={row.tipPct}
                          onChange={(tipPct) => patchRow(row.id, { tipPct })}
                        />
                      </div>
                    );
                  }

                  if (labelIndex === targetRowIndex) {
                    return (
                      <div
                        key={`${row.id}-target`}
                        className="iz-post-job-tier-pay-cell"
                        title="Tap to set target sales (optional)"
                      >
                        <span className="text-[10px] font-semibold text-[var(--iz-muted)]">
                          RM
                        </span>
                        <TierMoneyInput
                          value={row.targetSalesRm}
                          placeholder="Optional"
                          onChange={(targetSalesRm) =>
                            patchRow(row.id, { targetSalesRm })
                          }
                        />
                      </div>
                    );
                  }

                  if (labelIndex === prCountRowIndex) {
                    return (
                      <div
                        key={`${row.id}-count`}
                        className="iz-post-job-tier-count-cell"
                      >
                        <TierCountStepper
                          value={row.prCount}
                          onChange={(prCount) => patchRow(row.id, { prCount })}
                          max={rowMax}
                          disabled={maxPrTotal === 0}
                        />
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {planHint && <p className="iz-post-job-tier-plan-hint">{planHint}</p>}
    </div>
  );
}
