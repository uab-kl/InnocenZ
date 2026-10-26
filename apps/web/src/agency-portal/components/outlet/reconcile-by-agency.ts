import { collectionAmountRm } from "@agency-portal/lib/collections";
import type { CollectionInvoice } from "@/services/collection-invoice";

/** Below a cent the two sides agree; floats summed in a different order will not. */
export const RECONCILE_CENT = 0.005;

export interface AgencyStatementCheck {
	statement: CollectionInvoice;
	billedRm: number;
	/** That agency's wages for the statement's week, from the venue's records. */
	ownRecordRm: number;
	/** Billed minus own record, rounded to the cent. */
	varianceRm: number;
}

/**
 * Every statement for the NEWEST week — one per agency (the table is unique on
 * agency, outlet and week). The newest statement defines the period, as it
 * always has: deriving the week on the client instead would risk checking a
 * statement against a different seven days than the agency billed for.
 */
export function newestWeekStatements(
	invoices: readonly CollectionInvoice[],
): CollectionInvoice[] {
	const newest = invoices[0];
	if (!newest) return [];
	return invoices.filter(
		(i) => i.weekStart === newest.weekStart && i.weekEnd === newest.weekEnd,
	);
}

/**
 * Each agency's statement against THAT agency's wages, one check per agency.
 *
 * The banner used to check the newest statement — one agency's bill — against
 * the venue's wages from every agency, so a venue supplied by two agencies read
 * the other agency's wages as a billing difference. The money on each side is
 * unchanged (`collection_invoice.amount` against `shift_assignment.pay_amount`);
 * only which wage rows face which statement is.
 *
 * `byAgency` is NULL when the wage rows carry no agency id (a backend older
 * than the split). One statement can still be checked against the total — a
 * single-agency week is exactly what the banner always did. Several cannot be,
 * and none is shown rather than a difference the rows cannot support.
 */
export function checkStatementsByAgency(
	statements: readonly CollectionInvoice[],
	wages: { byAgency: ReadonlyMap<string, number> | null; totalRm: number },
): AgencyStatementCheck[] {
	if (!wages.byAgency && statements.length > 1) return [];
	return statements.map((statement) => {
		const billedRm = collectionAmountRm(statement);
		const ownRecordRm = wages.byAgency
			? (wages.byAgency.get(statement.agencyId) ?? 0)
			: wages.totalRm;
		return {
			statement,
			billedRm,
			ownRecordRm,
			varianceRm: Math.round((billedRm - ownRecordRm) * 100) / 100,
		};
	});
}

/** A matching week is not news — only a check that disagrees is. */
export function isMismatch(check: AgencyStatementCheck): boolean {
	return Math.abs(check.varianceRm) >= RECONCILE_CENT;
}
