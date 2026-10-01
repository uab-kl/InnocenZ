import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

/** One night's commission, in SEN — drink and tip on its approved/verified receipts. */
export interface HistoryExtrasAssignment {
	assignmentId: string;
	drinkCommissionSen: number;
	tipCommissionSen: number;
}

/** One voucher's penalty lines as a POSITIVE figure, in SEN (0 when none). */
export interface HistoryExtrasVoucher {
	voucherId: string;
	penaltySen: number;
}

/**
 * `GET /payment-voucher/history-extras` — what the agency History's take-home
 * needs from the vouchers, for one ledger window, in ONE read (backend
 * history-extras.ts). Scoped server-side to the acting agency.
 *
 * `assignments` lists only nights with commission; `vouchers` lists EVERY
 * voucher the server read — the ledger's PRs' vouchers whose week touches the
 * window, or that carry no week.
 */
export interface HistoryExtras {
	fromDate: string;
	toDate: string;
	assignments: HistoryExtrasAssignment[];
	vouchers: HistoryExtrasVoucher[];
}

export async function fetchHistoryExtras(
	params: { fromDate: string; toDate: string },
	onRefreshFail: () => void,
): Promise<HistoryExtras> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: HistoryExtras;
	}>(`/payment-voucher/history-extras${buildQueryParams(params)}`);
	return response.data.data;
}
