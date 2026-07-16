import {
  OUTLET_BASE_TIER,
  OUTLET_PR_TIERS,
  tierBaseRmPerHour,
  tierHappyHourDrinkPct,
  tierOtRmPerHour,
  type OutletPrTier,
  type OutletTierRateSettings,
} from '@agency-portal/lib/agency-demo';

import {
  postJobPayTierIdForOutletTier,
  postJobPayTierLabelForOutletTier,
  type CommissionOnlyRateSettings,
  type PostJobPayTierId,
  type ShiftTierStaffing,
} from '@agency-portal/lib/post-job-pay-tiers';

import { cn } from '@agency-portal/lib/utils';

import {
  fieldShell,
  TIER_TABLE_GRID_BASE,
  TIER_TABLE_GRID_COLS,
  TIER_TABLE_GRID_COLS_RATES_ONLY,
  TIER_TABLE_GRID_COLS_WITH_STAFFING,
  TIER_TABLE_GRID_COLS_WITH_STAFFING_RATES_ONLY,
  TIER_TABLE_GRID_COLS_WORKSPACE,
  TIER_TABLE_GRID_COLS_WORKSPACE_RATES_ONLY,
  tierTableCell,
  tierTableEditableCell,
  tierTableHeadCell,
  tierTableReadonlyCell,
  TierHoursInput,
  TierMoneyInput,
  TierPayInput,
  TierPctInput,
  TierRatesTableLegend,
  TierRmHrReadonly,
} from '@agency-portal/components/outlet/tier-rates-table-ui';

function tierPctCell(
  readOnly: boolean | undefined,

  value: number,

  onChange: (n: number) => void,

  title: string,
) {
  return (
    <div
      className={
        readOnly
          ? tierTableCell('justify-center bg-black/15 text-[var(--iz-muted)]')
          : tierTableEditableCell('justify-center')
      }
      title={readOnly ? undefined : title}
    >
      <div className={fieldShell('justify-center', true)}>
        <TierPctInput value={value} disabled={readOnly} onChange={onChange} />

        <span className="text-[9px] text-[var(--iz-muted)]">%</span>
      </div>
    </div>
  );
}

export function WorkspaceTierRatesEditor({
  tierRates,

  commissionOnlyRates,

  onPatchTier,

  onPatchCommissionOnly,

  readOnly,

  tierStaffingByPayTier,

  hideTargetSales,
}: {
  tierRates: Record<OutletPrTier, OutletTierRateSettings>;

  commissionOnlyRates: CommissionOnlyRateSettings;

  onPatchTier: (
    tier: OutletPrTier,
    patch: Partial<OutletTierRateSettings>,
  ) => void;

  onPatchCommissionOnly: (patch: Partial<CommissionOnlyRateSettings>) => void;

  readOnly?: boolean;

  /** When set, replaces OT-after column with requested / supplied per tier. */

  tierStaffingByPayTier?: Partial<Record<PostJobPayTierId, ShiftTierStaffing>>;

  /** Outlet/agency rate card — pay & commission only; targets are set per shift in post job. */

  hideTargetSales?: boolean;
}) {
  const defaultOtAfterHours = tierRates[OUTLET_BASE_TIER]?.otAfterHours ?? 6;

  const showTierStaffing = tierStaffingByPayTier != null;

  const useWorkspaceLayout = !showTierStaffing;

  const gridCols = useWorkspaceLayout
    ? hideTargetSales
      ? TIER_TABLE_GRID_COLS_WORKSPACE_RATES_ONLY
      : TIER_TABLE_GRID_COLS_WORKSPACE
    : hideTargetSales
      ? TIER_TABLE_GRID_COLS_WITH_STAFFING_RATES_ONLY
      : TIER_TABLE_GRID_COLS_WITH_STAFFING;

  const staffingCell = (
    payTierId: PostJobPayTierId,
    kind: 'demand' | 'supplied',
  ) => {
    const staffing = tierStaffingByPayTier?.[payTierId];

    const value =
      kind === 'demand' ? (staffing?.demand ?? 0) : (staffing?.supplied ?? 0);

    return (
      <div
        className={tierTableCell(
          cn(
            'justify-center tabular-nums bg-black/15',

            kind === 'supplied'
              ? 'text-[var(--iz-green)]'
              : 'text-[var(--iz-muted)]',
          ),
        )}
      >
        <span className="text-xs font-medium">{value}</span>
      </div>
    );
  };

  const workspaceHeader = (
    <>
      <div className={tierTableHeadCell(undefined, true)}>Tier</div>

      <div className={tierTableHeadCell(undefined, true)}>Daily wages</div>

      <div className={tierTableHeadCell('text-center')}>RM/HR</div>

      {!hideTargetSales && (
        <div className={tierTableHeadCell(undefined, true)}>Target sales</div>
      )}

      <div className={tierTableHeadCell('text-center leading-tight', true)}>
        HH Drinks
      </div>

      <div className={tierTableHeadCell('text-center leading-tight', true)}>
        NH Drinks
      </div>

      <div className={tierTableHeadCell('text-center', true)}>Tips</div>

      <div className={tierTableHeadCell('text-center')}>OT/HR</div>
    </>
  );

  const legacyHeader = (
    <>
      <div className={tierTableHeadCell(undefined, true)}>Tier</div>

      <div className={tierTableHeadCell(undefined, true)}>Daily wages</div>

      {!hideTargetSales && (
        <div className={tierTableHeadCell(undefined, true)}>Target sales</div>
      )}

      <div className={tierTableHeadCell(undefined, true)}>Drinks & tips</div>

      {showTierStaffing ? (
        <>
          <div className={tierTableHeadCell('text-center', true)}>
            Requested
          </div>

          <div className={tierTableHeadCell('text-center', true)}>Supplied</div>
        </>
      ) : (
        <div className={tierTableHeadCell('text-center', true)}>OT after</div>
      )}
    </>
  );

  const workspaceTierRow = (tier: OutletPrTier) => {
    const rates = tierRates[tier];

    const otAfterHours = rates.otAfterHours ?? defaultOtAfterHours;

    const hourlyRule = { wagePerHour: rates.wagePerHour, otAfterHours };

    return (
      <>
        <div className={tierTableCell()} title={tier}>
          <span className="text-xs font-semibold text-[var(--iz-txt)]">
            {postJobPayTierLabelForOutletTier(tier)}
          </span>
        </div>

        <div
          className={
            readOnly
              ? tierTableCell('bg-black/15 text-[var(--iz-muted)]')
              : tierTableEditableCell()
          }
          title={readOnly ? undefined : 'Tap to edit pay per shift'}
        >
          <div className={fieldShell(undefined, true)}>
            <span className="text-[11px] font-semibold text-[var(--iz-muted)]">
              RM
            </span>

            <TierPayInput
              value={rates.wagePerHour}
              disabled={readOnly}
              onChange={(wagePerHour) => onPatchTier(tier, { wagePerHour })}
            />
          </div>
        </div>

        <div
          className={tierTableReadonlyCell('justify-center')}
          title="Derived from daily wages ÷ standard hours"
        >
          <TierRmHrReadonly amount={tierBaseRmPerHour(hourlyRule)} />
        </div>

        {!hideTargetSales && (
          <div
            className={
              readOnly
                ? tierTableCell('bg-black/15 text-[var(--iz-muted)]')
                : tierTableEditableCell()
            }
            title={readOnly ? undefined : 'Tap to set target sales (optional)'}
          >
            <div className={fieldShell(undefined, true)}>
              <span className="text-[11px] font-semibold text-[var(--iz-muted)]">
                RM
              </span>

              <TierMoneyInput
                value={rates.targetSalesRm}
                placeholder="Optional"
                disabled={readOnly}
                onChange={(targetSalesRm) =>
                  onPatchTier(tier, { targetSalesRm })
                }
              />
            </div>
          </div>
        )}

        {tierPctCell(
          readOnly,

          tierHappyHourDrinkPct(rates),

          (happyHourDrinkPct) => onPatchTier(tier, { happyHourDrinkPct }),

          'Tap to edit happy-hour drink commission',
        )}

        {tierPctCell(
          readOnly,

          rates.drinkPct,

          (drinkPct) => onPatchTier(tier, { drinkPct }),

          'Tap to edit normal-hours drink commission',
        )}

        {tierPctCell(
          readOnly,

          rates.tipPct,

          (tipPct) => onPatchTier(tier, { tipPct }),

          'Tap to edit tips commission',
        )}

        <div
          className={tierTableReadonlyCell('justify-center')}
          title="OT hourly rate (1.5× RM/HR)"
        >
          <TierRmHrReadonly amount={tierOtRmPerHour(hourlyRule)} />
        </div>
      </>
    );
  };

  const legacyTierRow = (tier: OutletPrTier) => {
    const rates = tierRates[tier];

    return (
      <>
        <div className={tierTableCell()} title={tier}>
          <span className="text-xs font-semibold text-[var(--iz-txt)]">
            {postJobPayTierLabelForOutletTier(tier)}
          </span>
        </div>

        <div
          className={
            readOnly
              ? tierTableCell('bg-black/15 text-[var(--iz-muted)]')
              : tierTableEditableCell()
          }
          title={readOnly ? undefined : 'Tap to edit pay per shift'}
        >
          <div className={fieldShell(undefined, true)}>
            <span className="text-[11px] font-semibold text-[var(--iz-muted)]">
              RM
            </span>

            <TierPayInput
              value={rates.wagePerHour}
              disabled={readOnly}
              onChange={(wagePerHour) => onPatchTier(tier, { wagePerHour })}
            />
          </div>
        </div>

        {!hideTargetSales && (
          <div
            className={
              readOnly
                ? tierTableCell('bg-black/15 text-[var(--iz-muted)]')
                : tierTableEditableCell()
            }
            title={readOnly ? undefined : 'Tap to set target sales (optional)'}
          >
            <div className={fieldShell(undefined, true)}>
              <span className="text-[11px] font-semibold text-[var(--iz-muted)]">
                RM
              </span>

              <TierMoneyInput
                value={rates.targetSalesRm}
                placeholder="Optional"
                disabled={readOnly}
                onChange={(targetSalesRm) =>
                  onPatchTier(tier, { targetSalesRm })
                }
              />
            </div>
          </div>
        )}

        <div
          className={
            readOnly
              ? tierTableCell('bg-black/15 text-[var(--iz-muted)]')
              : tierTableEditableCell()
          }
          title={
            readOnly ? undefined : 'Tap to edit drinks and tips commission'
          }
        >
          <div className={cn(fieldShell('w-full justify-between', true))}>
            <div className="flex min-w-0 items-center gap-0.5">
              <span className="text-[9px] text-[var(--iz-muted)]">Dr</span>

              <TierPctInput
                value={rates.drinkPct}
                disabled={readOnly}
                onChange={(drinkPct) => onPatchTier(tier, { drinkPct })}
              />

              <span className="text-[9px] text-[var(--iz-muted)]">%</span>
            </div>

            <div className="flex min-w-0 items-center gap-0.5">
              <span className="text-[9px] text-[var(--iz-muted)]">Tip</span>

              <TierPctInput
                value={rates.tipPct}
                disabled={readOnly}
                onChange={(tipPct) => onPatchTier(tier, { tipPct })}
              />

              <span className="text-[9px] text-[var(--iz-muted)]">%</span>
            </div>
          </div>
        </div>

        {showTierStaffing ? (
          <>
            {staffingCell(postJobPayTierIdForOutletTier(tier), 'demand')}

            {staffingCell(postJobPayTierIdForOutletTier(tier), 'supplied')}
          </>
        ) : (
          <div
            className={
              readOnly
                ? tierTableCell(
                    'justify-center bg-black/15 text-[var(--iz-muted)]',
                  )
                : tierTableEditableCell('justify-center')
            }
            title={readOnly ? undefined : 'Tap to edit OT threshold'}
          >
            <div className="flex items-center justify-center gap-0.5">
              <TierHoursInput
                value={rates.otAfterHours ?? defaultOtAfterHours}
                disabled={readOnly}
                compact
                onChange={(otAfterHours) => onPatchTier(tier, { otAfterHours })}
              />

              <span className="text-[9px] text-[var(--iz-muted)]">hrs</span>
            </div>
          </div>
        )}
      </>
    );
  };

  const workspaceCommissionRow = (
    <>
      <div className={tierTableCell()} title="Commission only">
        <span className="text-xs font-semibold text-[var(--iz-txt)]">
          Commission only
        </span>
      </div>

      <div
        className={tierTableReadonlyCell()}
        title="Commission only — RM 0 shift pay"
      >
        <div className={fieldShell(undefined, true)}>
          <span className="text-[11px] font-semibold text-[var(--iz-muted)]">
            RM
          </span>
          <span className="text-sm font-semibold tabular-nums text-[var(--iz-txt)]">
            0
          </span>
        </div>
      </div>

      <div className={tierTableReadonlyCell('justify-center')}>
        <span className="text-xs text-[var(--iz-muted)]">—</span>
      </div>

      {!hideTargetSales && (
        <div
          className={
            readOnly
              ? tierTableCell('bg-black/15 text-[var(--iz-muted)]')
              : tierTableEditableCell()
          }
          title={readOnly ? undefined : 'Tap to set target sales (optional)'}
        >
          <div className={fieldShell(undefined, true)}>
            <span className="text-[11px] font-semibold text-[var(--iz-muted)]">
              RM
            </span>

            <TierMoneyInput
              value={commissionOnlyRates.targetSalesRm}
              placeholder="Optional"
              disabled={readOnly}
              onChange={(targetSalesRm) =>
                onPatchCommissionOnly({ targetSalesRm })
              }
            />
          </div>
        </div>
      )}

      {tierPctCell(
        readOnly,

        tierHappyHourDrinkPct(commissionOnlyRates),

        (happyHourDrinkPct) => onPatchCommissionOnly({ happyHourDrinkPct }),

        'Tap to edit happy-hour drink commission',
      )}

      {tierPctCell(
        readOnly,

        commissionOnlyRates.drinkPct,

        (drinkPct) => onPatchCommissionOnly({ drinkPct }),

        'Tap to edit normal-hours drink commission',
      )}

      {tierPctCell(
        readOnly,

        commissionOnlyRates.tipPct,

        (tipPct) => onPatchCommissionOnly({ tipPct }),

        'Tap to edit tips commission',
      )}

      <div
        className={tierTableReadonlyCell('justify-center')}
        title="Not applicable"
      >
        <span className="text-xs text-[var(--iz-muted)]">—</span>
      </div>
    </>
  );

  const legacyCommissionRow = (
    <>
      <div className={tierTableCell()} title="Commission only">
        <span className="text-xs font-semibold text-[var(--iz-txt)]">
          Commission only
        </span>
      </div>

      <div
        className={tierTableReadonlyCell()}
        title="Commission only — RM 0 shift pay"
      >
        <div className={fieldShell(undefined, true)}>
          <span className="text-[11px] font-semibold text-[var(--iz-muted)]">
            RM
          </span>
          <span className="text-sm font-semibold tabular-nums text-[var(--iz-txt)]">
            0
          </span>
        </div>
      </div>

      {!hideTargetSales && (
        <div
          className={
            readOnly
              ? tierTableCell('bg-black/15 text-[var(--iz-muted)]')
              : tierTableEditableCell()
          }
          title={readOnly ? undefined : 'Tap to set target sales (optional)'}
        >
          <div className={fieldShell(undefined, true)}>
            <span className="text-[11px] font-semibold text-[var(--iz-muted)]">
              RM
            </span>

            <TierMoneyInput
              value={commissionOnlyRates.targetSalesRm}
              placeholder="Optional"
              disabled={readOnly}
              onChange={(targetSalesRm) =>
                onPatchCommissionOnly({ targetSalesRm })
              }
            />
          </div>
        </div>
      )}

      <div
        className={
          readOnly
            ? tierTableCell('bg-black/15 text-[var(--iz-muted)]')
            : tierTableEditableCell()
        }
        title={readOnly ? undefined : 'Tap to edit drinks and tips commission'}
      >
        <div className={cn(fieldShell('w-full justify-between', true))}>
          <div className="flex min-w-0 items-center gap-0.5">
            <span className="text-[9px] text-[var(--iz-muted)]">Dr</span>

            <TierPctInput
              value={commissionOnlyRates.drinkPct}
              disabled={readOnly}
              onChange={(drinkPct) => onPatchCommissionOnly({ drinkPct })}
            />

            <span className="text-[9px] text-[var(--iz-muted)]">%</span>
          </div>

          <div className="flex min-w-0 items-center gap-0.5">
            <span className="text-[9px] text-[var(--iz-muted)]">Tip</span>

            <TierPctInput
              value={commissionOnlyRates.tipPct}
              disabled={readOnly}
              onChange={(tipPct) => onPatchCommissionOnly({ tipPct })}
            />

            <span className="text-[9px] text-[var(--iz-muted)]">%</span>
          </div>
        </div>
      </div>

      {showTierStaffing ? (
        <>
          {staffingCell('commission_only', 'demand')}

          {staffingCell('commission_only', 'supplied')}
        </>
      ) : (
        <div
          className={tierTableReadonlyCell('justify-center')}
          title="Not applicable"
        >
          <span className="text-xs text-[var(--iz-muted)]">—</span>
        </div>
      )}
    </>
  );

  return (
    <div className="-mx-1 overflow-x-auto pb-1">
      <div
        className={cn(
          'px-1',

          useWorkspaceLayout
            ? hideTargetSales
              ? 'min-w-[900px]'
              : 'min-w-[1020px]'
            : showTierStaffing
              ? 'min-w-[720px]'
              : hideTargetSales
                ? 'min-w-[520px]'
                : 'min-w-[680px]',
        )}
      >
        <div className="overflow-hidden rounded-xl border border-[var(--iz-line)]">
          <div
            className={cn(
              TIER_TABLE_GRID_BASE,

              gridCols,

              'border-b border-[var(--iz-line)] bg-[rgba(255,255,255,0.03)]',
            )}
          >
            {useWorkspaceLayout ? workspaceHeader : legacyHeader}
          </div>

          {OUTLET_PR_TIERS.map((tier) => (
            <div
              key={tier}
              className={cn(
                TIER_TABLE_GRID_BASE,
                gridCols,
                'border-b border-[var(--iz-line)]',
              )}
            >
              {useWorkspaceLayout
                ? workspaceTierRow(tier)
                : legacyTierRow(tier)}
            </div>
          ))}

          <div className={cn(TIER_TABLE_GRID_BASE, gridCols)}>
            {useWorkspaceLayout ? workspaceCommissionRow : legacyCommissionRow}
          </div>

          {!readOnly && <TierRatesTableLegend />}
        </div>
      </div>
    </div>
  );
}
