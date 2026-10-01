import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import type { ShiftSale } from "@/services/shift-sale";
import {
	fetchOutletShiftSales,
	outletShiftSalesKey,
} from "./use-outlet-shared-queries";

/** A stable empty list while the rows load, so readers' memos hold. */
const NO_ROWS: ShiftSale[] = [];

/** One PR's recorded floor sales on one shift. */
export interface RecordedPrSales {
	salesRm: number;
	drinkSalesRm: number;
	drinkUnits: number;
	tipRm: number;
	serviceRm: number;
}

/** One shift's recorded floor sales, whole and per PR. */
export interface RecordedShiftSales extends RecordedPrSales {
	byPr: Map<string, RecordedPrSales>;
}

/** Money in sen while it is being added up; units stay a plain count. */
type Tally = {
	total: number;
	drink: number;
	units: number;
	tip: number;
	service: number;
};

const emptyTally = (): Tally => ({
	total: 0,
	drink: 0,
	units: 0,
	tip: 0,
	service: 0,
});

const sen = (value: string | number | null | undefined): number => {
	const n = Number(value);
	return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const toRm = (tally: Tally): RecordedPrSales => ({
	salesRm: tally.total / 100,
	drinkSalesRm: tally.drink / 100,
	drinkUnits: tally.units,
	tipRm: tally.tip / 100,
	serviceRm: tally.service / 100,
});

/**
 * `shift_sale` rows -> sales per shift and per (shift, PR).
 *
 * Summed in SEN: these are money figures that land on the screen side by side,
 * and float addition across a night's rows drifts by a sen.
 */
export function recordedSalesByShift(
	rows: ShiftSale[],
): Map<string, RecordedShiftSales> {
	const shifts = new Map<string, { whole: Tally; byPr: Map<string, Tally> }>();
	for (const row of rows) {
		const shift = shifts.get(row.shiftId) ?? {
			whole: emptyTally(),
			byPr: new Map<string, Tally>(),
		};
		const pr = shift.byPr.get(row.prId) ?? emptyTally();
		for (const tally of [shift.whole, pr]) {
			tally.total += sen(row.totalSalesRm);
			tally.drink += sen(row.drinkSalesRm);
			tally.units += Number(row.drinkUnits) || 0;
			tally.tip += sen(row.tipSalesRm);
			tally.service += sen(row.serviceSalesRm);
		}
		shift.byPr.set(row.prId, pr);
		shifts.set(row.shiftId, shift);
	}
	const out = new Map<string, RecordedShiftSales>();
	for (const [shiftId, shift] of shifts) {
		out.set(shiftId, {
			...toRm(shift.whole),
			byPr: new Map([...shift.byPr].map(([prId, pr]) => [prId, toRm(pr)])),
		});
	}
	return out;
}

/**
 * THE VENUE'S REAL FLOOR SALES, per shift — for the Today money tiles and the
 * shift sheet.
 *
 * Those tiles read the demo store's receipt scans and roster counters, which a
 * real login blanks, so a venue whose PRs had approved receipts worth RM 1,900
 * saw RM 0 on its own Today card. `shift_sale` is where the server mirrors the
 * approved receipts (the same rows the Reports and History screens read), so
 * it is the honest "sold so far". Demo sessions get `backed: false` and keep
 * the demo engine.
 */
export function useOutletShiftSales() {
	const { logout } = useAuth();
	const backed = getOutletIdentity() !== null;

	const query = useQuery({
		queryKey: outletShiftSalesKey,
		queryFn: () => fetchOutletShiftSales(logout),
		enabled: backed,
		staleTime: 60_000,
	});

	const byShift = useMemo(
		() => recordedSalesByShift(query.data ?? []),
		[query.data],
	);

	return {
		backed,
		byShift,
		/**
		 * The raw `shift_sale` rows, for the one writer on this screen: Log
		 * Sales has to send back what it does not change (units, tips), and the
		 * per-PR sums above drop the tip unit count.
		 */
		rows: query.data ?? NO_ROWS,
		isLoading: backed && query.isLoading,
	};
}
