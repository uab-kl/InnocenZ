import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

// Floor-sales capture (revenue side). One row per (shift, PR); the report
// endpoint returns it pre-aggregated by day and by PR for the outlet Reports
// screen. numeric(12,2) columns arrive as strings on raw rows; the aggregate
// endpoint already coerces its sums to numbers.

export interface ShiftSale {
	id: string;
	shiftId: string;
	prId: string;
	outletId: string;
	agencyId: string;
	soldOn: string;
	drinkUnits: number;
	drinkSalesRm: string;
	tipUnits: number;
	tipSalesRm: string;
	serviceUnits: number;
	serviceSalesRm: string;
	// drink + tip + service.
	totalSalesRm: string;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

export interface ShiftSaleDayTotals {
	soldOn: string;
	drinkSalesRm: number;
	tipSalesRm: number;
	// Service entitlements — their own bucket, NOT folded into tips.
	serviceSalesRm: number;
	totalSalesRm: number;
}

export interface ShiftSalePrTotals {
	prId: string;
	prName: string | null;
	totalSalesRm: number;
}

// What a PR cost the venue at (PR × day) grain, aggregated server-side.
// Non-staffing statuses (cancelled/no_show) are already excluded.
export interface ShiftCostPrDayTotals {
	prId: string;
	prName: string | null;
	soldOn: string;
	/**
	 * WAGES ONLY — shift_assignment.pay_amount. `collection_invoice.amount` is
	 * billed from that same column, so this is the half the reconciliation
	 * banner checks the agency's statement against. Don't fold commission in
	 * here; add the two fields where they are displayed.
	 */
	cost: number;
	/**
	 * Commission earned on approved/verified receipts (drink + tip). Kept apart
	 * from `cost` because only the Reports screen wants the sum — see
	 * ShiftCostPrDayTotals in the backend model for the full reasoning.
	 */
	commission: number;
	/**
	 * APPROVED overtime only (`shift_assignment.overtime_amount` where the
	 * status is 'approved'). Pending and rejected claims are 0 here — overtime
	 * is never auto-paid, so it reaches a venue's bill only once the agency has
	 * signed it off.
	 */
	overtime: number;
}

export interface ShiftSaleReport {
	byDay: ShiftSaleDayTotals[];
	byPr: ShiftSalePrTotals[];
	costByPrDay: ShiftCostPrDayTotals[];
}

export interface ShiftSaleReportParams {
	// Admin/agency may target a venue; outlet callers are pinned server-side.
	outletId?: string;
	fromDate?: string;
	toDate?: string;
}

export interface LogShiftSaleInput {
	shiftId: string;
	prId: string;
	drinkUnits?: number;
	drinkSalesRm?: number;
	tipUnits?: number;
	tipSalesRm?: number;
}

export async function fetchShiftSaleReport(
	params: ShiftSaleReportParams,
	onRefreshFail: () => void,
): Promise<ShiftSaleReport> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		outletId: params.outletId,
		fromDate: params.fromDate,
		toDate: params.toDate,
	});
	const response = await client.get<{
		success: boolean;
		message: string;
		data: ShiftSaleReport;
	}>(`/shift-sale/report${queryString}`);
	return response.data.data ?? { byDay: [], byPr: [], costByPrDay: [] };
}

export async function fetchShiftSales(
	params: {
		shiftId?: string;
		outletId?: string;
		fromDate?: string;
		toDate?: string;
	},
	onRefreshFail: () => void,
): Promise<ShiftSale[]> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		shiftId: params.shiftId,
		outletId: params.outletId,
		fromDate: params.fromDate,
		toDate: params.toDate,
	});
	const response = await client.get<{
		success: boolean;
		message: string;
		data: ShiftSale[];
	}>(`/shift-sale${queryString}`);
	return response.data.data ?? [];
}

export async function logShiftSale(
	input: LogShiftSaleInput,
	onRefreshFail: () => void,
): Promise<ShiftSale> {
	const client = getClient(onRefreshFail);
	const response = await client.post<{
		success: boolean;
		message: string;
		data: ShiftSale;
	}>("/shift-sale", input);
	return response.data.data;
}
