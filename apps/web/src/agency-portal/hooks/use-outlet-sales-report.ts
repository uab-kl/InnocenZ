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
	wowGrowthPct: number;
	topPrs: { prId: string; name: string; earned: number }[];
}

export interface FloorBreakdown {
	days: {
		dateIso: string;
		dateDisplay: string;
		dayLabel: string;
		drinkSales: number;
		tipsSales: number;
		total: number;
	}[];
	drinkSales: number;
	tipsSales: number;
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

const EMPTY_FLOOR: FloorBreakdown = { days: [], drinkSales: 0, tipsSales: 0 };

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
			// No prior-period comparison from the backend yet — the demo's WoW growth
			// needs a second window; left at 0 until a comparison endpoint exists.
			wowGrowthPct: 0,
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
				total: d.drinkSalesRm + d.tipSalesRm,
			}));
		return {
			days,
			drinkSales: days.reduce((s, d) => s + d.drinkSales, 0),
			tipsSales: days.reduce((s, d) => s + d.tipsSales, 0),
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
