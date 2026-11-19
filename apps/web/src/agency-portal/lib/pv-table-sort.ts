import {
	getPvNetTotal,
	type PrPaymentVoucher,
	parsePvIssuedMs,
} from "@agency-portal/lib/pr-demo";
import { compareNullableKeys } from "@/lib/date-time-parts";
import type { SortState } from "@/lib/table-sort-state";

/**
 * THE AGENCY PAYROLL TABLE, SORTED BY ITS HEADERS.
 *
 * The admin list sorts on the SERVER because it is paginated. This one is not:
 * the week tabs are derived from vouchers already loaded in full
 * (`payrollActivePvs`), so ordering them here sorts the whole list and the
 * pagination trap does not exist. The same three questions get the same
 * answers in both consoles — who, when, how much.
 *
 * ⚠️ `parsePvIssuedMs` returns 0 for a value it cannot read. 0 is treated as
 * MISSING, not as 1 January 1970: otherwise every unparseable voucher would
 * sort as the oldest on the platform and float to the top of an ascending
 * sort, which reads as data rather than as a blank.
 */
export type AgencyPvSortField = "pr" | "issued" | "net";

function issuedKey(pv: PrPaymentVoucher): number | null {
	const ms = parsePvIssuedMs(pv.issued ?? "");
	return ms > 0 ? ms : null;
}

export function sortAgencyPvs(
	vouchers: PrPaymentVoucher[],
	sort: SortState<AgencyPvSortField> | null,
	/** The payee's display name — passed in, so this stays free of the roster. */
	nameOf: (pv: PrPaymentVoucher) => string,
): PrPaymentVoucher[] {
	if (!sort) return vouchers;
	const { field, direction } = sort;
	return [...vouchers].sort((a, b) => {
		let primary = 0;
		if (field === "pr") {
			const cmp = nameOf(a).localeCompare(nameOf(b), undefined, {
				sensitivity: "base",
			});
			primary = direction === "asc" ? cmp : -cmp;
		} else if (field === "issued") {
			primary = compareNullableKeys(issuedKey(a), issuedKey(b), direction);
		} else {
			const na = getPvNetTotal(a);
			const nb = getPvNetTotal(b);
			primary = direction === "asc" ? na - nb : nb - na;
		}
		if (primary !== 0) return primary;
		/*
		 * Ties break newest-issued first, then by id, so two vouchers sharing a
		 * name or an amount keep one stable order between renders instead of
		 * swapping places whenever anything else on the page updates.
		 */
		const byIssued = compareNullableKeys(issuedKey(a), issuedKey(b), "desc");
		if (byIssued !== 0) return byIssued;
		return String(a.id).localeCompare(String(b.id));
	});
}
