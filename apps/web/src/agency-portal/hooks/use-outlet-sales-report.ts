import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	fetchShiftSaleReport,
	type ShiftCostPrDayTotals,
	type ShiftSaleReport,
} from "@/services/shift-sale";

// A wide window — the outlet Reports screen slices weeks/custom ranges from this
// single fetch client-side, so we pull everything once and let the builders below
// filter. Keeps the report responsive to tab changes without refetching.
const REPORT_FROM = "2000-01-01";
const REPORT_TO = "2100-01-01";

export interface SalesReportRange {
	startIso: string;
	endIso: string;
	/** When set (custom range), only these exact days are included. */
	dateIsos?: string[];
}

export interface WeeklyDaySales {
	dateIso: string;
	dateDisplay: string;
	sales: number;
	manpowerCost: number;
}

export interface WeeklyReport {
	weekLabel: string;
	days: WeeklyDaySales[];
	totalSales: number;
	totalCost: number;
	margin: number;
	shifts: number;
	avgTicket: number;
	/**
	 * Net-sales change against the preceding comparable window, or NULL when no
	 * honest percentage exists — a prior period that earned nothing (or lost
	 * money) has no baseline to divide by. Callers must render the null case as
	 * "no prior data", never as 0% (which reads as "flat") or 100%.
	 */
	wowGrowthPct: number | null;
	topPrs: { prId: string; name: string; earned: number }[];
}

export interface FloorBreakdown {
	days: {
		dateIso: string;
		dateDisplay: string;
		dayLabel: string;
		drinkSales: number;
		tipsSales: number;
		serviceSales: number;
		total: number;
	}[];
	drinkSales: number;
	tipsSales: number;
	/** Service entitlements — their own bucket, never folded into tips. */
	serviceSales: number;
}

export interface TopPrRow {
	prId: string;
	name: string;
	earned: number;
	agency: string;
}

export interface UseOutletSalesReport {
	/** True on a real signed-in outlet session; false falls back to the demo store. */
	backed: boolean;
	isLoading: boolean;
	/** True once the backend has at least one sales row for this outlet. */
	hasData: boolean;
	buildReport: (range: SalesReportRange) => WeeklyReport | null;
	buildFloorBreakdown: (range: SalesReportRange) => FloorBreakdown;
	buildTopPrs: (range: SalesReportRange) => TopPrRow[];
}

const EMPTY_FLOOR: FloorBreakdown = {
	days: [],
	drinkSales: 0,
	tipsSales: 0,
	serviceSales: 0,
};

function weekdayLabel(dateIso: string): string {
	return new Date(`${dateIso}T12:00:00`).toLocaleDateString("en-GB", {
		weekday: "short",
	});
}

function dayDisplay(dateIso: string): string {
	return new Date(`${dateIso}T12:00:00`).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
	});
}

/** Shifts an ISO day by `days`, in UTC so a DST boundary can't drop or add one. */
function shiftIso(dateIso: string, days: number): string {
	const d = new Date(`${dateIso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/** Inclusive day count between two ISO days. */
function spanDays(startIso: string, endIso: string): number {
	const ms =
		new Date(`${endIso}T00:00:00Z`).getTime() -
		new Date(`${startIso}T00:00:00Z`).getTime();
	return Math.round(ms / 86_400_000) + 1;
}

/**
 * The window this one is compared against.
 *
 * A WEEK shifts back exactly 7 days, never by its own length: the current week
 * is capped at today, so a 4-day Sun–Wed window shifted by 4 would land on
 * Wed–Sat of the prior week — comparing midweek trade against a weekend and
 * calling the difference growth. Shifting by 7 keeps the same weekdays AND the
 * same partial length, which is the only like-for-like comparison available.
 *
 * A CUSTOM range has no weekday meaning, so it shifts by its own span to give
 * the equal-length window immediately before it.
 */
function priorRangeFor(range: SalesReportRange): SalesReportRange {
	const isWeek = !range.dateIsos || range.dateIsos.length === 0;
	const shift = isWeek ? 7 : spanDays(range.startIso, range.endIso);
	return {
		startIso: shiftIso(range.startIso, -shift),
		endIso: shiftIso(range.endIso, -shift),
	};
}

/**
 * Percentage change, or NULL when the baseline cannot carry one.
 *
 * A percentage needs a positive baseline. A prior window that lost money or
 * earned nothing gives none: "+100%" against a zero baseline is invented, and
 * a swing from −RM 8,000 to +RM 2,000 is not "+125%" — the sign flip makes the
 * ratio meaningless. Null says so, and the badge renders "no prior data".
 */
function growthPct(current: number, prior: number): number | null {
	if (!(prior > 0)) return null;
	return Math.round(((current - prior) / prior) * 100);
}

function inRange(dateIso: string, range: SalesReportRange): boolean {
	if (range.dateIsos && range.dateIsos.length > 0) {
		return range.dateIsos.includes(dateIso);
	}
	return dateIso >= range.startIso && dateIso <= range.endIso;
}

/**
 * Reads the outlet's floor-sales report (revenue, from shift_sale) and its
 * shift assignments (cost, from shift_assignment.pay_amount) once, then exposes
 * pure builders that slice a date range into the shapes OutletSalesDashboard
 * renders. Gated on a real outlet session; when there is none, `backed` is false
 * and the caller keeps using the demo store.
 */
export function useOutletSalesReport(): UseOutletSalesReport {
	const { logout } = useAuth();
	const identity = useMemo(() => getOutletIdentity(), []);
	const backed = identity !== null;
	const outletId = identity?.outletId;

	const reportQuery = useQuery({
		queryKey: ["outlet", "shift-sale-report", outletId],
		enabled: backed,
		queryFn: (): Promise<ShiftSaleReport> =>
			fetchShiftSaleReport(
				{ fromDate: REPORT_FROM, toDate: REPORT_TO },
				logout,
			),
	});

	const byDaySales = reportQuery.data?.byDay ?? [];
	// Manpower cost at (PR × day) grain, aggregated server-side (no client row
	// cap; cancelled/no-show already excluded). Sliced to the range below.
	const costByPrDay: ShiftCostPrDayTotals[] =
		reportQuery.data?.costByPrDay ?? [];

	const buildTopPrs = useMemo(
		() =>
			(range: SalesReportRange): TopPrRow[] => {
				// Cost per PR, restricted to the range via the cost row's sold-on day.
				const perPr = new Map<string, { name: string; earned: number }>();
				for (const c of costByPrDay) {
					if (!inRange(c.soldOn, range)) continue;
					const cur = perPr.get(c.prId) ?? {
						name: c.prName ?? "PR",
						earned: 0,
					};
					cur.earned += c.cost;
					if (c.prName) cur.name = c.prName;
					perPr.set(c.prId, cur);
				}
				return [...perPr.entries()]
					.map(([prId, v]) => ({
						prId,
						name: v.name,
						earned: v.earned,
						agency: "",
					}))
					.sort((a, b) => b.earned - a.earned || a.name.localeCompare(b.name));
			},
		[costByPrDay],
	);

	/**
	 * Sales, cost and net for a window — the same arithmetic the headline shows.
	 * Used for the current window AND its comparison window, so the two can never
	 * be computed two different ways.
	 */
	const totalsFor = (
		range: SalesReportRange,
	): { sales: number; cost: number; margin: number; days: number } => {
		const salesDays = byDaySales.filter((d) => inRange(d.soldOn, range));
		const costRows = costByPrDay.filter((c) => inRange(c.soldOn, range));
		const sales = salesDays.reduce((s, d) => s + d.totalSalesRm, 0);
		const cost = costRows.reduce((s, c) => s + c.cost, 0);
		const dayIsos = new Set<string>(salesDays.map((d) => d.soldOn));
		for (const c of costRows) dayIsos.add(c.soldOn);
		return { sales, cost, margin: sales - cost, days: dayIsos.size };
	};

	const buildReport = (range: SalesReportRange): WeeklyReport | null => {
		const salesDays = byDaySales.filter((d) => inRange(d.soldOn, range));
		const costInRange = costByPrDay.filter((c) => inRange(c.soldOn, range));
		// Days that have sales OR cost inside the range.
		const dayIsos = new Set<string>(salesDays.map((d) => d.soldOn));
		for (const c of costInRange) dayIsos.add(c.soldOn);
		if (dayIsos.size === 0) return null;

		const salesByDay = new Map(
			salesDays.map((d) => [d.soldOn, d.totalSalesRm]),
		);
		const costByDay = new Map<string, number>();
		for (const c of costInRange) {
			costByDay.set(c.soldOn, (costByDay.get(c.soldOn) ?? 0) + c.cost);
		}

		const days: WeeklyDaySales[] = [...dayIsos]
			.sort((a, b) => a.localeCompare(b))
			.map((dateIso) => ({
				dateIso,
				dateDisplay: dayDisplay(dateIso),
				sales: salesByDay.get(dateIso) ?? 0,
				manpowerCost: costByDay.get(dateIso) ?? 0,
			}));

		const totalSales = days.reduce((s, d) => s + d.sales, 0);
		const totalCost = days.reduce((s, d) => s + d.manpowerCost, 0);
		const margin = totalSales - totalCost;
		const shifts = days.length;

		return {
			weekLabel: `${dayDisplay(days[0]!.dateIso)} – ${dayDisplay(days[days.length - 1]!.dateIso)}`,
			days,
			totalSales,
			totalCost,
			margin,
			shifts,
			avgTicket: shifts > 0 ? Math.round(totalSales / shifts) : 0,
			// A real comparison, no endpoint required: this hook already pulls the
			// outlet's WHOLE history in one fetch and slices client-side, so the
			// prior window is sitting in memory. The old note claiming it needed a
			// backend endpoint was reading the fetch as if it were range-scoped.
			wowGrowthPct: growthPct(margin, totalsFor(priorRangeFor(range)).margin),
			topPrs: buildTopPrs(range).map((p) => ({
				prId: p.prId,
				name: p.name,
				earned: p.earned,
			})),
		};
	};

	const buildFloorBreakdown = (range: SalesReportRange): FloorBreakdown => {
		const rows = byDaySales.filter((d) => inRange(d.soldOn, range));
		if (rows.length === 0) return EMPTY_FLOOR;
		const days = rows
			.slice()
			.sort((a, b) => a.soldOn.localeCompare(b.soldOn))
			.map((d) => ({
				dateIso: d.soldOn,
				dateDisplay: dayDisplay(d.soldOn),
				dayLabel: weekdayLabel(d.soldOn),
				drinkSales: d.drinkSalesRm,
				tipsSales: d.tipSalesRm,
				serviceSales: d.serviceSalesRm,
				// Must stay the sum of all THREE buckets — the headline reads the
				// backend's own total_sales_rm, and the two have to agree.
				total: d.drinkSalesRm + d.tipSalesRm + d.serviceSalesRm,
			}));
		return {
			days,
			drinkSales: days.reduce((s, d) => s + d.drinkSales, 0),
			tipsSales: days.reduce((s, d) => s + d.tipsSales, 0),
			serviceSales: days.reduce((s, d) => s + d.serviceSales, 0),
		};
	};

	return {
		backed,
		isLoading: reportQuery.isLoading,
		hasData: byDaySales.length > 0,
		buildReport,
		buildFloorBreakdown,
		buildTopPrs,
	};
}
