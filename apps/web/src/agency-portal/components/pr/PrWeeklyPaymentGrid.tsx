import { formatRM } from "@agency-portal/components/iz/ui";
import { fmtDtable } from "@agency-portal/lib/pr-demo";
import type {
	WeeklyDayStatus,
	WeeklyDisputeTarget,
	WeeklyIncomeRow,
	WeeklyPaymentSummary,
} from "@agency-portal/lib/pr-weekly-payment";
import { Flag } from "lucide-react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * Display name for one income row.
 *
 * `row.key` is the stored identity — it keys `totals`, `disputedLines` and the
 * dispute target that goes back to the agency — so only the rendered word
 * changes. The four buckets already have names in `money`, shared with the PR
 * app so a dispute reads the same on both sides of the argument; an unmapped
 * key (today: `tables`) falls through to the label the builder supplied rather
 * than blanking the row.
 */
export function weeklyIncomeLabel(
	key: WeeklyIncomeRow["key"],
	fallback: string,
	t: PortalTranslations,
): string {
	const map: Partial<Record<WeeklyIncomeRow["key"], string>> = {
		wages: t.money.dailyWages,
		drinks: t.money.drinks,
		tips: t.money.tips,
		others: t.money.others,
	};
	return map[key] ?? fallback;
}

function weekTotalRm(summary: WeeklyPaymentSummary): number {
	const n = summary.totals.net;
	return Number.isFinite(n) ? n : 0;
}

function amountCellClass(
	dayStatus: WeeklyDayStatus,
	isDisputed: boolean,
	canTap: boolean,
	isActive: boolean,
) {
	const parts: string[] = [];
	if (isDisputed) parts.push("iz-pr-week-pay__cell--disputed");
	else parts.push(statusClass(dayStatus));
	if (canTap) parts.push("iz-pr-week-pay__cell--tap");
	if (isActive) parts.push("iz-pr-week-pay__cell--dispute-active");
	return parts.join(" ");
}

function statusClass(status: WeeklyDayStatus) {
	if (status === "verified") return "iz-pr-week-pay__cell--verified";
	if (status === "disputed") return "iz-pr-week-pay__cell--disputed";
	if (status === "pending") return "iz-pr-week-pay__cell--pending";
	return "iz-pr-week-pay__cell--empty";
}

/** Keyed by the STORED day status; only the word a human reads changes. */
function statusLabel(status: WeeklyDayStatus, t: PortalTranslations) {
	if (status === "disputed") return t.receipts.disputed;
	if (status === "pending") return t.prPortal.pendingVerification;
	if (status === "verified") return t.receipts.verified;
	return "—";
}

function cellAmount(value: number) {
	if (value <= 0) return "—";
	return formatRM(value).replace("RM ", "");
}

export function PrWeeklyPaymentGrid({
	summary,
	large,
	interactive,
	onDisputeDay,
	onWithdrawDay,
	weekPhase: _weekPhase = "open",
	activeDisputeKey,
}: {
	summary: WeeklyPaymentSummary;
	large?: boolean;
	interactive?: boolean;
	onDisputeDay?: (targets: WeeklyDisputeTarget[]) => void;
	onWithdrawDay?: (targets: WeeklyDisputeTarget[]) => void;
	/** open = current week (PV not yet issued); issued = past week with PV sent */
	weekPhase?: "open" | "issued";
	/** Highlights the cell the user tapped to dispute */
	activeDisputeKey?: string | null;
}) {
	const { t } = usePortalLocale();
	const canInteract = Boolean(interactive && (onDisputeDay || onWithdrawDay));

	const buildTarget = (
		colIdx: number,
		row: WeeklyIncomeRow,
	): WeeklyDisputeTarget | null => {
		if (summary.dayStatus[colIdx] === "empty") return null;
		const amount = row.cells[colIdx];
		if (amount <= 0) return null;
		const col = summary.columns[colIdx];
		const [y, m, d] = col.dateIso.split("-").map(Number);
		return {
			dateIso: col.dateIso,
			dateLabel: fmtDtable(y, m, d),
			dayLabel: col.dayLabel,
			incomeKey: row.key,
			incomeLabel: row.label,
			amount,
			outlet: summary.dayOutlets[colIdx],
		};
	};

	const handleCellTap = (
		colIdx: number,
		row: WeeklyIncomeRow,
		isDisputed: boolean,
	) => {
		const target = buildTarget(colIdx, row);
		if (!target) return;
		if (isDisputed) {
			onWithdrawDay?.([target]);
			return;
		}
		onDisputeDay?.([target]);
	};

	return (
		<div className={`iz-pr-week-pay${large ? " iz-pr-week-pay--large" : ""}`}>
			<div className="iz-pr-week-pay__scroll">
				<table className="iz-pr-week-pay__table">
					<thead>
						<tr>
							<th className="iz-pr-week-pay__corner" />
							{summary.columns.map((col) => (
								<th
									key={col.dateIso}
									className={`iz-pr-week-pay__day${col.isToday ? " today" : ""}${col.isFuture ? " future" : ""}`}
								>
									<span className="d">{col.dayLabel}</span>
									<span className="n">{col.dayNum}</span>
								</th>
							))}
							<th className="iz-pr-week-pay__total-h">
								{t.reports.colTotal}
							</th>
						</tr>
					</thead>
					<tbody>
						{summary.rows.map((row, rowIdx) => {
							const rowTotal = row.cells.reduce((s, v) => s + v, 0);
							const rowLabel = weeklyIncomeLabel(row.key, row.label, t);
							return (
								<tr key={row.key}>
									<th className="iz-pr-week-pay__row-label">{rowLabel}</th>
									{row.cells.map((value, idx) => {
										const cellKey = `${summary.columns[idx].dateIso}-${row.key}`;
										const isActive = activeDisputeKey === cellKey;
										const isDisputed =
											summary.disputedCells?.[rowIdx]?.[idx] ?? false;
										const canTapCell = canInteract && value > 0;
										return (
											<td
												key={`${row.key}-${summary.columns[idx].dateIso}`}
												className={amountCellClass(
													summary.dayStatus[idx],
													isDisputed,
													canTapCell,
													isActive,
												)}
											>
												{canTapCell ? (
													<button
														type="button"
														className="iz-pr-week-pay__cell-btn"
														title={
															isDisputed
																? fill(t.prPortal.withdrawDisputeOnDay, {
																		day: `${summary.columns[idx].dayLabel} ${summary.columns[idx].dayNum}`,
																	})
																: fill(t.prPortal.disputeAmountOnDay, {
																		component: rowLabel,
																		day: `${summary.columns[idx].dayLabel} ${summary.columns[idx].dayNum}`,
																	})
														}
														onClick={() => handleCellTap(idx, row, isDisputed)}
													>
														<span
															className={
																isDisputed ? "text-[var(--iz-red)]" : undefined
															}
														>
															{cellAmount(value)}
														</span>
														<Flag
															className={`iz-pr-week-pay__cell-flag${isDisputed ? " text-[var(--iz-red)]" : ""}`}
															aria-hidden
														/>
													</button>
												) : (
													<span
														className={
															isDisputed
																? "font-semibold text-[var(--iz-red)]"
																: undefined
														}
													>
														{cellAmount(value)}
													</span>
												)}
											</td>
										);
									})}
									<td className="iz-pr-week-pay__row-total">
										{cellAmount(rowTotal)}
									</td>
								</tr>
							);
						})}
						<tr className="iz-pr-week-pay__status-row">
							<th className="iz-pr-week-pay__row-label">{t.table.status}</th>
							{summary.dayStatus.map((status, idx) => (
								<td
									key={`st-${summary.columns[idx].dateIso}`}
									className={statusClass(status)}
								>
									<span
										className={`iz-pr-week-pay__status-pill${status === "disputed" ? " text-[var(--iz-red)]" : ""}`}
									>
										{statusLabel(status, t)}
									</span>
								</td>
							))}
							<td className="iz-pr-week-pay__row-total iz-tiny">
								{fill(t.prPortal.verifiedDayCount, {
									n: summary.verifiedDayCount,
								})}
							</td>
						</tr>
					</tbody>
					<tfoot>
						<tr>
							<td colSpan={summary.columns.length + 1}>
								<span className="iz-pr-week-pay__foot-note">
									{t.prPortal.pvIssuedEverySunday}
								</span>
							</td>
							<td className="iz-pr-week-pay__net iz-heading font-extrabold text-[var(--iz-gold)]">
								{formatRM(weekTotalRm(summary))}
							</td>
						</tr>
					</tfoot>
				</table>
			</div>
			{canInteract && (
				/* One sentence, one key. It used to be three JSX fragments around a
				   red <span>, which no language can reorder — and the colour cue it
				   carried is already on the cells themselves. */
				<p className="iz-pr-week-pay__hint">
					{t.prPortal.tapAmountToDisputeHint}
				</p>
			)}
		</div>
	);
}
