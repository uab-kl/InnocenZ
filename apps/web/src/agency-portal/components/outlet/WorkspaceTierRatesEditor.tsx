import {
	fieldShell,
	TIER_TABLE_GRID_BASE,
	TIER_TABLE_GRID_COLS,
	TIER_TABLE_GRID_COLS_RATES_ONLY,
	TIER_TABLE_GRID_COLS_WITH_STAFFING,
	TIER_TABLE_GRID_COLS_WITH_STAFFING_RATES_ONLY,
	TIER_TABLE_GRID_COLS_WORKSPACE,
	TIER_TABLE_GRID_COLS_WORKSPACE_RATES_ONLY,
	TierHoursInput,
	TierMoneyInput,
	TierPayInput,
	TierPctInput,
	TierRatesTableLegend,
	TierRmHrReadonly,
	tierTableCell,
	tierTableEditableCell,
	tierTableHeadCell,
	tierTableReadonlyCell,
} from "@agency-portal/components/outlet/tier-rates-table-ui";
import {
	OUTLET_BASE_TIER,
	OUTLET_PR_TIERS,
	type OutletPrTier,
	type OutletTierRateSettings,
	resolveStandardShiftHours,
	tierBaseRmPerHour,
	tierHappyHourDrinkPct,
	tierOtRmPerHour,
} from "@agency-portal/lib/agency-demo";
import {
	type CommissionOnlyRateSettings,
	type PostJobPayTierId,
	postJobPayTierIdForOutletTier,
	postJobPayTierLabelForOutletTier,
	type ShiftTierStaffing,
} from "@agency-portal/lib/post-job-pay-tiers";
import { cn } from "@agency-portal/lib/utils";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { tierLabel } from "@/lib/portal-i18n/language-label";

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
					? tierTableCell("justify-center bg-black/15 text-[var(--iz-muted)]")
					: tierTableEditableCell("justify-center")
			}
			title={readOnly ? undefined : title}
		>
			<div className={fieldShell("justify-center", true)}>
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
	const { t } = usePortalLocale();
	const defaultOtAfterHours = resolveStandardShiftHours(
		tierRates[OUTLET_BASE_TIER]?.otAfterHours,
	);

	/**
	 * The standard shift length the derived RM/HR and OT/HR columns are worked
	 * out over, for the legend.
	 *
	 * Read from EVERY tier rather than the base one: `otAfterHours` is per-tier,
	 * so captioning the whole table from the base tier would announce "a 6-hour
	 * standard shift" over a ladder where Servant had been set to 4. Null when
	 * they disagree, which makes the legend state the rule without claiming one
	 * number for all of them. Cheap enough to run each render — seven tiers.
	 */
	const legendStandardShiftHours = (() => {
		const distinct = new Set(
			OUTLET_PR_TIERS.map((tier) =>
				resolveStandardShiftHours(tierRates[tier]?.otAfterHours),
			),
		);
		return distinct.size === 1 ? [...distinct][0] : null;
	})();

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
		kind: "demand" | "supplied",
	) => {
		const staffing = tierStaffingByPayTier?.[payTierId];

		const value =
			kind === "demand" ? (staffing?.demand ?? 0) : (staffing?.supplied ?? 0);

		return (
			<div
				className={tierTableCell(
					cn(
						"justify-center tabular-nums bg-black/15",

						kind === "supplied"
							? "text-[var(--iz-green)]"
							: "text-[var(--iz-muted)]",
					),
				)}
			>
				<span className="text-xs font-medium">{value}</span>
			</div>
		);
	};

	const workspaceHeader = (
		<>
			<div className={tierTableHeadCell(undefined, true)}>
				{t.outletDetail.colTier}
			</div>

			<div className={tierTableHeadCell(undefined, true)}>
				{t.outletDetail.colDailyWages}
			</div>

			<div className={tierTableHeadCell("text-center")}>
				{t.outletDetail.colRmHr}
			</div>

			{!hideTargetSales && (
				<div className={tierTableHeadCell(undefined, true)}>
					{t.outletDetail.colTargetSales}
				</div>
			)}

			<div className={tierTableHeadCell("text-center leading-tight", true)}>
				{t.outletDetail.colHhDrinks}
			</div>

			<div className={tierTableHeadCell("text-center leading-tight", true)}>
				{t.outletDetail.colNhDrinks}
			</div>

			<div className={tierTableHeadCell("text-center", true)}>
				{t.outletDetail.colTips}
			</div>

			<div className={tierTableHeadCell("text-center")}>
				{t.outletDetail.colOtHr}
			</div>
		</>
	);

	const legacyHeader = (
		<>
			<div className={tierTableHeadCell(undefined, true)}>
				{t.outletDetail.colTier}
			</div>

			<div className={tierTableHeadCell(undefined, true)}>
				{t.outletDetail.colDailyWages}
			</div>

			{!hideTargetSales && (
				<div className={tierTableHeadCell(undefined, true)}>
					{t.outletDetail.colTargetSales}
				</div>
			)}

			<div className={tierTableHeadCell(undefined, true)}>
				{t.workspace.legacyDrinksTips}
			</div>

			{showTierStaffing ? (
				<>
					<div className={tierTableHeadCell("text-center", true)}>
						{t.workspace.legacyRequested}
					</div>

					<div className={tierTableHeadCell("text-center", true)}>
						{t.workspace.legacySupplied}
					</div>
				</>
			) : (
				<div className={tierTableHeadCell("text-center", true)}>
					{t.workspace.legacyOtAfter}
				</div>
			)}
		</>
	);

	const workspaceTierRow = (tier: OutletPrTier) => {
		const rates = tierRates[tier];

		const otAfterHours = resolveStandardShiftHours(
			rates.otAfterHours ?? defaultOtAfterHours,
		);

		const hourlyRule = { wagePerHour: rates.wagePerHour, otAfterHours };

		return (
			<>
				<div
					className={tierTableCell()}
					title={tierLabel(postJobPayTierLabelForOutletTier(tier), t)}
				>
					<span className="text-xs font-semibold text-[var(--iz-txt)]">
						{tierLabel(postJobPayTierLabelForOutletTier(tier), t)}
					</span>
				</div>

				<div
					className={
						readOnly
							? tierTableCell("bg-black/15 text-[var(--iz-muted)]")
							: tierTableEditableCell()
					}
					title={readOnly ? undefined : t.workspace.tapEditDailyPay}
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
					className={tierTableReadonlyCell("justify-center")}
					title={fill(t.outletDetail.derivedFromDailyWages, {
						hours: otAfterHours,
					})}
				>
					<TierRmHrReadonly amount={tierBaseRmPerHour(hourlyRule)} />
				</div>

				{!hideTargetSales && (
					<div
						className={
							readOnly
								? tierTableCell("bg-black/15 text-[var(--iz-muted)]")
								: tierTableEditableCell()
						}
						title={readOnly ? undefined : t.workspace.tapSetTargetSales}
					>
						<div className={fieldShell(undefined, true)}>
							<span className="text-[11px] font-semibold text-[var(--iz-muted)]">
								RM
							</span>

							<TierMoneyInput
								value={rates.targetSalesRm}
								placeholder={t.workspace.optional}
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

					t.workspace.tapEditHappyHourCommission,
				)}

				{tierPctCell(
					readOnly,

					rates.drinkPct,

					(drinkPct) => onPatchTier(tier, { drinkPct }),

					t.workspace.tapEditNormalHoursCommission,
				)}

				{tierPctCell(
					readOnly,

					rates.tipPct,

					(tipPct) => onPatchTier(tier, { tipPct }),

					t.workspace.tapEditTipsCommission,
				)}

				<div
					className={tierTableReadonlyCell("justify-center")}
					title={t.outletDetail.otHourlyRate}
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
				<div
					className={tierTableCell()}
					title={tierLabel(postJobPayTierLabelForOutletTier(tier), t)}
				>
					<span className="text-xs font-semibold text-[var(--iz-txt)]">
						{tierLabel(postJobPayTierLabelForOutletTier(tier), t)}
					</span>
				</div>

				<div
					className={
						readOnly
							? tierTableCell("bg-black/15 text-[var(--iz-muted)]")
							: tierTableEditableCell()
					}
					title={readOnly ? undefined : t.workspace.tapEditPayPerShift}
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
								? tierTableCell("bg-black/15 text-[var(--iz-muted)]")
								: tierTableEditableCell()
						}
						title={readOnly ? undefined : t.workspace.tapSetTargetSales}
					>
						<div className={fieldShell(undefined, true)}>
							<span className="text-[11px] font-semibold text-[var(--iz-muted)]">
								RM
							</span>

							<TierMoneyInput
								value={rates.targetSalesRm}
								placeholder={t.workspace.optional}
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
							? tierTableCell("bg-black/15 text-[var(--iz-muted)]")
							: tierTableEditableCell()
					}
					title={readOnly ? undefined : t.workspace.tapEditDrinksTipsCommission}
				>
					<div className={cn(fieldShell("w-full justify-between", true))}>
						<div className="flex min-w-0 items-center gap-0.5">
							<span className="text-[9px] text-[var(--iz-muted)]">
								{t.workspace.legacyDr}
							</span>

							<TierPctInput
								value={rates.drinkPct}
								disabled={readOnly}
								onChange={(drinkPct) => onPatchTier(tier, { drinkPct })}
							/>

							<span className="text-[9px] text-[var(--iz-muted)]">%</span>
						</div>

						<div className="flex min-w-0 items-center gap-0.5">
							<span className="text-[9px] text-[var(--iz-muted)]">
								{t.workspace.legacyTip}
							</span>

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
						{staffingCell(postJobPayTierIdForOutletTier(tier), "demand")}

						{staffingCell(postJobPayTierIdForOutletTier(tier), "supplied")}
					</>
				) : (
					<div
						className={
							readOnly
								? tierTableCell(
										"justify-center bg-black/15 text-[var(--iz-muted)]",
									)
								: tierTableEditableCell("justify-center")
						}
						title={readOnly ? undefined : t.workspace.tapEditOtThreshold}
					>
						<div className="flex items-center justify-center gap-0.5">
							<TierHoursInput
								value={rates.otAfterHours ?? defaultOtAfterHours}
								disabled={readOnly}
								compact
								onChange={(otAfterHours) => onPatchTier(tier, { otAfterHours })}
							/>

							<span className="text-[9px] text-[var(--iz-muted)]">
								{t.workspace.legacyHrs}
							</span>
						</div>
					</div>
				)}
			</>
		);
	};

	const workspaceCommissionRow = (
		<>
			<div className={tierTableCell()} title={t.outletDetail.commissionOnly}>
				<span className="text-xs font-semibold text-[var(--iz-txt)]">
					{t.outletDetail.commissionOnly}
				</span>
			</div>

			<div
				className={tierTableReadonlyCell()}
				title={t.outletDetail.commissionOnlyRm0}
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

			<div className={tierTableReadonlyCell("justify-center")}>
				<span className="text-xs text-[var(--iz-muted)]">—</span>
			</div>

			{!hideTargetSales && (
				<div
					className={
						readOnly
							? tierTableCell("bg-black/15 text-[var(--iz-muted)]")
							: tierTableEditableCell()
					}
					title={readOnly ? undefined : t.workspace.tapSetTargetSales}
				>
					<div className={fieldShell(undefined, true)}>
						<span className="text-[11px] font-semibold text-[var(--iz-muted)]">
							RM
						</span>

						<TierMoneyInput
							value={commissionOnlyRates.targetSalesRm}
							placeholder={t.workspace.optional}
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

				t.workspace.tapEditHappyHourCommission,
			)}

			{tierPctCell(
				readOnly,

				commissionOnlyRates.drinkPct,

				(drinkPct) => onPatchCommissionOnly({ drinkPct }),

				t.workspace.tapEditNormalHoursCommission,
			)}

			{tierPctCell(
				readOnly,

				commissionOnlyRates.tipPct,

				(tipPct) => onPatchCommissionOnly({ tipPct }),

				t.workspace.tapEditTipsCommission,
			)}

			<div
				className={tierTableReadonlyCell("justify-center")}
				title={t.outletDetail.notApplicable}
			>
				<span className="text-xs text-[var(--iz-muted)]">—</span>
			</div>
		</>
	);

	const legacyCommissionRow = (
		<>
			<div className={tierTableCell()} title={t.outletDetail.commissionOnly}>
				<span className="text-xs font-semibold text-[var(--iz-txt)]">
					{t.outletDetail.commissionOnly}
				</span>
			</div>

			<div
				className={tierTableReadonlyCell()}
				title={t.outletDetail.commissionOnlyRm0}
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
							? tierTableCell("bg-black/15 text-[var(--iz-muted)]")
							: tierTableEditableCell()
					}
					title={readOnly ? undefined : t.workspace.tapSetTargetSales}
				>
					<div className={fieldShell(undefined, true)}>
						<span className="text-[11px] font-semibold text-[var(--iz-muted)]">
							RM
						</span>

						<TierMoneyInput
							value={commissionOnlyRates.targetSalesRm}
							placeholder={t.workspace.optional}
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
						? tierTableCell("bg-black/15 text-[var(--iz-muted)]")
						: tierTableEditableCell()
				}
				title={readOnly ? undefined : t.workspace.tapEditDrinksTipsCommission}
			>
				<div className={cn(fieldShell("w-full justify-between", true))}>
					<div className="flex min-w-0 items-center gap-0.5">
						<span className="text-[9px] text-[var(--iz-muted)]">
							{t.workspace.legacyDr}
						</span>

						<TierPctInput
							value={commissionOnlyRates.drinkPct}
							disabled={readOnly}
							onChange={(drinkPct) => onPatchCommissionOnly({ drinkPct })}
						/>

						<span className="text-[9px] text-[var(--iz-muted)]">%</span>
					</div>

					<div className="flex min-w-0 items-center gap-0.5">
						<span className="text-[9px] text-[var(--iz-muted)]">
							{t.workspace.legacyTip}
						</span>

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
					{staffingCell("commission_only", "demand")}

					{staffingCell("commission_only", "supplied")}
				</>
			) : (
				<div
					className={tierTableReadonlyCell("justify-center")}
					title={t.outletDetail.notApplicable}
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
					"px-1",

					useWorkspaceLayout
						? hideTargetSales
							? "min-w-[900px]"
							: "min-w-[1020px]"
						: showTierStaffing
							? "min-w-[720px]"
							: hideTargetSales
								? "min-w-[520px]"
								: "min-w-[680px]",
				)}
			>
				<div className="overflow-hidden rounded-xl border border-[var(--iz-line)]">
					<div
						className={cn(
							TIER_TABLE_GRID_BASE,

							gridCols,

							"border-b border-[var(--iz-line)] bg-[rgba(255,255,255,0.03)]",
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
								"border-b border-[var(--iz-line)]",
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

					{!readOnly && (
						<TierRatesTableLegend
							standardShiftHours={legendStandardShiftHours}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
