import {
	type PrReceiptScan,
	parsePvIssuedMs,
} from "@agency-portal/lib/pr-demo";

export type PayrollRangeFilter = {
	fromDate: string;
	toDate: string;
	fromTime: string;
	toTime: string;
};

export const EMPTY_PAYROLL_RANGE: PayrollRangeFilter = {
	fromDate: "",
	toDate: "",
	fromTime: "",
	toTime: "",
};

export function payrollRangeActive(range: PayrollRangeFilter): boolean {
	return Boolean(
		range.fromDate || range.toDate || range.fromTime || range.toTime,
	);
}

export function parseDateInputMs(
	dateIso: string,
	time = "00:00",
): number | null {
	if (!dateIso) return null;
	const [y, m, d] = dateIso.split("-").map(Number);
	if (!y || !m || !d) return null;
	const [hh, mm] = (time || "00:00").split(":").map(Number);
	return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0).getTime();
}

/** Parse display dates like "10 May 2026" or "10 Jun 2026" */
export function parsePayrollDisplayDateMs(value: string): number {
	return parsePvIssuedMs(value);
}

/** Parse receipt `scannedAt` like "27 Apr 2026 · 23:48" */
export function parseScannedAtMs(scannedAt: string): number {
	const m = scannedAt
		.trim()
		.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*·\s*(\d{1,2}):(\d{2})/);
	if (!m) return parsePayrollDisplayDateMs(scannedAt);
	const months = [
		"jan",
		"feb",
		"mar",
		"apr",
		"may",
		"jun",
		"jul",
		"aug",
		"sep",
		"oct",
		"nov",
		"dec",
	];
	const mon = m[2].slice(0, 3).toLowerCase();
	const monthIdx = months.findIndex((name) => name.startsWith(mon));
	if (monthIdx < 0) return 0;
	return new Date(
		parseInt(m[3], 10),
		monthIdx,
		parseInt(m[1], 10),
		parseInt(m[4], 10),
		parseInt(m[5], 10),
	).getTime();
}

export function matchesPayrollRange(
	eventMs: number,
	range: PayrollRangeFilter,
): boolean {
	if (!payrollRangeActive(range)) return true;
	if (!eventMs) return false;

	const fromMs = range.fromDate
		? parseDateInputMs(range.fromDate, range.fromTime || "00:00")
		: null;
	const toMs = range.toDate
		? parseDateInputMs(range.toDate, range.toTime || "23:59")
		: null;

	if (fromMs != null && eventMs < fromMs) return false;
	if (toMs != null && eventMs > toMs) return false;
	return true;
}

export function matchesPayrollIssueDate(
	issueDate: string,
	issueTime: string | undefined,
	range: PayrollRangeFilter,
): boolean {
	if (!payrollRangeActive(range)) return true;
	const baseMs = parsePayrollDisplayDateMs(issueDate);
	if (!baseMs) return false;
	if (issueTime) {
		const [hh, mm] = issueTime.split(":").map(Number);
		const d = new Date(baseMs);
		d.setHours(hh || 0, mm || 0, 0, 0);
		return matchesPayrollRange(d.getTime(), range);
	}
	return matchesPayrollRange(baseMs, range);
}

export function receiptShiftDateIso(scan: PrReceiptScan): string {
	const [y, m, d] = scan.date;
	return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Date range matches the PR's shift working day; optional times filter scan timestamp. */
export function matchesReceiptShiftWorkRange(
	scan: PrReceiptScan,
	range: PayrollRangeFilter,
): boolean {
	if (!payrollRangeActive(range)) return true;

	const shiftIso = receiptShiftDateIso(scan);
	const shiftDayMs = parseDateInputMs(shiftIso, "12:00") ?? 0;
	const fromDateMs = range.fromDate
		? parseDateInputMs(range.fromDate, "00:00")
		: null;
	const toDateMs = range.toDate
		? parseDateInputMs(range.toDate, "23:59")
		: null;

	if (fromDateMs != null && shiftDayMs < fromDateMs) return false;
	if (toDateMs != null && shiftDayMs > toDateMs) return false;

	if (range.fromTime || range.toTime) {
		return matchesPayrollRange(parseScannedAtMs(scan.scannedAt), {
			fromDate: range.fromDate || shiftIso,
			toDate: range.toDate || shiftIso,
			fromTime: range.fromTime,
			toTime: range.toTime,
		});
	}

	return true;
}
