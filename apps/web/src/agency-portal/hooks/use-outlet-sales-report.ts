import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { useAuth } from "@/lib/auth-context";
import {
	fetchShiftSaleReport,
	type ShiftSaleReport,
} from "@/services/shift-sale";
import {
	fetchShiftAssignments,
	type ShiftAssignment,
} from "@/services/shift-assignment";

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

// PRs pulled off the floor aren't revenue-generating that night — match the
// demo, which reports on staffing shifts only.
function isStaffing(a: ShiftAssignment): boolean {
	return a.status !== "cancelled" && a.status !== "no_show";
}

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
			fetchShiftSaleReport({ fromDate: REPORT_FROM, toDate: REPORT_TO }, logout),
	});

	const assignmentsQuery = useQuery({
		queryKey: ["outlet", "shift-sale-costs", outletId],
		enabled: backed,
		queryFn: async (): Promise<ShiftAssignment[]> => {
			const res = await fetchShiftAssignments({ pageSize: 100 }, logout);
			return res.data;
		},
	});

	const byDaySales = reportQuery.data?.byDay ?? [];
	const assignments = assignmentsQuery.data ?? [];

	const buildTopPrs = useMemo(
		() =>
			(range: SalesReportRange): TopPrRow[] => {
				// Cost per PR, restricted to the range via the assignment's shift date.
				const perPr = new Map<string, { name: string; earned: number }>();
				for (const a of assignments) {
					if (!isStaffing(a) || !a.shiftDate || !inRange(a.shiftDate, range)) continue;
					const pay = Number(a.payAmount) || 0;
					const cur = perPr.get(a.prId) ?? { name: a.prName ?? "PR", earned: 0 };
					cur.earned += pay;
					if (a.prName) cur.name = a.prName;
					perPr.set(a.prId, cur);
				}
				return [...perPr.entries()]
					.map(([prId, v]) => ({ prId, name: v.name, earned: v.earned, agency: "" }))
					.sort((a, b) => b.earned - a.earned || a.name.localeCompare(b.name));
			},
		[assignments],
	);

	const buildReport = (range: SalesReportRange): WeeklyReport | null => {
		const salesDays = byDaySales.filter((d) => inRange(d.soldOn, range));
		// Days that have sales OR cost inside the range.
		const dayIsos = new Set<string>(salesDays.map((d) => d.soldOn));
		for (const a of assignments) {
			if (isStaffing(a) && a.shiftDate && inRange(a.shiftDate, range)) {
				dayIsos.add(a.shiftDate);
			}
		}
		if (dayIsos.size === 0) return null;

		const salesByDay = new Map(salesDays.map((d) => [d.soldOn, d.totalSalesRm]));
		const costByDay = new Map<string, number>();
		for (const a of assignments) {
			if (!isStaffing(a) || !a.shiftDate) continue;
			costByDay.set(a.shiftDate, (costByDay.get(a.shiftDate) ?? 0) + (Number(a.payAmount) || 0));
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
				// Table sales fold into the "tips" column of the demo's two-way split.
				tipsSales: d.tipSalesRm + d.tableSalesRm,
				total: d.drinkSalesRm + d.tipSalesRm + d.tableSalesRm,
			}));
		return {
			days,
			drinkSales: days.reduce((s, d) => s + d.drinkSales, 0),
			tipsSales: days.reduce((s, d) => s + d.tipsSales, 0),
		};
	};

	return {
		backed,
		isLoading: reportQuery.isLoading || assignmentsQuery.isLoading,
		hasData: byDaySales.length > 0,
		buildReport,
		buildFloorBreakdown,
		buildTopPrs,
	};
}
