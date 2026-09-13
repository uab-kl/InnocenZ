import { isoKeyFromDate } from "@agency-portal/components/iz/HistDateCalendar";
import { formatRM, IzCard } from "@agency-portal/components/iz/ui";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import { OutletMultiDatePopover } from "@agency-portal/components/outlet/outlet-date-popover";
import {
	formatCompactRm,
	OutletReportTopPrCard,
} from "@agency-portal/components/outlet/outlet-reports-ui";
import {
	formatJobDates,
	type JobDateSpan,
	jobDateIsosForSpan,
	sortJobDateIsos,
} from "@agency-portal/components/outlet/post-job-fields";
import {
	ChartContainer,
	ChartTooltip,
} from "@agency-portal/components/ui/chart";
import { useOutletSalesReport } from "@agency-portal/hooks/use-outlet-sales-report";
import {
	getLiveTodayIso,
	getPayrollWeekSundayIso,
	getPreviousWeekSundayIso,
} from "@agency-portal/lib/demo-clock";
import { averageDrinkPrice } from "@agency-portal/lib/outlet-demo";
import {
	defaultCustomReportDateIsos,
	effectiveCustomReportDateIsos,
	reportableDateIsosForOutlet,
} from "@agency-portal/lib/outlet-report-dates";
import {
	loadOutletReportPrefs,
	normalizeCustomReportRange,
	type OutletReportPrefs,
	type OutletReportTab,
	saveOutletReportPrefs,
} from "@agency-portal/lib/outlet-report-prefs";
import {
	shiftHistoryForOutlet,
	tonightShiftOutletName,
} from "@agency-portal/lib/portal-sync";
import { RECEIPT_COMMISSION_RULES } from "@agency-portal/lib/pr-demo";
import {
	aggregateShiftHistoryByPr,
	type ShiftHistoryRow,
} from "@agency-portal/lib/shift-history-utils";
import { useStore } from "@agency-portal/lib/store";
import { cn } from "@agency-portal/lib/utils";
import {
	getOutletReportForDates,
	getOutletReportForWeek,
	getVelvetReportWeekOptions,
	mappedVelvetReportNights,
	type OutletWeeklyReport,
	payrollWeekRangeLabel,
	VELVET_AGENCY,
} from "@agency-portal/lib/velvet-week-demo";
import {
	CalendarDays,
	ChevronDown,
	Clock,
	TrendingDown,
	TrendingUp,
	Trophy,
	Users,
} from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	LabelList,
	XAxis,
	YAxis,
} from "recharts";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

type ExpandedMetric = "floor" | "pr" | null;

type FloorSalesDayRow = {
	dateIso: string;
	dateDisplay: string;
	dayLabel: string;
	drinkSales: number;
	tipsSales: number;
	// Real receipts split service entitlements out of tips (backend
	// service_sales_rm). The demo sources below have no such concept and report
	// a literal 0 — the field exists so all three producers stay one shape.
	serviceSales: number;
	total: number;
};

type PrSpendRow = {
	prId: string;
	name: string;
	spend: number;
	agency: string;
};

function drinkSalesRmFromUnits(units: number, perDrinkRm: number): number {
	return units * perDrinkRm;
}

function tipsSalesRmFromUnits(tips: number): number {
	return tips * RECEIPT_COMMISSION_RULES.tipRate;
}

function floorBreakdownFromHistory(
	rows: ShiftHistoryRow[],
	perDrinkRm: number,
): {
	days: FloorSalesDayRow[];
	drinkSales: number;
	tipsSales: number;
	serviceSales: number;
} {
	const byDay = new Map<string, Omit<FloorSalesDayRow, "total">>();

	for (const row of rows) {
		const drinkSales =
			typeof row.drinkSalesRm === "number" && Number.isFinite(row.drinkSalesRm)
				? row.drinkSalesRm
				: drinkSalesRmFromUnits(row.totalDrinks, perDrinkRm);
		const tipsSales = tipsSalesRmFromUnits(row.totalTips);
		const cur =
			byDay.get(row.dateIso) ??
			({
				dateIso: row.dateIso,
				dateDisplay: row.dateDisplay,
				dayLabel: weekdayLabel(row.dateIso),
				drinkSales: 0,
				tipsSales: 0,
				serviceSales: 0,
			} satisfies Omit<FloorSalesDayRow, "total">);
		cur.drinkSales += drinkSales;
		cur.tipsSales += tipsSales;
		byDay.set(row.dateIso, cur);
	}

	const days = [...byDay.values()]
		.sort((a, b) => a.dateIso.localeCompare(b.dateIso))
		.map((d) => ({ ...d, total: d.drinkSales + d.tipsSales + d.serviceSales }));

	return {
		days,
		drinkSales: days.reduce((sum, d) => sum + d.drinkSales, 0),
		tipsSales: days.reduce((sum, d) => sum + d.tipsSales, 0),
		// Demo history carries no service entitlements.
		serviceSales: 0,
	};
}

function floorBreakdownFromVelvetNights(
	startIso: string,
	endIso: string,
	todayIso: string,
	perDrinkRm: number,
	allowedDateIsos?: Set<string>,
): {
	days: FloorSalesDayRow[];
	drinkSales: number;
	tipsSales: number;
	serviceSales: number;
} {
	const byDay = new Map<string, Omit<FloorSalesDayRow, "total">>();

	for (const night of mappedVelvetReportNights()) {
		if (allowedDateIsos && !allowedDateIsos.has(night.dateIso)) continue;
		if (
			night.dateIso < startIso ||
			night.dateIso > endIso ||
			night.dateIso > todayIso
		)
			continue;
		let drinkSales = 0;
		let tipsSales = 0;
		for (const pr of night.prs) {
			drinkSales += drinkSalesRmFromUnits(pr.drinks, perDrinkRm);
			tipsSales += tipsSalesRmFromUnits(pr.tips);
		}
		if (drinkSales === 0 && tipsSales === 0) continue;
		byDay.set(night.dateIso, {
			dateIso: night.dateIso,
			dateDisplay: night.dateDisplay,
			dayLabel: weekdayLabel(night.dateIso),
			drinkSales,
			tipsSales,
			serviceSales: 0,
		});
	}

	const days = [...byDay.values()]
		.sort((a, b) => a.dateIso.localeCompare(b.dateIso))
		.map((d) => ({ ...d, total: d.drinkSales + d.tipsSales + d.serviceSales }));

	return {
		days,
		drinkSales: days.reduce((sum, d) => sum + d.drinkSales, 0),
		tipsSales: days.reduce((sum, d) => sum + d.tipsSales, 0),
		// The velvet demo nights carry no service entitlements.
		serviceSales: 0,
	};
}

function weekdayLabel(dateIso: string): string {
	const d = new Date(`${dateIso}T12:00:00`);
	return d.toLocaleDateString("en-GB", { weekday: "short" });
}

/**
 * Series names for the nightly chart.
 *
 * Built inside the component rather than at module scope: `ChartContainer`
 * types `label` as a string, so the resolver-function trick used elsewhere in
 * this work does not fit — the config has to be rebuilt when the language
 * changes instead.
 */
function useChartConfig() {
	const { t } = usePortalLocale();
	return useMemo(
		() => ({
			earned: { label: t.reports.outletEarned, color: "#b79ce8" },
			sales: { label: t.reports.floorSales, color: "#7c6bff" },
			prCost: { label: t.reports.prSpend, color: "#f59e0b" },
		}),
		[t],
	);
}

type DayRow = {
	dateIso: string;
	chartTick: string;
	dayFull: string;
	dateDisplay: string;
	sales: number;
	prCost: number;
	earned: number;
	marginPct: number;
};

function EarningsTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: { payload: DayRow }[];
}) {
	const { t } = usePortalLocale();
	if (!active || !payload?.[0]?.payload) return null;
	const row = payload[0].payload;
	return (
		<div className="rounded-lg border border-[var(--iz-line2)] bg-[var(--iz-panel)] px-3 py-2 text-xs shadow-xl">
			<p className="iz-heading text-[11px] font-bold text-[var(--iz-txt)]">
				{row.dayFull} · {row.dateDisplay}
			</p>
			<p className="mt-1 iz-nums text-sm font-semibold tabular-nums text-[var(--iz-gold-l)]">
				{formatRM(row.earned)}
			</p>
			<p className="mt-1 text-[10px] text-[var(--iz-muted2)]">
				{t.reports.fullBreakdownBelow}
			</p>
		</div>
	);
}

function effectiveWeekSundayIso(prefs: OutletReportPrefs): string {
	if (prefs.tab === "this_week") return getPayrollWeekSundayIso();
	if (prefs.tab === "last_week") return getPreviousWeekSundayIso();
	return prefs.weekSundayIso;
}

function resolveReportRange(
	prefs: OutletReportPrefs,
	customDateIsos: string[],
): {
	startIso: string;
	endIso: string;
	kind: "week" | "custom";
	dateIsos?: string[];
} {
	if (prefs.tab === "custom") {
		if (customDateIsos.length > 0) {
			const sorted = sortJobDateIsos(customDateIsos);
			return {
				startIso: sorted[0]!,
				endIso: sorted[sorted.length - 1]!,
				kind: "custom",
				dateIsos: sorted,
			};
		}
		const { startIso, endIso } = normalizeCustomReportRange(
			prefs.customStartIso,
			prefs.customEndIso,
		);
		return { startIso, endIso, kind: "custom", dateIsos: [] };
	}
	const weekSun = effectiveWeekSundayIso(prefs);
	const week =
		getVelvetReportWeekOptions().find((w) => w.weekSundayIso === weekSun) ??
		getVelvetReportWeekOptions()[0]!;
	return {
		startIso: week.weekSundayIso,
		endIso: week.weekEndIso,
		kind: "week",
	};
}

function loadReport(
	outletName: string,
	prefs: OutletReportPrefs,
	customDateIsos: string[],
): OutletWeeklyReport | null {
	if (prefs.tab === "custom") {
		if (customDateIsos.length === 0) return null;
		return getOutletReportForDates(outletName, customDateIsos);
	}
	return getOutletReportForWeek(outletName, effectiveWeekSundayIso(prefs));
}

/* Resolvers, not strings — the `id` is what drives the tab state and stays. */
const REPORT_TABS: {
	id: OutletReportTab;
	label: (t: PortalTranslations) => string;
}[] = [
	{ id: "this_week", label: (t) => t.reports.thisWeek },
	{ id: "last_week", label: (t) => t.reports.lastWeek },
	{ id: "custom", label: (t) => t.reports.customRange },
];

export function OutletSalesDashboard() {
	const { t } = usePortalLocale();
	const chartConfig = useChartConfig();
	const { shifts, shiftHistory, outletOwner, outletWorkspace } = useStore();
	// On a real outlet session, Reports read live floor-sales + PR-cost from the
	// backend; the demo store (velvet week) is used only in unauthenticated demo
	// mode. `backed` is the switch between the two data sources.
	const salesReport = useOutletSalesReport();
	const backed = salesReport.backed;
	const outletName = tonightShiftOutletName(shifts);
	const orgName = outletOwner.orgName;
	const perDrinkRm =
		outletWorkspace.perDrinkRm ??
		averageDrinkPrice(outletWorkspace.drinkMenu ?? []);

	const [prefs, setPrefs] = useState<OutletReportPrefs>(() =>
		loadOutletReportPrefs(orgName),
	);
	const [expandedMetric, setExpandedMetric] = useState<ExpandedMetric>(null);
	const topPrsRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setPrefs(loadOutletReportPrefs(orgName));
	}, [orgName]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: these prefs are the TRIGGER, not a value the effect reads — an expanded metric card describes one report window, so changing tab/week/custom range must collapse it. Dropping them would leave the card open over numbers from a different window.
	useEffect(() => {
		setExpandedMetric(null);
	}, [
		prefs.tab,
		prefs.weekSundayIso,
		prefs.customStartIso,
		prefs.customEndIso,
		prefs.customDateIsos,
	]);

	// Memoised on orgName alone so effects may depend on it without re-running
	// every render (setPrefs is stable, saveOutletReportPrefs is module scope).
	const updatePrefs = useCallback(
		(patch: Partial<OutletReportPrefs>) => {
			setPrefs((cur) => {
				const next = { ...cur, ...patch };
				saveOutletReportPrefs(orgName, next);
				return next;
			});
		},
		[orgName],
	);

	const todayIso = getLiveTodayIso();

	/**
	 * ⚠️ THE CUSTOM-RANGE PICKER USED TO OFFER ANOTHER VENUE'S NIGHTS.
	 *
	 * `reportableDateIsosForOutlet` is a DEMO-store reader, and it was the only
	 * source here. It takes `outletName`, which on this screen is
	 * `tonightShiftOutletName(shifts)` — and that falls back to
	 * `DEFAULT_OUTLET_CANONICAL` whenever the demo shift list is empty, which is
	 * exactly what a real outlet session has, because `buildBlankPortalReset()`
	 * empties it. `DEFAULT_OUTLET_CANONICAL` and `VELVET_OUTLET_NAME` are the
	 * same string, "Velvet 23".
	 *
	 * So on every real outlet session the picker took the demo branch: it listed
	 * Velvet 23's demo nights, and filtered the venue's own shift history by a
	 * name that was not theirs, which left nothing. The venue could not select
	 * one of its own nights, and the demo dates were then passed on to the
	 * BACKEND as `backendSalesRange`, so the report came back empty without the
	 * screen ever saying why. It is the owner's no-demo-data rule and a broken
	 * feature at the same time.
	 *
	 * On a real session the days come from the venue's own sales/cost rows.
	 */
	const reportableDateIsos = useMemo(
		() =>
			backed
				? salesReport.reportableDateIsos
				: reportableDateIsosForOutlet(outletName, shiftHistory, todayIso),
		[
			backed,
			salesReport.reportableDateIsos,
			outletName,
			shiftHistory,
			todayIso,
		],
	);

	const customDateIsos = useMemo(
		() => effectiveCustomReportDateIsos(prefs, reportableDateIsos),
		[prefs, reportableDateIsos],
	);

	useEffect(() => {
		if (prefs.tab !== "custom") return;
		if (customDateIsos.length > 0) return;
		const defaults = defaultCustomReportDateIsos(reportableDateIsos);
		if (defaults.length === 0) return;
		const normalized = normalizeCustomReportRange(
			defaults[0]!,
			defaults[defaults.length - 1]!,
		);
		updatePrefs({
			customDateIsos: defaults,
			customStartIso: normalized.startIso,
			customEndIso: normalized.endIso,
		});
	}, [prefs.tab, customDateIsos.length, reportableDateIsos, updatePrefs]);

	const range = useMemo(
		() => resolveReportRange(prefs, customDateIsos),
		[prefs, customDateIsos],
	);
	const isCurrentWeek = prefs.tab === "this_week";
	const sealedEndIso = isCurrentWeek ? todayIso : range.endIso;

	// The date window handed to the backend builders. For the current week we cap
	// at today so future nights don't show as empty bars, matching the demo.
	const backendSalesRange = useMemo(
		() => ({
			startIso: range.startIso,
			endIso: sealedEndIso,
			dateIsos: range.kind === "custom" ? range.dateIsos : undefined,
		}),
		[range.startIso, sealedEndIso, range.kind, range.dateIsos],
	);
	const backendReport = useMemo(
		() => (backed ? salesReport.buildReport(backendSalesRange) : null),
		[backed, salesReport, backendSalesRange],
	);

	// Once signed in, the velvet demo report is never shown — an empty backend
	// window falls through to the "no earnings this period" empty state instead.
	const demoReport = useMemo(
		() => loadReport(outletName, prefs, customDateIsos),
		[outletName, prefs, customDateIsos],
	);
	const report = backed ? backendReport : demoReport;
	const customDateIsoSet = useMemo(
		() => (range.dateIsos?.length ? new Set(range.dateIsos) : undefined),
		[range.dateIsos],
	);

	const outletHistoryRows = useMemo(
		() => shiftHistoryForOutlet(shiftHistory, outletName),
		[shiftHistory, outletName],
	);

	const historyInRange = useMemo(() => {
		if (prefs.tab === "custom" && customDateIsoSet?.size) {
			return outletHistoryRows.filter((r) => customDateIsoSet.has(r.dateIso));
		}
		return outletHistoryRows.filter(
			(r) => r.dateIso >= range.startIso && r.dateIso <= sealedEndIso,
		);
	}, [
		outletHistoryRows,
		prefs.tab,
		customDateIsoSet,
		range.startIso,
		sealedEndIso,
	]);

	const topPrs = useMemo(() => {
		if (backed) {
			return salesReport
				.buildTopPrs(backendSalesRange)
				.slice(0, 5)
				.map((p) => ({
					prId: p.prId,
					name: p.name,
					earned: p.earned,
					agency: p.agency || "—",
				}));
		}
		if (historyInRange.length > 0) {
			return aggregateShiftHistoryByPr(historyInRange, "outlet")
				.sort(
					(a, b) =>
						b.totalPayout - a.totalPayout || a.prName.localeCompare(b.prName),
				)
				.slice(0, 5)
				.map((r) => ({
					prId: r.prId,
					name: r.prName,
					earned: r.totalPayout,
					agency: r.venues[0] ?? VELVET_AGENCY,
				}));
		}
		return (report?.topPrs ?? []).map((p) => ({ ...p, agency: VELVET_AGENCY }));
	}, [backed, salesReport, backendSalesRange, historyInRange, report?.topPrs]);

	const prSpendRows = useMemo((): PrSpendRow[] => {
		if (backed) {
			return salesReport.buildTopPrs(backendSalesRange).map((p) => ({
				prId: p.prId,
				name: p.name,
				spend: p.earned,
				agency: p.agency || "—",
			}));
		}
		if (historyInRange.length > 0) {
			return aggregateShiftHistoryByPr(historyInRange, "outlet")
				.map((r) => ({
					prId: r.prId,
					name: r.prName,
					spend: r.totalPayout,
					agency: r.venues[0] ?? VELVET_AGENCY,
				}))
				.sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name));
		}
		return (report?.topPrs ?? []).map((p) => ({
			prId: p.prId,
			name: p.name,
			spend: p.earned,
			agency: VELVET_AGENCY,
		}));
	}, [backed, salesReport, backendSalesRange, historyInRange, report?.topPrs]);

	const floorBreakdown = useMemo(() => {
		if (backed) {
			return salesReport.buildFloorBreakdown(backendSalesRange);
		}
		if (historyInRange.length > 0) {
			return floorBreakdownFromHistory(historyInRange, perDrinkRm);
		}
		if (report) {
			return floorBreakdownFromVelvetNights(
				range.startIso,
				sealedEndIso,
				todayIso,
				perDrinkRm,
				customDateIsoSet,
			);
		}
		return {
			days: [] as FloorSalesDayRow[],
			drinkSales: 0,
			tipsSales: 0,
			serviceSales: 0,
		};
	}, [
		backed,
		salesReport,
		backendSalesRange,
		historyInRange,
		report,
		range.startIso,
		sealedEndIso,
		todayIso,
		perDrinkRm,
		customDateIsoSet,
	]);

	const totalPrEarned = useMemo(
		() =>
			historyInRange.length > 0
				? historyInRange.reduce((a, r) => a + r.totalPayout, 0)
				: topPrs.reduce((a, p) => a + p.earned, 0),
		[historyInRange, topPrs],
	);

	const dayRows = useMemo((): DayRow[] => {
		if (!report) return [];
		const rows = report.days.map((d) => {
			const earned = Math.max(0, d.sales - d.manpowerCost);
			const marginPct = d.sales > 0 ? Math.round((earned / d.sales) * 100) : 0;
			return {
				dateIso: d.dateIso,
				chartTick: weekdayLabel(d.dateIso),
				dayFull: weekdayLabel(d.dateIso),
				dateDisplay: d.dateDisplay,
				sales: d.sales,
				prCost: d.manpowerCost,
				earned,
				marginPct,
			};
		});
		return range.kind === "week"
			? rows
			: [...rows].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
	}, [report, range.kind]);

	if (!report) {
		return (
			<div className="iz-outlet-report">
				<ReportTabs prefs={prefs} onChange={updatePrefs} />
				{prefs.tab === "custom" && (
					<CustomRangePanel
						prefs={prefs}
						onChange={updatePrefs}
						reportableDateIsos={reportableDateIsos}
					/>
				)}
				{prefs.tab !== "custom" && (
					<ReportPeriodBadge prefs={prefs} className="mt-1" />
				)}
				<p className="iz-sm iz-muted mt-4 rounded-2xl border border-dashed border-[var(--iz-line)] px-4 py-8 text-center">
					{t.reports.noPrAttributed}
				</p>
			</div>
		);
	}

	const {
		totalSales,
		totalCost,
		margin,
		wowGrowthPct,
		weekLabel,
		shifts: shiftCount,
	} = report;
	const marginPct =
		totalSales > 0 ? Math.round((margin / totalSales) * 100) : 0;
	const avgEarnedPerNight =
		shiftCount > 0 ? Math.round(margin / shiftCount) : 0;
	const topEarnedMax = Math.max(...topPrs.map((p) => p.earned), 1);
	const sealedDayCount = dayRows.filter(
		(d) => d.dateIso <= todayIso && (d.earned > 0 || d.sales > 0),
	).length;
	// null = the prior window has no positive baseline to divide by. Rendered as
	// "no prior data" rather than 0% (reads as flat) or an invented 100%.
	const hasGrowth = typeof wowGrowthPct === "number";
	const growthUp = hasGrowth && (wowGrowthPct as number) >= 0;
	const floorTableDays = isCurrentWeek
		? floorBreakdown.days.filter((d) => d.dateIso <= todayIso)
		: floorBreakdown.days;

	const scrollToTopPrs = () => {
		requestAnimationFrame(() => {
			topPrsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
		});
	};

	const toggleMetric = (metric: ExpandedMetric) => {
		setExpandedMetric((cur) => (cur === metric ? null : metric));
	};

	return (
		<div className="iz-outlet-report">
			<ReportTabs prefs={prefs} onChange={updatePrefs} />

			{prefs.tab === "custom" ? (
				<CustomRangePanel
					prefs={prefs}
					onChange={updatePrefs}
					reportableDateIsos={reportableDateIsos}
				/>
			) : (
				<ReportPeriodBadge prefs={prefs} />
			)}

			<div className="iz-outlet-report-layout">
				<div className="iz-outlet-report-main">
					<div className="iz-outlet-report-hero">
						<div className="iz-outlet-report-hero__head">
							<div className="min-w-0">
								<p className="iz-outlet-report-hero__label">
									{isCurrentWeek
										? t.reports.netSalesSoFar
										: t.reports.netSalesThisPeriod}
								</p>
								<p className="iz-outlet-report-hero__value">
									{formatRM(margin)}
								</p>
								<p className="iz-outlet-report-hero__formula">
									{fill(t.reports.formula, {
										sales: formatRM(totalSales),
										cost: formatRM(totalCost),
									})}
								</p>
							</div>
							<div className="iz-outlet-report-hero__badges">
								<span
									className={cn(
										"iz-outlet-report-badge",
										!hasGrowth
											? "iz-outlet-report-badge--margin"
											: growthUp
												? "iz-outlet-report-badge--up"
												: "iz-outlet-report-badge--down",
									)}
								>
									{hasGrowth ? (
										<>
											{growthUp ? (
												<TrendingUp className="h-3 w-3" />
											) : (
												<TrendingDown className="h-3 w-3" />
											)}
											{fill(t.reports.vsPrior, {
												pct: (growthUp ? "+" : "") + wowGrowthPct,
											})}
										</>
									) : (
										t.reports.noPriorData
									)}
								</span>
								<span className="iz-outlet-report-badge iz-outlet-report-badge--margin">
									{fill(t.reports.marginPct, { pct: marginPct })}
								</span>
							</div>
						</div>

						<div className="iz-outlet-report-metrics">
							<MetricCard
								label={t.reports.floorSales}
								value={formatRM(totalSales)}
								icon={<Trophy className="h-3.5 w-3.5" />}
								variant="floor"
								selected={expandedMetric === "floor"}
								onClick={() => toggleMetric("floor")}
							/>
							<MetricCard
								label={t.reports.prSpend}
								value={formatRM(totalCost)}
								icon={<Users className="h-3.5 w-3.5" />}
								variant="pr"
								selected={expandedMetric === "pr"}
								onClick={() => toggleMetric("pr")}
							/>
							<MetricCard
								label={t.reports.avgPerNight}
								value={formatRM(avgEarnedPerNight)}
								icon={<Clock className="h-3.5 w-3.5" />}
								variant="avg"
								highlight
							/>
						</div>

						{expandedMetric === "floor" && (
							<div className="iz-outlet-report-expand">
								<div className="grid grid-cols-3 gap-2">
									<div className="iz-outlet-report-expand__tile">
										<p className="iz-outlet-report-expand__tile-label">
											{t.reports.drinkSales}
										</p>
										<p className="iz-outlet-report-expand__tile-value">
											{formatRM(floorBreakdown.drinkSales)}
										</p>
									</div>
									<div className="iz-outlet-report-expand__tile">
										<p className="iz-outlet-report-expand__tile-label">
											{t.reports.tipsSales}
										</p>
										<p className="iz-outlet-report-expand__tile-value">
											{formatRM(floorBreakdown.tipsSales)}
										</p>
									</div>
									{/* Its own tile, never merged into tips: services are the
									    bulk of what PRs log, and calling them "tips" would
									    misstate the split on a money screen. */}
									<div className="iz-outlet-report-expand__tile">
										<p className="iz-outlet-report-expand__tile-label">
											{t.reports.serviceSales}
										</p>
										<p className="iz-outlet-report-expand__tile-value">
											{formatRM(floorBreakdown.serviceSales)}
										</p>
									</div>
								</div>
								<p className="iz-tiny iz-muted2 mt-2">
									{fill(t.reports.floorFormulaHint, { perDrink: perDrinkRm })}
								</p>
								{floorTableDays.length > 0 ? (
									<div className="mt-3 overflow-x-auto">
										<div className="min-w-[28rem]">
											<div className="grid grid-cols-[3rem_1fr_5.5rem_5.5rem_5.5rem_6rem] gap-2 px-1 pb-1 text-[9px] font-bold uppercase tracking-wide text-[var(--iz-muted2)]">
												<span>{t.reports.colDay}</span>
												<span>{t.reports.colDate}</span>
												<span className="text-right">
													{t.reports.colDrinks}
												</span>
												<span className="text-right">{t.reports.colTips}</span>
												<span className="text-right">
													{t.reports.colServices}
												</span>
												<span className="text-right">{t.reports.colTotal}</span>
											</div>
											<div className="space-y-1">
												{floorTableDays.map((row) => (
													<div
														key={row.dateIso}
														className="grid grid-cols-[3rem_1fr_5.5rem_5.5rem_5.5rem_6rem] items-center gap-2 rounded-lg border border-[var(--iz-line)] bg-black/15 px-2 py-1.5"
													>
														<span className="iz-heading text-xs font-bold text-[var(--iz-txt)]">
															{row.dayLabel}
														</span>
														<span className="truncate text-[10px] text-[var(--iz-muted2)]">
															{row.dateDisplay}
														</span>
														<span className="text-right iz-nums text-[10px] tabular-nums text-[var(--iz-muted)]">
															{formatRM(row.drinkSales)}
														</span>
														<span className="text-right iz-nums text-[10px] tabular-nums text-[var(--iz-muted)]">
															{formatRM(row.tipsSales)}
														</span>
														<span className="text-right iz-nums text-[10px] tabular-nums text-[var(--iz-muted)]">
															{formatRM(row.serviceSales)}
														</span>
														<span className="text-right iz-nums text-[10px] font-semibold tabular-nums text-[var(--iz-gold-l)]">
															{formatRM(row.total)}
														</span>
													</div>
												))}
											</div>
										</div>
									</div>
								) : (
									<p className="iz-tiny iz-muted mt-3 text-center">
										{t.reports.noDrinkOrTips}
									</p>
								)}
							</div>
						)}

						{expandedMetric === "pr" && (
							<div className="iz-outlet-report-expand">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<p className="iz-outlet-report-expand__tile-label">
										{t.reports.prSpendByPerson}
									</p>
									<button
										type="button"
										className="iz-btn iz-btn-sm iz-btn-ghost !py-1 !text-[10px]"
										onClick={scrollToTopPrs}
									>
										{t.reports.viewInTopPrs}
									</button>
								</div>
								{prSpendRows.length > 0 ? (
									<div className="mt-2 space-y-1.5">
										{prSpendRows.map((row) => (
											<div
												key={row.prId}
												className="flex items-center gap-2 rounded-lg border border-[var(--iz-line)] bg-black/15 px-3 py-2"
											>
												<div className="min-w-0 flex-1">
													<p className="truncate text-sm font-semibold text-[var(--iz-txt)]">
														{row.name}
													</p>
													<p className="iz-tiny iz-muted2 truncate">
														{row.agency}
													</p>
												</div>
												<span className="shrink-0 iz-nums text-xs font-semibold tabular-nums text-amber-400/90">
													{formatRM(row.spend)}
												</span>
											</div>
										))}
									</div>
								) : (
									<p className="iz-tiny iz-muted mt-3 text-center">
										{t.reports.noPrSpend}
									</p>
								)}
							</div>
						)}

						<div className="iz-outlet-report-pnl">
							<p className="iz-outlet-report-pnl__label">
								{t.reports.pnlSplit}
							</p>
							<div className="iz-outlet-report-pnl__bar">
								<div
									className="iz-outlet-report-pnl__keep"
									style={{
										width: `${totalSales > 0 ? (margin / totalSales) * 100 : 0}%`,
									}}
								/>
								<div
									className="iz-outlet-report-pnl__spend"
									style={{
										width: `${totalSales > 0 ? (totalCost / totalSales) * 100 : 0}%`,
									}}
								/>
							</div>
							<div className="iz-outlet-report-pnl__legend">
								<span>
									<i className="iz-outlet-report-pnl__dot iz-outlet-report-pnl__dot--keep" />
									{fill(t.reports.youKeep, { pct: marginPct })}
								</span>
								<span>
									<i className="iz-outlet-report-pnl__dot iz-outlet-report-pnl__dot--spend" />
									{fill(t.reports.prSpendPct, {
										pct:
											totalSales > 0
												? Math.round((totalCost / totalSales) * 100)
												: 0,
									})}
								</span>
							</div>
						</div>

						<div className="iz-outlet-report-chart">
							<div className="iz-outlet-report-chart__head">
								<p className="iz-outlet-report-chart__title">
									{t.reports.netEarnedByNight}
								</p>
								<p className="iz-outlet-report-chart__hint">
									{t.reports.barHeightHint}
									{isCurrentWeek
										? fill(
												sealedDayCount === 1
													? t.reports.nightsSealedOne
													: t.reports.nightsSealedMany,
												{ n: sealedDayCount },
											)
										: fill(
												dayRows.length === 1
													? t.reports.daysInPeriodOne
													: t.reports.daysInPeriodMany,
												{ n: dayRows.length },
											)}
								</p>
							</div>
							<ChartContainer
								config={chartConfig}
								className="h-[148px] w-full [&_.recharts-cartesian-grid_horizontal]:stroke-[var(--iz-line)]"
							>
								<BarChart
									data={dayRows}
									margin={{ top: 18, right: 4, left: 0, bottom: 0 }}
									barCategoryGap="20%"
								>
									<CartesianGrid
										vertical={false}
										strokeDasharray="3 3"
										stroke="rgba(255,255,255,0.06)"
									/>
									<XAxis
										dataKey="chartTick"
										tickLine={false}
										axisLine={false}
										tick={{ fill: "var(--iz-muted2)", fontSize: 11 }}
										interval={0}
									/>
									<YAxis hide domain={[0, "auto"]} />
									<ChartTooltip
										cursor={{ fill: "rgba(217, 185, 122, 0.08)" }}
										content={<EarningsTooltip />}
									/>
									<Bar
										dataKey="earned"
										fill="var(--iz-gold)"
										radius={[6, 6, 0, 0]}
										maxBarSize={40}
									>
										<LabelList
											dataKey="earned"
											position="top"
											formatter={(value: unknown) =>
												formatCompactRm(Number(value))
											}
											fill="var(--iz-gold-l)"
											fontSize={11}
											fontWeight={700}
										/>
									</Bar>
								</BarChart>
							</ChartContainer>
						</div>
					</div>

					<div className="iz-outlet-report-breakdown">
						<OutletSection
							title={t.reports.dailyBreakdown}
							iconKey="Daily breakdown"
							hint={fill(
								dayRows.length === 1
									? t.reports.daysSummaryOne
									: t.reports.daysSummaryMany,
								{ n: dayRows.length, week: weekLabel },
							)}
							collapsible
							defaultOpen={false}
							className="!mt-0"
						>
							<div className="hidden gap-2 px-3 text-[9px] font-bold uppercase tracking-wide text-[var(--iz-muted2)] sm:grid sm:grid-cols-[3rem_1fr_6.5rem_6.5rem_6.5rem]">
								<span>{t.reports.colDay}</span>
								<span />
								<span className="text-right">{t.reports.colSales}</span>
								<span className="text-right">{t.reports.colPrSpend}</span>
								<span className="text-right">{t.reports.colNet}</span>
							</div>
							<div className="space-y-1.5">
								{(isCurrentWeek
									? dayRows.filter((row) => row.dateIso <= todayIso)
									: dayRows
								).map((row) => (
									<div
										key={row.dateIso}
										className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2 rounded-xl border border-[var(--iz-line)] bg-black/15 px-3 py-2 sm:grid-cols-[3rem_1fr_6.5rem_6.5rem_6.5rem]"
									>
										<div className="min-w-0">
											<span className="block iz-heading text-xs font-bold text-[var(--iz-txt)]">
												{row.dayFull}
											</span>
											<span className="iz-tiny iz-muted2">
												{row.dateDisplay}
											</span>
										</div>
										<div className="min-w-0">
											<div className="h-1.5 overflow-hidden rounded-full bg-[var(--iz-bg2)]">
												<div
													className="iz-outlet-report-pr-bar__fill iz-outlet-report-pr-bar__fill--top"
													style={{
														width: `${(row.earned / Math.max(...dayRows.map((d) => d.earned), 1)) * 100}%`,
													}}
												/>
											</div>
											<p className="iz-tiny iz-muted2 mt-1 truncate sm:hidden">
												{formatRM(row.sales)} − {formatRM(row.prCost)}
											</p>
										</div>
										<span className="hidden whitespace-nowrap text-right iz-nums text-[10px] tabular-nums text-[var(--iz-muted)] sm:block">
											{formatRM(row.sales)}
										</span>
										<span className="hidden whitespace-nowrap text-right iz-nums text-[10px] tabular-nums text-amber-400/80 sm:block">
											−{formatRM(row.prCost)}
										</span>
										<span className="whitespace-nowrap text-right iz-nums text-xs font-semibold tabular-nums text-[var(--iz-gold-l)]">
											{formatRM(row.earned)}
										</span>
										<span className="col-span-full text-[10px] text-[var(--iz-muted2)] sm:hidden">
											{fill(t.reports.rowMobileSummary, {
												sales: formatRM(row.sales),
												cost: formatRM(row.prCost),
												pct: row.marginPct,
											})}
										</span>
									</div>
								))}
							</div>
						</OutletSection>
					</div>
				</div>

				<aside
					ref={topPrsRef}
					className="iz-outlet-report-sidebar"
					id="top-performing-prs"
				>
					<div className="iz-outlet-report-sidebar__head">
						<h3 className="iz-outlet-report-sidebar__title">
							{t.reports.topPerformingPrs}
						</h3>
						<span className="iz-outlet-report-sidebar__badge">
							{fill(t.reports.rankedCount, { n: topPrs.length })}
						</span>
					</div>
					<div className="iz-outlet-report-sidebar__list">
						{topPrs.length === 0 ? (
							<p className="iz-tiny iz-muted py-6 text-center">
								{t.reports.noPrShifts}
							</p>
						) : (
							topPrs.map((p, i) => (
								<OutletReportTopPrCard
									key={p.prId}
									rank={i + 1}
									name={p.name}
									agency={p.agency}
									earned={p.earned}
									topEarned={topEarnedMax}
								/>
							))
						)}
					</div>
					{totalPrEarned > 0 && (
						<p className="iz-outlet-report-sidebar__foot">
							{fill(t.reports.totalPayouts, {
								week: weekLabel,
								total: formatRM(totalPrEarned),
							})}
						</p>
					)}
				</aside>
			</div>
		</div>
	);
}

function ReportTabs({
	prefs,
	onChange,
}: {
	prefs: OutletReportPrefs;
	onChange: (patch: Partial<OutletReportPrefs>) => void;
}) {
	const { t } = usePortalLocale();
	return (
		<div className="iz-outlet-report-tabs">
			{REPORT_TABS.map((tab) => (
				<button
					key={tab.id}
					type="button"
					onClick={() => {
						const patch: Partial<OutletReportPrefs> = { tab: tab.id };
						if (tab.id === "this_week") {
							patch.weekSundayIso = getPayrollWeekSundayIso();
						} else if (tab.id === "last_week") {
							patch.weekSundayIso = getPreviousWeekSundayIso();
						}
						onChange(patch);
					}}
					className={cn(
						"iz-outlet-report-tabs__btn",
						prefs.tab === tab.id && "iz-outlet-report-tabs__btn--active",
					)}
				>
					{tab.label(t)}
				</button>
			))}
		</div>
	);
}

function ReportPeriodBadge({
	prefs,
	className,
}: {
	prefs: OutletReportPrefs;
	className?: string;
}) {
	const label =
		prefs.tab === "this_week"
			? payrollWeekRangeLabel(getPayrollWeekSundayIso())
			: prefs.tab === "last_week"
				? payrollWeekRangeLabel(getPreviousWeekSundayIso())
				: getVelvetReportWeekOptions().find(
						(w) => w.weekSundayIso === prefs.weekSundayIso,
					)?.label;

	if (!label) return null;

	return (
		<div className={cn("flex items-center gap-2", className)}>
			<CalendarDays className="h-4 w-4 shrink-0 text-[var(--iz-muted)]" />
			<span className="iz-tiny iz-muted">{label}</span>
		</div>
	);
}

function CustomRangePanel({
	prefs,
	onChange,
	reportableDateIsos,
}: {
	prefs: OutletReportPrefs;
	onChange: (patch: Partial<OutletReportPrefs>) => void;
	reportableDateIsos: string[];
}) {
	const { t } = usePortalLocale();
	const reportableSet = useMemo(
		() => new Set(reportableDateIsos),
		[reportableDateIsos],
	);
	const selectedDateIsos = useMemo(
		() => effectiveCustomReportDateIsos(prefs, reportableDateIsos),
		[prefs, reportableDateIsos],
	);

	const applySelectedDates = (isos: string[]) => {
		const sorted = sortJobDateIsos(
			isos.filter((iso) => reportableSet.has(iso)),
		);
		if (sorted.length === 0) return;
		const normalized = normalizeCustomReportRange(
			sorted[0]!,
			sorted[sorted.length - 1]!,
		);
		onChange({
			customDateIsos: sorted,
			customStartIso: normalized.startIso,
			customEndIso: normalized.endIso,
		});
	};

	const isDateDisabled = (date: Date) =>
		!reportableSet.has(isoKeyFromDate(date));

	const reportSpanIsos = (anchor: Date, span: JobDateSpan) =>
		jobDateIsosForSpan(anchor, span).filter((iso) => reportableSet.has(iso));

	return (
		<IzCard flat className="space-y-2 !p-3">
			<div className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-[var(--iz-line)] bg-[rgba(0,0,0,0.15)] p-2">
				<OutletMultiDatePopover
					selectedIsos={selectedDateIsos}
					onChange={applySelectedDates}
					disabled={isDateDisabled}
					formatLabel={() => formatJobDates(selectedDateIsos, t)}
					compact
					quickSpans={{
						spans: [
							{ id: "3d", label: t.outletPanels.span3Days },
							{ id: "week", label: t.outletPanels.span1Week },
						],
						isActive: (anchor, spanId) => {
							const expected = reportSpanIsos(anchor, spanId as JobDateSpan);
							if (expected.length === 0) return false;
							const sorted = sortJobDateIsos(selectedDateIsos);
							return (
								expected.length === sorted.length &&
								expected.every((iso, index) => iso === sorted[index])
							);
						},
						onApply: (anchor, spanId) =>
							applySelectedDates(reportSpanIsos(anchor, spanId as JobDateSpan)),
					}}
				/>
				{selectedDateIsos.length > 1 && (
					<span className="iz-tiny iz-muted2 whitespace-nowrap px-0.5">
						{fill(t.reports.daysCount, { n: selectedDateIsos.length })}
					</span>
				)}
			</div>
			<p className="iz-tiny iz-muted2">{t.reports.onlyNightsHint}</p>
			<p className="iz-tiny iz-muted">
				{selectedDateIsos.length > 0
					? fill(t.reports.showingDates, {
							dates: formatJobDates(selectedDateIsos, t),
						})
					: t.reports.noSealedNights}
			</p>
		</IzCard>
	);
}

function MetricCard({
	label,
	value,
	icon,
	variant,
	highlight,
	selected,
	onClick,
}: {
	label: string;
	value: string;
	icon?: ReactNode;
	variant?: "floor" | "pr" | "avg";
	highlight?: boolean;
	selected?: boolean;
	onClick?: () => void;
}) {
	const Tag = onClick ? "button" : "div";

	return (
		<Tag
			type={onClick ? "button" : undefined}
			onClick={onClick}
			className={cn(
				"iz-outlet-report-metric",
				variant === "floor" && "iz-outlet-report-metric--floor",
				variant === "pr" && "iz-outlet-report-metric--pr",
				variant === "avg" && "iz-outlet-report-metric--avg",
				onClick && "iz-outlet-report-metric--clickable",
				selected && "iz-outlet-report-metric--selected",
			)}
		>
			<div className="iz-outlet-report-metric__label-row">
				<span className="iz-outlet-report-metric__label">
					{icon}
					{label}
				</span>
				{onClick && (
					<ChevronDown
						className={cn(
							"h-3.5 w-3.5 shrink-0 text-[var(--iz-muted2)] transition-transform",
							selected && "rotate-180 text-[var(--iz-gold-l)]",
						)}
					/>
				)}
			</div>
			<p
				className={cn(
					"iz-outlet-report-metric__value",
					highlight && "iz-outlet-report-metric__value--gold",
				)}
			>
				{value}
			</p>
		</Tag>
	);
}
