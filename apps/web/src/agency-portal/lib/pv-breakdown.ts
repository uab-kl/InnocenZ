import type { PrPaymentVoucher, PrPvRow } from "@agency-portal/lib/pr-demo";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

export type PvEarningsBreakdown = {
	wages: number;
	drinks: number;
	tips: number;
	overtime: number;
	other: number;
	/**
	 * What was TAKEN OFF this voucher — a cancellation fee, a penalty — as a
	 * negative number.
	 *
	 * ⚠️ Its own bucket because it used to share "Other", and the two cancel
	 * each other out. Both breakdown cards then rendered that row only
	 * `if (other > 0)`, so a deduction was subtracted from the subtotal and never
	 * named: live voucher PV-000001 shows four rows summing to RM 488.00 above a
	 * subtotal of RM 468.00, and nothing on the page accounts for the RM 20.
	 *
	 * A deduction is also the one bucket the owner's colour code singles out —
	 * red — which it cannot be while it is mixed into a neutral total.
	 */
	deductions: number;
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
	deduction: "deductions",
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
		deductions: 0,
		total: 0,
	};
	for (const row of rows) bucketRow(row, buckets);
	// Unchanged arithmetic: deductions used to be inside `other`, so splitting
	// them out must not move the subtotal by a cent. Only the DISPLAY changes.
	buckets.total =
		buckets.wages +
		buckets.drinks +
		buckets.tips +
		buckets.overtime +
		buckets.other +
		buckets.deductions;
	return buckets;
}

/**
 * The rows a breakdown card shows, in order — ONE definition.
 *
 * Both cards (`routes/agency/pv.tsx` and `AgencyPaidPvDetail.tsx`) carried their
 * own byte-identical copy of this list, including the `> 0` filter that hid the
 * deduction. Two copies of a money breakdown is two answers to what a voucher
 * pays.
 *
 * `!== 0` rather than `> 0`: an empty bucket is still hidden, but a NEGATIVE one
 * can no longer disappear while its money stays in the subtotal. `tone` carries
 * the owner's colour code — red for a deduction — so the caller does not
 * re-decide it per screen.
 */
export function pvBreakdownRows(
	breakdown: PvEarningsBreakdown,
	t: PortalTranslations,
): { key: string; label: string; value: number; tone?: "red" }[] {
	// Keyed on the BUCKET, not on the label: a row keyed by its translated text
	// remounts every row the moment the locale is switched.
	const rows: { key: string; label: string; value: number; tone?: "red" }[] = [
		{ key: "wages", label: t.money.dailyWages, value: breakdown.wages },
		{
			key: "drinks",
			label: t.payroll.drinkCommissions,
			value: breakdown.drinks,
		},
		{ key: "tips", label: t.payroll.tipCommissions, value: breakdown.tips },
		{
			key: "overtime",
			label: t.payroll.overtimeCheckOut,
			value: breakdown.overtime,
		},
		{ key: "other", label: t.payroll.other, value: breakdown.other },
	].filter((r) => r.value !== 0);
	// Last, and after the filter, so it always reads as the thing taken off the
	// end of the list rather than as one more kind of earning.
	if (breakdown.deductions !== 0) {
		rows.push({
			key: "deductions",
			label: t.payroll.deductions,
			value: breakdown.deductions,
			tone: "red",
		});
	}
	return rows;
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
