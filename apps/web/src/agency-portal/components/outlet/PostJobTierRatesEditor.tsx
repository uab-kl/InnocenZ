import {
	TierCountStepper,
	TierMoneyInput,
	TierPayInput,
	TierPctStepper,
} from "@agency-portal/components/outlet/tier-rates-table-ui";
import type {
	OutletPrTier,
	OutletTierRateSettings,
} from "@agency-portal/lib/agency-demo";
import {
	applyPayTierRowChange,
	type CommissionOnlyRateSettings,
	clampPayTierRowsToMax,
	ensureAllPayTierRows,
	isCommissionOnlyPayTier,
	isServantPayTier,
	newPostJobPayTierRow,
	outletTierForPostJobPayTier,
	type PostJobPayTierId,
	type PostJobPayTierRow,
	payTierDisplayOrder,
	postJobPayTierLabel,
	totalPrCountFromPayTierRows,
} from "@agency-portal/lib/post-job-pay-tiers";
import { cn } from "@agency-portal/lib/utils";
import { Award, Crown, Medal, Percent, Star, UserRound } from "lucide-react";
import { type ReactNode, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

const TIER_COLUMN_ICONS = [Star, Medal, Award, Award, Crown] as const;

function tierColumnIcon(payTierId: PostJobPayTierId) {
	if (isCommissionOnlyPayTier(payTierId)) return Percent;
	if (isServantPayTier(payTierId)) return UserRound;
	const rank = payTierDisplayOrder(payTierId);
	return TIER_COLUMN_ICONS[rank] ?? Star;
}

function tierColumnIconClass(payTierId: PostJobPayTierId): string {
	if (isCommissionOnlyPayTier(payTierId))
		return "iz-post-job-tier-col-head__icon--commission";
	if (isServantPayTier(payTierId))
		return "iz-post-job-tier-col-head__icon--servant";
	const rank = payTierDisplayOrder(payTierId);
	return `iz-post-job-tier-col-head__icon--${Math.min(rank + 1, 5)}`;
}

/**
 * A tier row commits NO commission at all — drives the cell's "none" styling.
 *
 * Separate from the label below on purpose: the class used to be picked by
 * comparing the rendered hint to "—", which is a translated string the moment
 * this screen speaks anything but English. A state is data, its words are not.
 */
function hasNoCommission(row: PostJobPayTierRow): boolean {
	if (isCommissionOnlyPayTier(row.payTierId)) return false;
	return row.drinkPct <= 0 && row.tipPct <= 0;
}

function formatCommissionHint(
	row: PostJobPayTierRow,
	t: PortalTranslations,
): string {
	if (isCommissionOnlyPayTier(row.payTierId))
		return t.outletPanels.commissionDrinksAndTips;
	const hasDrinks = row.drinkPct > 0;
	const hasTips = row.tipPct > 0;
	if (hasDrinks && hasTips) return t.outletPanels.commissionDrinksAndTips;
	if (hasDrinks) return t.outletPanels.commissionDrinksOnly;
	if (hasTips) return t.outletPanels.commissionTipsOnly;
	return "—";
}

/**
 * A tier the venue PRICED but asked for nobody of.
 *
 * The composer shows every tier whether or not the shift books one, so a rate typed
 * into a column with a count of zero looks exactly like a column nobody touched.
 * That rate is kept now (18 Aug 2026 — it used to be dropped on save), which makes
 * the silence worse, not better: the number is real, it is simply not buying anyone
 * on this shift. Say so.
 *
 * "Untouched" is measured against a FRESHLY BUILT row rather than against the
 * workspace card directly, because that is the same constructor `ensureAllPayTierRows`
 * uses to fill these columns in — including `snapTierWage`'s rounding. Comparing to
 * the raw card would flag a column the outlet never opened, and a note that cries
 * wolf on all six untouched tiers is worse than no note.
 */
function isPricedButUnrequested(
	row: PostJobPayTierRow,
	workspaceTierRates: Record<OutletPrTier, OutletTierRateSettings>,
	commissionOnlyRates?: CommissionOnlyRateSettings,
): boolean {
	if (row.prCount > 0) return false;
	const fresh = newPostJobPayTierRow(
		{ payTierId: row.payTierId, prCount: 0 },
		workspaceTierRates,
		commissionOnlyRates,
	);
	return (
		row.wagePerHour !== fresh.wagePerHour ||
		row.drinkPct !== fresh.drinkPct ||
		row.tipPct !== fresh.tipPct ||
		(row.targetSalesRm ?? null) !== (fresh.targetSalesRm ?? null)
	);
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
	const { t } = usePortalLocale();
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

	/*
	 * Each row carries a STABLE id beside its translated label. The label used to
	 * be the React key, which remounts every cell in the grid — and drops focus
	 * out of whichever rate the operator was typing — the instant the language
	 * changes. The id never moves; only the words do.
	 */
	const rowLabels: { id: string; label: string }[] = commissionExpanded
		? [
				{ id: "wages", label: t.postJob.colWages },
				{ id: "drinks", label: t.postJob.colDrinks },
				{ id: "tips", label: t.postJob.colTips },
				{ id: "target", label: t.postJob.colTarget },
				{ id: "prCount", label: t.postJob.colPrCount },
			]
		: [
				{ id: "wages", label: t.postJob.colWages },
				{ id: "commission", label: t.postJob.colCommission },
				{ id: "target", label: t.postJob.colTarget },
				{ id: "prCount", label: t.postJob.colPrCount },
			];

	const commissionRowIndex = 1;
	const drinksRowIndex = 1;
	const tipsRowIndex = 2;
	const targetRowIndex = commissionExpanded ? 3 : 2;
	const prCountRowIndex = commissionExpanded ? 4 : 3;

	return (
		<div className="space-y-2">
			{maxPrTotal != null && maxPrTotal > 0 && (
				<p className="text-[10px] text-[var(--iz-muted)]">
					{fill(
						maxPrTotal === 1
							? t.postJob.allocatedAcrossTiers
							: t.postJob.allocatedAcrossTiersMany,
						{ used: allocatedTotal, total: maxPrTotal },
					)}
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
											"iz-post-job-tier-col-head__icon",
											tierColumnIconClass(row.payTierId),
										)}
									>
										<Icon className="h-3.5 w-3.5" />
									</span>
									<div className="iz-post-job-tier-col-head__label">
										{tierLabel}
									</div>
									{isPricedButUnrequested(
										row,
										workspaceTierRates,
										commissionOnlyRates,
									) && (
										<div className="text-center text-[9px] leading-tight text-[var(--iz-amber)]">
											{t.postJob.ratedNoneRequested}
										</div>
									)}
								</div>
							);
						})}

						{rowLabels.map(({ id, label }, labelIndex) => (
							<div key={id} className="contents">
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
												title={t.postJob.tapEditWages}
											>
												{commissionOnly ? (
													<span className="text-xs font-medium text-[var(--iz-muted)]">
														{t.postJob.noWages}
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
										const hint = formatCommissionHint(row, t);
										return (
											<button
												key={`${row.id}-comm`}
												type="button"
												className={cn(
													"iz-post-job-tier-comm-cell iz-post-job-tier-comm-cell--btn",
													hasNoCommission(row) &&
														"iz-post-job-tier-comm-cell--none",
												)}
												onClick={() => setCommissionExpanded(true)}
												title={t.postJob.tapEditDrinksTips}
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
												title={t.postJob.tapEditDrinksCommission}
											>
												<span className="text-[9px] font-semibold text-[var(--iz-muted)]">
													{t.workspace.legacyDr}
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
												title={t.workspace.tapEditTipsCommission}
											>
												<span className="text-[9px] font-semibold text-[var(--iz-muted)]">
													{t.workspace.legacyTip}
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
												title={t.workspace.tapSetTargetSales}
											>
												<span className="text-[10px] font-semibold text-[var(--iz-muted)]">
													RM
												</span>
												<TierMoneyInput
													value={row.targetSalesRm}
													placeholder={t.postJob.optional}
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
