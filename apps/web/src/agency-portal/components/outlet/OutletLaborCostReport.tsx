import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import {
	OUTLET_LABOR_COST_SECTION_ID,
	OUTLET_OPEN_LABOR_COST_EVENT,
	resolveShiftTierRates,
} from "@agency-portal/lib/outlet-demo";
import {
	buildOutletLaborCostReport,
	type LaborCostReportLine,
} from "@agency-portal/lib/outlet-financial-sync";
import { type ShiftRequest, useStore } from "@agency-portal/lib/store";
import { cn } from "@agency-portal/lib/utils";
import { Check, ChevronDown, Minus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function formatReportRm(amount: number): string {
	return Math.round(amount).toLocaleString("en-MY");
}

function formatVarianceRm(variance: number): string {
	if (variance === 0) return "0";
	const sign = variance > 0 ? "+ " : "− ";
	return `${sign}${formatReportRm(Math.abs(variance))}`;
}

function formatVariancePct(variance: number, budget: number): string {
	if (budget === 0) return "—";
	const pct = (variance / budget) * 100;
	if (Math.abs(pct) < 0.05) return "0%";
	const sign = pct > 0 ? "+ " : "− ";
	return `${sign}${Math.abs(pct).toLocaleString("en-MY", { maximumFractionDigits: 1 })}%`;
}

function isLaborVarianceFavorable(variance: number): boolean {
	return variance < 0;
}

function VarianceStatusDot({ favorable }: { favorable: boolean }) {
	return (
		<span
			className={cn(
				"iz-outlet-labor-report__status",
				favorable
					? "iz-outlet-labor-report__status--good"
					: "iz-outlet-labor-report__status--bad",
			)}
			aria-hidden
		/>
	);
}

function ReportRow({
	line,
	expanded,
	onToggle,
	hasChildren,
}: {
	line: LaborCostReportLine;
	expanded?: boolean;
	onToggle?: () => void;
	hasChildren?: boolean;
}) {
	const variance = line.actualRm - line.budgetRm;
	const favorable = isLaborVarianceFavorable(variance);
	const isParent = line.depth === 0;

	return (
		<tr
			className={cn(
				"iz-outlet-labor-report__row",
				isParent && "iz-outlet-labor-report__row--parent",
				line.depth === 1 && "iz-outlet-labor-report__row--child",
			)}
		>
			<th scope="row" className="iz-outlet-labor-report__item">
				{hasChildren ? (
					<button
						type="button"
						className="iz-outlet-labor-report__toggle"
						onClick={onToggle}
					>
						{expanded ? (
							<Minus className="h-3 w-3" />
						) : (
							<ChevronDown className="h-3 w-3 -rotate-90" />
						)}
						<span>{line.label}</span>
					</button>
				) : (
					<span
						className={
							line.depth === 1
								? "iz-outlet-labor-report__item-label"
								: undefined
						}
					>
						{line.label}
					</span>
				)}
			</th>
			<td className="iz-outlet-labor-report__num">
				{formatReportRm(line.actualRm)}
			</td>
			<td className="iz-outlet-labor-report__num">
				{formatReportRm(line.budgetRm)}
			</td>
			<td
				className={cn(
					"iz-outlet-labor-report__num iz-outlet-labor-report__var-abs",
					!favorable && variance !== 0 && "iz-outlet-labor-report__num--bad",
				)}
			>
				{formatVarianceRm(variance)}
			</td>
			<td
				className={cn(
					"iz-outlet-labor-report__num iz-outlet-labor-report__var-pct",
					!favorable && variance !== 0 && "iz-outlet-labor-report__num--bad",
				)}
			>
				{formatVariancePct(variance, line.budgetRm)}
			</td>
			<td className="iz-outlet-labor-report__status-cell">
				<VarianceStatusDot favorable={favorable || variance === 0} />
			</td>
		</tr>
	);
}

export function OutletLaborCostReport({
	shift,
	className,
}: {
	shift: ShiftRequest;
	className?: string;
}) {
	const outletWorkspace = useStore((s) => s.outletWorkspace);
	const agencyPRs = useStore((s) => s.agencyPRs);
	const [open, setOpen] = useState(false);
	const [tiersExpanded, setTiersExpanded] = useState(true);

	const tierRates = resolveShiftTierRates(shift, outletWorkspace);
	const report = useMemo(
		() => buildOutletLaborCostReport(shift, tierRates, agencyPRs),
		[shift, tierRates, agencyPRs],
	);

	const parent = report.lines[0];
	const children = report.lines.slice(1);
	const totalVariance = report.totalActualRm - report.totalBudgetRm;
	const totalFavorable = isLaborVarianceFavorable(totalVariance);
	const variancePctLabel = formatVariancePct(
		totalVariance,
		report.totalBudgetRm,
	);

	useEffect(() => {
		const openFromNav = () => setOpen(true);
		window.addEventListener(OUTLET_OPEN_LABOR_COST_EVENT, openFromNav);
		return () =>
			window.removeEventListener(OUTLET_OPEN_LABOR_COST_EVENT, openFromNav);
	}, []);

	if (!parent) return null;

	return (
		<OutletSection
			id={OUTLET_LABOR_COST_SECTION_ID}
			title="Labor cost"
			hint={`${formatReportRm(report.totalActualRm)} actual · ${formatReportRm(report.totalBudgetRm)} target`}
			collapsible
			open={open}
			onOpenChange={setOpen}
			className={cn("iz-outlet-labor-cost-section !mt-2.5", className)}
		>
			<div
				className="iz-outlet-labor-report iz-outlet-labor-report--embedded"
				aria-label="Labor cost report"
			>
				<div className="iz-outlet-labor-report__kpis">
					<div className="iz-outlet-labor-report__kpi">
						<p className="iz-outlet-labor-report__kpi-label">Target</p>
						<p className="iz-outlet-labor-report__kpi-value iz-outlet-labor-report__kpi-value--target">
							{formatReportRm(report.totalBudgetRm)}
						</p>
					</div>
					<div className="iz-outlet-labor-report__kpi">
						<p className="iz-outlet-labor-report__kpi-label">Actual</p>
						<p className="iz-outlet-labor-report__kpi-value">
							{formatReportRm(report.totalActualRm)}
						</p>
					</div>
					<div className="iz-outlet-labor-report__kpi">
						<p className="iz-outlet-labor-report__kpi-label">
							Budget variance
							{totalFavorable && totalVariance !== 0 && (
								<Check
									className="iz-outlet-labor-report__kpi-check"
									aria-hidden
								/>
							)}
						</p>
						<p
							className={cn(
								"iz-outlet-labor-report__kpi-value",
								totalFavorable
									? "iz-outlet-labor-report__kpi-value--good"
									: totalVariance > 0
										? "iz-outlet-labor-report__kpi-value--bad"
										: undefined,
							)}
						>
							{variancePctLabel}
						</p>
					</div>
				</div>

				<div className="iz-outlet-labor-report__table-wrap">
					<table className="iz-outlet-labor-report__table">
						<thead>
							<tr>
								<th scope="col">Item</th>
								<th scope="col">Actual</th>
								<th scope="col">Budget</th>
								<th scope="col" colSpan={3}>
									Budget variance
								</th>
							</tr>
						</thead>
						<tbody>
							<ReportRow
								line={parent}
								expanded={tiersExpanded}
								hasChildren={children.length > 0}
								onToggle={() => setTiersExpanded((v) => !v)}
							/>
							{tiersExpanded &&
								children.map((line) => <ReportRow key={line.id} line={line} />)}
						</tbody>
					</table>
				</div>
			</div>
		</OutletSection>
	);
}
