import type {
	PrPaymentVoucher,
	PrPvRow,
	PrPvStatus,
} from "@agency-portal/lib/pr-demo";
import type {
	PaymentVoucher,
	PaymentVoucherLine,
	PaymentVoucherLineInput,
	PaymentVoucherStatus,
	PaymentVoucherWithLines,
} from "@/services/payment-voucher";

// Backend enum (snake/lower) → demo status (UPPER). The demo also has a
// synthetic "TO_PAY" filter that maps onto SIGNED — that lives in the screen,
// not here.
const STATUS_TO_DEMO: Record<PaymentVoucherStatus, PrPvStatus> = {
	pending_review: "PENDING_REVIEW",
	sent: "SENT",
	signed: "SIGNED",
	paid: "PAID",
	disputed: "DISPUTED",
};

const STATUS_TO_BACKEND: Record<PrPvStatus, PaymentVoucherStatus> = {
	PENDING_REVIEW: "pending_review",
	SENT: "sent",
	SIGNED: "signed",
	PAID: "paid",
	DISPUTED: "disputed",
};

export function pvStatusToBackend(status: PrPvStatus): PaymentVoucherStatus {
	return STATUS_TO_BACKEND[status];
}

// numeric(12,2) columns come back as strings; coerce defensively.
function num(value: string | null | undefined): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

function lineToRow(line: PaymentVoucherLine): PrPvRow {
	return {
		i: line.sortOrder,
		date: line.lineDate ?? "",
		day: "",
		outlet: line.outlet ?? "",
		desc: line.description,
		qty: line.quantity,
		amt: num(line.amount),
		ref: line.ref ?? "",
		// Carried so the earnings breakdown can classify by the typed column
		// instead of searching the description text for the word "wage".
		component: line.component ?? null,
	};
}

// The demo PV total helpers (getPvNetTotal / getPvSalesTotal) recompute from
// `rows`, ignoring the stored net — so a voucher with no rows would render RM 0.
// The list endpoint omits lines, so carry the backend subtotal on a single
// summary row; the detail endpoint replaces it with the real line items.
function summaryRow(pv: PaymentVoucher): PrPvRow[] {
	const subtotal = num(pv.subtotal);
	if (subtotal <= 0) return [];
	return [
		{
			i: 0,
			date: pv.issuedDate ?? "",
			day: "",
			outlet: pv.outlet ?? "",
			desc: "Weekly earnings — open voucher for line items",
			qty: 1,
			amt: subtotal,
			ref: "",
		},
	];
}

function baseVoucher(pv: PaymentVoucher, rows: PrPvRow[]): PrPaymentVoucher {
	return {
		id: pv.id,
		prName: pv.prName,
		// Through the FK, not off the voucher row — see PrPaymentVoucher.prNickname.
		prNickname: pv.prNickname ?? undefined,
		prIc: pv.prIc ?? undefined,
		outlet: pv.outlet ?? "",
		cycle: pv.cycle ?? "",
		issued: pv.issuedDate ?? "",
		due: pv.dueDate ?? "",
		rows,
		subtotal: num(pv.subtotal),
		deduct: num(pv.deduction),
		net: num(pv.net),
		status: STATUS_TO_DEMO[pv.status] ?? "PENDING_REVIEW",
		// Backend tracks the finance-head name + sign timestamp but not the
		// stored e-signature image; that stays a demo-only cosmetic field.
		financeHeadName: pv.financeHeadName ?? "",
		financeHeadSignedAt: pv.financeHeadSignedAt ?? "",
		prSignedAt: pv.prSignedAt ?? undefined,
		paidAt: pv.paidAt ?? undefined,
		bankRef: pv.bankRef ?? undefined,
		weekStartIso: pv.weekStart ?? undefined,
		weekEndIso: pv.weekEnd ?? undefined,
		prDisputeReason: pv.disputeReason ?? undefined,
		disputedAt: pv.disputedAt ?? undefined,
		disputeNote: pv.disputeNote ?? undefined,
	};
}

/** List row → demo PV (no line items; total carried on a summary row). */
export function managedPvFromBackend(pv: PaymentVoucher): PrPaymentVoucher {
	return baseVoucher(pv, summaryRow(pv));
}

/** Detail record → demo PV with real line items. */
export function managedPvFromBackendDetail(
	pv: PaymentVoucherWithLines,
): PrPaymentVoucher {
	const rows = (pv.lines ?? [])
		.slice()
		.sort((a, b) => a.sortOrder - b.sortOrder)
		.map(lineToRow);
	return baseVoucher(pv, rows.length ? rows : summaryRow(pv));
}

/** Demo edit rows → backend line inputs (dispute-resolution edit path). */
export function pvLineInputsFromRows(
	rows: PrPvRow[],
): PaymentVoucherLineInput[] {
	return rows.map((r) => ({
		lineDate: r.date || undefined,
		outlet: r.outlet || undefined,
		description: r.desc,
		quantity: r.qty,
		amount: r.amt,
		ref: r.ref || undefined,
	}));
}
