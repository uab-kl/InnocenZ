import {
	addDaysToIso,
	getPayrollWeekSundayIso,
} from "@agency-portal/lib/demo-clock";
import {
	type HistRow,
	type PrPaymentVoucher,
	type PrPvRow,
	pvRowDateKeyToIso,
} from "@agency-portal/lib/pr-demo";
import {
	buildWeeklyPaymentSummary,
	syncWeeklyPvWithSummary,
} from "@agency-portal/lib/pr-weekly-payment";

const PV_STATUS_PRIORITY: Record<PrPaymentVoucher["status"], number> = {
	DISPUTED: 5,
	SENT: 4,
	PENDING_REVIEW: 3,
	SIGNED: 2,
	PAID: 1,
};

/**
 * A stored `PrPvRow.date` KEY ("18 Jul") back to an ISO date.
 *
 * This used to carry its own copy of the English month list — one of four, the
 * others being the writer (`fmtDtable`) and two more parsers. A drift between
 * any two of them resolved a date to the wrong month or to epoch with nothing
 * raising an error, so the parse now lives once, in `pvRowDateKeyToIso`.
 *
 * Kept as a named wrapper rather than folded away because `agency-payroll.ts`
 * and `history-demo-sync.ts` import this name.
 */
export function pvRowDateToIso(row: PrPvRow, year: number): string | null {
	return pvRowDateKeyToIso(row, year);
}

/** Weekly PV covering a shift night (Sun–Sat payroll week). Prefers inbox/dispute over settled PVs. */
export function pvForPayrollDate(
	dateIso: string,
	pvs: PrPaymentVoucher[],
): PrPaymentVoucher | undefined {
	const matches = pvs.filter(
		(p) =>
			p.weekStartIso &&
			p.weekEndIso &&
			dateIso >= p.weekStartIso &&
			dateIso <= p.weekEndIso,
	);
	if (!matches.length) return undefined;
	return matches.sort(
		(a, b) =>
			(PV_STATUS_PRIORITY[b.status] ?? 0) - (PV_STATUS_PRIORITY[a.status] ?? 0),
	)[0];
}

export function pvForPayrollWeek(
	weekStartIso: string,
	pvs: PrPaymentVoucher[],
): PrPaymentVoucher | undefined {
	const matches = pvs.filter((p) => p.weekStartIso === weekStartIso);
	if (!matches.length) return undefined;
	return matches.sort(
		(a, b) =>
			(PV_STATUS_PRIORITY[b.status] ?? 0) - (PV_STATUS_PRIORITY[a.status] ?? 0),
	)[0];
}

/** Payroll week with an open PV dispute — shift cards hidden until agency resolves. */
export function isPayrollWeekHiddenInHistory(
	weekStartIso: string,
	pvs: PrPaymentVoucher[],
): boolean {
	const weekEnd = addDaysToIso(weekStartIso, 6);
	return pvs.some(
		(p) =>
			p.status === "DISPUTED" &&
			p.weekStartIso &&
			p.weekEndIso &&
			p.weekStartIso <= weekEnd &&
			p.weekEndIso >= weekStartIso,
	);
}

/** Disputed inbox PVs — shown on History as held cards (no shift line items). */
export function disputedPayrollWeekPvs(
	pvs: PrPaymentVoucher[],
): PrPaymentVoucher[] {
	return pvs
		.filter((pv) => pv.status === "DISPUTED" && pv.weekStartIso)
		.sort((a, b) => (b.weekStartIso ?? "").localeCompare(a.weekStartIso ?? ""));
}

/** Open dispute — hide shift + receipt history until agency resolves. */
export function isShiftHiddenInHistory(
	dateIso: string,
	pvs: PrPaymentVoucher[],
): boolean {
	return (
		pvForPayrollDate(dateIso, pvs)?.status === "DISPUTED" ||
		isPayrollWeekHiddenInHistory(getPayrollWeekSundayIso(dateIso), pvs)
	);
}

export function isReceiptWeekHiddenInHistory(
	dateIso: string,
	pvs: PrPaymentVoucher[],
): boolean {
	return isShiftHiddenInHistory(dateIso, pvs);
}

/** Sun–Sat weeks driven by Payment inbox PV (SENT) — History uses PV rows, not shift log. */
export function isPayrollWeekFromInboxPv(
	weekStartIso: string,
	pvs: PrPaymentVoucher[],
): boolean {
	const pv = pvForPayrollWeek(weekStartIso, pvs);
	return Boolean(pv && isPrPaymentInboxPv(pv) && pv.status === "SENT");
}

/** Inbox PV line items → History shift cards (matches Payment week summary). */
export function histRowsFromInboxPv(pv: PrPaymentVoucher): HistRow[] {
	if (!pv.weekStartIso || pv.status !== "SENT" || !isPrPaymentInboxPv(pv))
		return [];

	const year = parseInt(pv.weekStartIso.slice(0, 4), 10);
	type DayAcc = {
		d: [number, number, number];
		venue: string;
		wages: number;
		drinksAmt: number;
		tips: number;
		others: number;
	};
	const byKey = new Map<string, DayAcc>();

	for (const row of pv.rows) {
		const iso = pvRowDateToIso(row, year);
		if (!iso) continue;
		const key = `${iso}|${row.outlet}`;
		const [y, m, d] = iso.split("-").map(Number);
		const cur =
			byKey.get(key) ??
			({
				d: [y, m, d],
				venue: row.outlet,
				wages: 0,
				drinksAmt: 0,
				tips: 0,
				others: 0,
			} satisfies DayAcc);
		const desc = row.desc.toLowerCase();
		if (desc.includes("daily wage")) cur.wages += row.amt;
		else if (desc.includes("drink")) cur.drinksAmt += row.amt;
		else if (desc.includes("tip")) cur.tips += row.amt;
		else cur.others += row.amt;
		byKey.set(key, cur);
	}

	return [...byKey.values()]
		.map((acc) => {
			const dateIso = `${acc.d[0]}-${String(acc.d[1]).padStart(2, "0")}-${String(acc.d[2]).padStart(2, "0")}`;
			const { st, pill } = deriveShiftHistoryStatus(dateIso, [pv]);
			const sales = acc.wages + acc.drinksAmt + acc.tips + acc.others;
			return {
				d: acc.d,
				venue: acc.venue,
				wages: Math.round(acc.wages),
				sales: Math.round(sales),
				others: Math.round(acc.others),
				drinks: Math.round(acc.drinksAmt),
				tips: Math.round(acc.tips),
				st,
				pill,
				durationHours: 8,
			} satisfies HistRow;
		})
		.sort((a, b) => {
			const ak = `${a.d[0]}-${String(a.d[1]).padStart(2, "0")}-${String(a.d[2]).padStart(2, "0")}`;
			const bk = `${b.d[0]}-${String(b.d[1]).padStart(2, "0")}-${String(b.d[2]).padStart(2, "0")}`;
			return bk.localeCompare(ak);
		});
}

export type PaymentHistoryRecord = {
	pvId: string;
	weekLabel: string;
	weekStartIso?: string;
	weekEndIso?: string;
	status: "PAID" | "SIGNED";
	issued: string;
	paidAt?: string;
	prSignedAt?: string;
	bankRef?: string;
	outlet: string;
	shiftDays: number;
	wages: number;
	commission: number;
	earlyWithdrawal: number;
	deductions: number;
	gross: number;
	net: number;
};

export function paymentHistoryStatusLabel(
	status: PaymentHistoryRecord["status"],
): string {
	return status === "PAID" ? "Paid" : "Signed";
}

export function paymentHistoryStatusPillVariant(
	status: PaymentHistoryRecord["status"],
): "green" | "amber" {
	return status === "PAID" ? "green" : "amber";
}

export function paymentHistoryStatusMeta(record: PaymentHistoryRecord): string {
	if (record.status === "PAID") {
		return record.paidAt ? `Paid ${record.paidAt}` : "Paid to bank";
	}
	return record.prSignedAt
		? `Signed ${record.prSignedAt} · Awaiting bank transfer`
		: "Signed · Awaiting bank transfer";
}

function rowCategory(desc: string) {
	const d = desc.toLowerCase();
	if (d.includes("daily wage")) return "wages" as const;
	if (d.includes("withdrawal") || d.includes("advance"))
		return "withdrawal" as const;
	if (d.includes("deduct")) return "deduction" as const;
	if (
		d.includes("commission") ||
		d.includes("drink") ||
		d.includes("tip") ||
		d.includes("table") ||
		d.includes("other")
	) {
		return "commission" as const;
	}
	return "other" as const;
}

function sumRows(rows: PrPvRow[], cat: ReturnType<typeof rowCategory>) {
	return rows.reduce(
		(s, r) => (rowCategory(r.desc) === cat ? s + r.amt : s),
		0,
	);
}

function countShiftDays(rows: PrPvRow[]) {
	const dates = new Set<string>();
	for (const r of rows) {
		if (rowCategory(r.desc) === "wages") dates.add(r.date);
	}
	return dates.size;
}

export function isPaymentHistoryPv(pv: PrPaymentVoucher) {
	return pv.status === "PAID" || pv.status === "SIGNED";
}

/** PR Payment tab — unsigned PVs awaiting PR action (sign or dispute) */
export function isPrPaymentActionPv(pv: PrPaymentVoucher) {
	return pv.status === "SENT" || pv.status === "DISPUTED";
}

/** PR Payment tab — unsigned PVs awaiting PR signature (signed/paid → History) */
export function isPrPaymentInboxPv(pv: PrPaymentVoucher) {
	return pv.status === "SENT";
}

/** Shift history badge — derived from the weekly PV covering that shift date. */
export function deriveShiftHistoryStatus(
	dateIso: string,
	pvs: PrPaymentVoucher[],
): Pick<HistRow, "st" | "pill"> {
	const pv = pvForPayrollDate(dateIso, pvs);
	if (!pv) {
		return { st: "SEALED", pill: "ink" };
	}
	switch (pv.status) {
		case "PAID":
			return { st: "PAID", pill: "green" };
		case "SIGNED":
			return { st: "SIGNED", pill: "amber" };
		case "DISPUTED":
			return { st: "DISPUTED", pill: "red" };
		case "SENT":
		case "PENDING_REVIEW":
			return { st: "SENT", pill: "ink" };
		default:
			return { st: "SEALED", pill: "ink" };
	}
}

export function shiftHistoryStatusLabel(st: HistRow["st"]): string {
	switch (st) {
		case "PAID":
			return "Paid";
		case "SIGNED":
			return "Signed";
		case "SENT":
			return "In PV";
		case "DISPUTED":
			return "Disputed";
		case "SEALED":
			return "Sealed";
		default:
			return st;
	}
}

export function buildPaymentHistoryRecord(
	pv: PrPaymentVoucher,
): PaymentHistoryRecord {
	const wages = sumRows(pv.rows, "wages");
	const commission = sumRows(pv.rows, "commission");
	const earlyWithdrawal =
		pv.deduct > 0 ? pv.deduct : sumRows(pv.rows, "withdrawal");
	const deductions = sumRows(pv.rows, "deduction");
	const shiftDays = countShiftDays(pv.rows);
	const gross = pv.subtotal;
	return {
		pvId: pv.id,
		weekLabel: pv.cycle,
		weekStartIso: pv.weekStartIso,
		weekEndIso: pv.weekEndIso,
		status: pv.status as "PAID" | "SIGNED",
		issued: pv.issued,
		paidAt: pv.paidAt,
		prSignedAt: pv.prSignedAt,
		bankRef: pv.bankRef,
		outlet: pv.outlet,
		shiftDays,
		wages,
		commission,
		earlyWithdrawal,
		deductions,
		gross,
		net: pv.net,
	};
}

export function buildPaymentHistoryRecords(
	pvs: PrPaymentVoucher[],
): PaymentHistoryRecord[] {
	return pvs
		.filter(isPaymentHistoryPv)
		.map(buildPaymentHistoryRecord)
		.sort((a, b) => {
			const parse = (s: string) => {
				const m = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
				if (!m) return 0;
				return Date.parse(`${m[2]} ${m[1]}, ${m[3]}`);
			};
			return parse(b.paidAt ?? b.issued) - parse(a.paidAt ?? a.issued);
		});
}

export function paymentHistoryWeekSummary(pv: PrPaymentVoucher) {
	if (!pv.weekStartIso) return null;
	const summary = buildWeeklyPaymentSummary({
		weekStartIso: pv.weekStartIso,
		pv,
	});
	return syncWeeklyPvWithSummary(pv, summary);
}
