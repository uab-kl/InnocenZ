import type { PrPaymentVoucher, PrPvRow } from "@agency-portal/lib/pr-demo";

export type PvEarningsBreakdown = {
	wages: number;
	drinks: number;
	tips: number;
	overtime: number;
	other: number;
	total: number;
};

/** `payment_voucher_line.component` -> the breakdown's five buckets. */
const BUCKET_BY_COMPONENT: Readonly<
	Record<string, keyof Omit<PvEarningsBreakdown, "total">>
> = {
	wages: "wages",
	drink_commission: "drinks",
	tip_commission: "tips",
	ot: "overtime",
	deduction: "other",
	other: "other",
};

/**
 * Which bucket a line's money belongs to.
 *
 * The typed `component` column decides whenever the row has one. The description
 * search below is the FALLBACK, for demo rows that carry no column — it used to
 * be the ONLY rule, classifying by hunting the description text for "wage", so a
 * real wage line described "Friday lounge" fell through to Other and the agency
 * read RM 0.00 of wages on a RM 700.00 wage voucher. A description is a label a
 * human typed; it was never a classification.
 */
function bucketRow(row: PrPvRow, buckets: PvEarningsBreakdown) {
	const amt = row.amt;
	const fromColumn = row.component
		? BUCKET_BY_COMPONENT[row.component]
		: undefined;
	if (fromColumn) {
		buckets[fromColumn] += amt;
		return;
	}
	const d = row.desc.toLowerCase();
	if (d.includes("wage") || d.includes("daily pay")) buckets.wages += amt;
	else if (d.includes("drink")) buckets.drinks += amt;
	else if (d.includes("tip")) buckets.tips += amt;
	else if (d.includes("overtime") || d.includes(" ot")) buckets.overtime += amt;
	else buckets.other += amt;
}

export function summarizePvRows(rows: PrPvRow[] = []): PvEarningsBreakdown {
	const buckets: PvEarningsBreakdown = {
		wages: 0,
		drinks: 0,
		tips: 0,
		overtime: 0,
		other: 0,
		total: 0,
	};
	for (const row of rows) bucketRow(row, buckets);
	buckets.total =
		buckets.wages +
		buckets.drinks +
		buckets.tips +
		buckets.overtime +
		buckets.other;
	return buckets;
}

export function summarizePv(pv: PrPaymentVoucher): PvEarningsBreakdown {
	return summarizePvRows(pv.rows ?? []);
}

export const PV_WORKFLOW_STEPS = [
	{ key: "raise", label: "Raise PV" },
	{ key: "finance", label: "Finance sign" },
	{ key: "sent", label: "Sent to PR" },
	{ key: "signed", label: "PR signed" },
	{ key: "paid", label: "Paid (Fri cron)" },
] as const;

export function pvWorkflowStepIndex(
	status: PrPaymentVoucher["status"],
): number {
	if (status === "PAID") return 4;
	if (status === "SIGNED") return 3;
	if (status === "SENT") return 2;
	if (status === "DISPUTED") return 2;
	if (status === "PENDING_REVIEW") return 1;
	return 0;
}

export function disputeDaysRemaining(disputedAt?: string): number | null {
	if (!disputedAt) return null;
	const m = disputedAt.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
	if (!m) return null;
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
	const idx = months.findIndex((x) => x.startsWith(mon));
	if (idx < 0) return null;
	const raised = new Date(
		parseInt(m[3], 10),
		idx,
		parseInt(m[1], 10),
	).getTime();
	const deadline = raised + 7 * 86400000;
	return Math.max(0, Math.ceil((deadline - Date.now()) / 86400000));
}
