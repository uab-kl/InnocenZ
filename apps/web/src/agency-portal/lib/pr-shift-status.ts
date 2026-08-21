import {
	calcShiftWagesFromRule,
	formatShiftWagesDetail,
	getOutletRule,
} from "@agency-portal/lib/agency-demo";
import { shiftHoursFromLabel } from "@agency-portal/lib/outlet-demo";
import {
	calcReceiptCommissions,
	isManualSelfLog,
	isSelfLogVerified,
	type PrActiveShiftSession,
	type PrReceiptItem,
	type PrReceiptScan,
	RECEIPT_COMMISSION_RULES,
	receiptEntryMethod,
} from "@agency-portal/lib/pr-demo";

export type DutyWagesBreakdown = {
	/** Flat pay per completed shift (legacy field name). */
	wagePerHour: number;
	shiftHours: number;
	wages: number;
	detail: string;
};

/** Flat shift pay on checkout (+ OT beyond threshold). */
export function calcDutyWagesFromOutlet(
	outlet: string,
	shiftTime: string,
	overtimeMinutes = 0,
): DutyWagesBreakdown {
	const rule = getOutletRule(outlet);
	const shiftHours = shiftHoursFromLabel(shiftTime);
	const extraHours = overtimeMinutes / 60;
	const totalHours = shiftHours + extraHours;
	const { wages, shiftPay } = calcShiftWagesFromRule(rule, totalHours, true);
	const detail = formatShiftWagesDetail(rule, totalHours, overtimeMinutes);
	return {
		wagePerHour: shiftPay,
		shiftHours,
		wages,
		detail,
	};
}

export type ShiftSalesTargets = {
	drinkUnits: number;
	tipRm: number;
	tableUnits: number;
};

export const DEFAULT_SHIFT_SALES_TARGETS: ShiftSalesTargets = {
	drinkUnits: 20,
	tipRm: 150,
	tableUnits: 3,
};

export type ShiftStatusRowKind = "duty" | "receipt";

export type ShiftStatusRow = {
	kind: ShiftStatusRowKind;
	id: string;
	label: string;
	detail: string;
	/** OCR line item name(s) — receipt rows only */
	product?: string;
	/** Line quantity — receipt rows only */
	qty?: string;
	source: string;
	wagesRm: number;
	commissionRm: number;
	verified: boolean;
	verifyNote?: string;
	/** Full scan record — receipt rows only */
	scan?: PrReceiptScan;
};

export function receiptItemsForShift(
	session: PrActiveShiftSession | null | undefined,
	scans: PrReceiptScan[],
) {
	if (!session) return [];
	return scans.filter(
		(r) =>
			r.shiftSessionId === session.id ||
			session.receiptIds.includes(r.id) ||
			(r.pvId === session.pvId &&
				(r.status === "attached" || r.status === "in_pv")),
	);
}

export function sumReceiptItems(items: PrReceiptItem[]) {
	let drinkUnits = 0;
	let tipRm = 0;
	let tableUnits = 0;
	for (const item of items) {
		if (item.category === "drinks") drinkUnits += item.qty;
		else if (item.category === "tips") tipRm += item.amount;
		else if (item.category === "tables") tableUnits += item.qty;
	}
	return { drinkUnits, tipRm, tableUnits };
}

export function aggregateShiftSales(scans: PrReceiptScan[]) {
	let drinkUnits = 0;
	let tipRm = 0;
	let tableUnits = 0;
	let drinkCommission = 0;
	let tipCommission = 0;
	for (const scan of scans) {
		const items = sumReceiptItems(scan.items);
		drinkUnits += items.drinkUnits;
		tipRm += items.tipRm;
		tableUnits += items.tableUnits;
		drinkCommission += scan.drinkCommission;
		tipCommission += scan.tipCommission;
	}
	return {
		drinkUnits,
		tipRm,
		tableUnits,
		drinkCommission,
		tipCommission,
		commissionTotal: drinkCommission + tipCommission,
	};
}

export function verifyReceiptScan(scan: PrReceiptScan): {
	ok: boolean;
	note: string;
} {
	if (isManualSelfLog(scan)) {
		if (isSelfLogVerified(scan)) {
			return { ok: true, note: "Verified in Payment" };
		}
		if (scan.agencyVerification === "rejected") {
			return { ok: false, note: "Rejected in Payment" };
		}
		return { ok: false, note: "Pending verification in Payment" };
	}
	const expected = calcReceiptCommissions(scan.items);
	const itemTotal = scan.items.reduce((s, i) => s + i.amount, 0);
	const issues: string[] = [];
	if (Math.abs(itemTotal - scan.totalLogged) > 0.01) {
		issues.push("total mismatch");
	}
	if (expected.drinkCommission !== scan.drinkCommission) issues.push("drinks");
	if (expected.tipCommission !== scan.tipCommission) issues.push("tips");
	if (issues.length === 0) return { ok: true, note: "Matches PV rules" };
	return { ok: false, note: `Check ${issues.join(", ")}` };
}

const RECEIPT_CATEGORY_LABEL: Record<PrReceiptItem["category"], string> = {
	drinks: "Drinks",
	tips: "Tips",
	tables: "Tables",
	other: "Other",
};

/** Status table — one line per item with category and quantity. */
export function formatReceiptScanItemSummary(items: PrReceiptItem[]): string {
	return items
		.map((item) => {
			const type = RECEIPT_CATEGORY_LABEL[item.category] ?? "Item";
			if (item.category === "tips") {
				return `${type} · ${item.qty}× · RM ${item.amount}`;
			}
			return `${type} · ${item.qty}× ${item.label}`;
		})
		.join(" · ");
}

/** Status table — line item labels joined for multi-item receipts. */
export function formatReceiptLineItemNames(items: PrReceiptItem[]): string {
	if (items.length === 0) return "—";
	return items.map((item) => item.label).join(", ");
}

/** Status table — quantities per line item. */
export function formatReceiptLineItemQty(items: PrReceiptItem[]): string {
	if (items.length === 0) return "—";
	return items.map((item) => String(item.qty)).join(", ");
}

/** Status table row title — receipt unique ref. */
export function formatReceiptScanRowLabel(scan: PrReceiptScan): string {
	return scan.receiptRef || scan.id;
}

export function formatReceiptScanRowDetail(scan: PrReceiptScan): string {
	return scan.scannedAt;
}

export function shiftDurationLabel(session: {
	shiftTime: string;
	shiftHours?: number;
	overtimeMinutes?: number;
}) {
	const baseMins =
		(session.shiftHours ?? shiftHoursFromLabel(session.shiftTime)) * 60;
	const total = baseMins + (session.overtimeMinutes ?? 0);
	const h = Math.floor(total / 60);
	const m = total % 60;
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function buildShiftStatusRows(
	session: PrActiveShiftSession,
	scans: PrReceiptScan[],
	_baseWages: number,
	opts?: { freezeSelfLogVerification?: boolean },
): ShiftStatusRow[] {
	const duty = calcDutyWagesFromOutlet(
		session.outlet,
		session.shiftTime,
		session.overtimeMinutes ?? 0,
	);
	const dutyWages = session.timeOut ? duty.wages : 0;
	const dutyDetail = session.timeOut
		? `${session.timeIn} → ${session.timeOut} · ${duty.detail}`
		: `${session.timeIn} · ${duty.detail}`;

	const rows: ShiftStatusRow[] = [
		{
			kind: "duty",
			id: "duty",
			label: "Duty time",
			detail: dutyDetail,
			source: "Check-in",
			wagesRm: dutyWages,
			commissionRm: 0,
			verified: true,
			verifyNote: "Paid on shift completion",
		},
	];

	for (const scan of scans) {
		const verify = verifyReceiptScan(scan);
		const freezeSelfLog =
			opts?.freezeSelfLogVerification && isManualSelfLog(scan);
		rows.push({
			kind: "receipt",
			id: scan.id,
			label: formatReceiptScanRowLabel(scan),
			detail: formatReceiptScanRowDetail(scan),
			product: formatReceiptLineItemNames(scan.items),
			qty: formatReceiptLineItemQty(scan.items),
			source:
				receiptEntryMethod(scan) === "manual" ? "Manual entry" : "Receipt scan",
			wagesRm: 0,
			commissionRm: scan.totalCommission,
			verified: freezeSelfLog ? false : verify.ok,
			verifyNote: freezeSelfLog
				? "Pending verification in Payment"
				: verify.note,
			scan,
		});
	}

	return rows;
}

export function shiftCommissionTotal(scans: PrReceiptScan[]) {
	return aggregateShiftSales(scans).commissionTotal;
}

/** Total sales logged from receipt scans (RM). */
export function shiftSalesLogged(scans: PrReceiptScan[]) {
	return scans.reduce((sum, scan) => sum + scan.totalLogged, 0);
}

export function shiftSalesRemaining(logged: number, targetRm: number) {
	return Math.max(0, targetRm - logged);
}

export function shiftPayoutTotal(baseWages: number, scans: PrReceiptScan[]) {
	const sales = aggregateShiftSales(scans);
	return baseWages + sales.commissionTotal;
}

export function shiftSalesTargetRm(
	targets: ShiftSalesTargets = DEFAULT_SHIFT_SALES_TARGETS,
) {
	return (
		targets.drinkUnits * RECEIPT_COMMISSION_RULES.drinkPerUnit +
		targets.tipRm * RECEIPT_COMMISSION_RULES.tipRate +
		targets.tableUnits * RECEIPT_COMMISSION_RULES.tablePerUnit
	);
}

export function shiftCommissionRemaining(
	earned: number,
	targets: ShiftSalesTargets = DEFAULT_SHIFT_SALES_TARGETS,
) {
	return Math.max(0, shiftSalesTargetRm(targets) - earned);
}

export function formatShiftSalesLine(
	targets: ShiftSalesTargets,
	actual: ReturnType<typeof aggregateShiftSales>,
) {
	const targetRm = shiftSalesTargetRm(targets);
	const remaining = shiftCommissionRemaining(actual.commissionTotal, targets);
	if (remaining <= 0) return `Target met · ${targetRm} commission`;
	return `${remaining} left to reach ${targetRm} target`;
}
