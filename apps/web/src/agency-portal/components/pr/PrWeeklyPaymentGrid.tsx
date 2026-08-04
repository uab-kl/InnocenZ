import { formatRM } from "@agency-portal/components/iz/ui";
import { fmtDtable } from "@agency-portal/lib/pr-demo";
import type {
	WeeklyDayStatus,
	WeeklyDisputeTarget,
	WeeklyIncomeRow,
	WeeklyPaymentSummary,
} from "@agency-portal/lib/pr-weekly-payment";
import { Flag } from "lucide-react";

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

function statusLabel(status: WeeklyDayStatus) {
	if (status === "disputed") return "Disputed";
	if (status === "pending") return "Pending verification";
	if (status === "verified") return "Verified";
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
	weekPhase = "open",
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
	const canInteract = interactive && Boolean(onDisputeDay || onWithdrawDay);

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
							<th className="iz-pr-week-pay__total-h">Total</th>
						</tr>
					</thead>
					<tbody>
						{summary.rows.map((row, rowIdx) => {
							const rowTotal = row.cells.reduce((s, v) => s + v, 0);
							return (
								<tr key={row.key}>
									<th className="iz-pr-week-pay__row-label">{row.label}</th>
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
																? `Withdraw dispute on ${summary.columns[idx].dayLabel} ${summary.columns[idx].dayNum}`
																: `Dispute ${row.label} on ${summary.columns[idx].dayLabel} ${summary.columns[idx].dayNum}`
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
							<th className="iz-pr-week-pay__row-label">Status</th>
							{summary.dayStatus.map((status, idx) => (
								<td
									key={`st-${summary.columns[idx].dateIso}`}
									className={statusClass(status)}
								>
									<span
										className={`iz-pr-week-pay__status-pill${status === "disputed" ? " text-[var(--iz-red)]" : ""}`}
									>
										{statusLabel(status)}
									</span>
								</td>
							))}
							<td className="iz-pr-week-pay__row-total iz-tiny">
								{summary.verifiedDayCount} verified
							</td>
						</tr>
					</tbody>
					<tfoot>
						<tr>
							<td colSpan={summary.columns.length + 1}>
								<span className="iz-pr-week-pay__foot-note">
									PV issued every Sunday
								</span>
							</td>
							<td className="iz-pr-week-pay__net font-sora font-extrabold text-[var(--iz-gold)]">
								{formatRM(weekTotalRm(summary))}
							</td>
						</tr>
					</tfoot>
				</table>
			</div>
			{canInteract && (
				<p className="iz-pr-week-pay__hint">
					Tap any amount to dispute · tap a{" "}
					<span className="text-[var(--iz-red)]">red</span> amount to withdraw a
					mistaken dispute.
				</p>
			)}
		</div>
	);
}
