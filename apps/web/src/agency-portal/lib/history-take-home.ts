/**
 * THE MONEY A HISTORY SCREEN STATES — wages, and what the PR takes home.
 *
 * Pure, and in SEN while adding: these are many RM figures summed into one
 * headline, and float addition across a year of nights drifts by a sen.
 *
 * Owner default (29 Sep 2026): "History shows take-home including commission"
 * — the take-home is the headline and the wage part sits beside it, from real
 * rows only. Every part below is a stored row, never a rate-card estimate, and
 * every part is kept at the grain of ONE NIGHT (one `shift_assignment`), so the
 * header, each PR's card and each night inside a PR's sheet are the same sums
 * cut differently — the cards add up to the header by construction:
 *
 *   wages       the night's sealed wage (`shift_assignment.pay_amount`, carried
 *               on the ledger row as `wagesRm`, else `totalPayout`)
 *   overtime    that night's APPROVED overtime (`shift_assignment.overtime_amount`
 *               where `overtime_status = 'approved'`)
 *   commission  `payment_voucher_line` drink + tip commission on that night's
 *               APPROVED / VERIFIED receipts (`receipt.shift_assignment_id`)
 *   deductions  per voucher, not per night: the voucher's own `deduction` field
 *               AND its penalty LINES (`component = 'deduction'` — a cancellation
 *               fee or a weekly penalty, written negative by penalty-line.ts)
 *
 *   take-home = wages + overtime + commission − deductions
 *
 * Commission and overtime used to come from `GET /shift-sale/report`, which sums
 * the same rows at (PR × day) grain. That grain cannot say which of two nights
 * a PR worked on one day earned what (five such days in the shared DB on 29 Sep
 * 2026), so a PR's sheet could not break its own total down by outlet or night
 * without estimating. The voucher's own lines and receipts carry the assignment
 * id, so they can; the report's subquery is mirrored exactly (same components,
 * same receipt statuses) so the two agree wherever both can speak — per PR they
 * matched to the sen on the shared DB (29 Sep 2026).
 *
 * The commission per night and the penalty per voucher are answered by the
 * server in ONE read (`GET /payment-voucher/history-extras`, backend
 * history-extras.ts), which applies exactly the rules this file used to apply
 * over one voucher detail per voucher (30 Sep 2026). This file adds them up.
 *
 * Overtime rides with wages, the rule the outlet Reports already follow
 * ("overtime pay IS wages", use-outlet-sales-report `prSpend`).
 */
import type { ShiftHistoryRow } from "@agency-portal/lib/shift-history-utils";
import type { ShiftAssignment } from "@/services/shift-assignment";

type LedgerRow = Pick<
	ShiftHistoryRow,
	"prId" | "dateIso" | "totalPayout" | "wagesRm"
>;

type MoneyRow = LedgerRow &
	Pick<ShiftHistoryRow, "otRm" | "drinkCommissionRm" | "tipCommissionRm">;

export interface HistoryVoucherDeduction {
	/** `payment_voucher.pr_id` — the same user id the ledger rows carry. */
	prId?: string;
	weekStartIso?: string;
	weekEndIso?: string;
	/** `payment_voucher.deduction`, RM. */
	deduct: number;
	/**
	 * The voucher's penalty LINES, RM, as a positive figure — the negated sum of
	 * its `component = 'deduction'` lines, as the server states it
	 * (`penaltySen` from history-extras). Absent when the lines were not read.
	 */
	penaltyRm?: number;
}

export interface HistoryTakeHome {
	wagesRm: number;
	overtimeRm: number;
	commissionRm: number;
	deductionsRm: number;
	takeHomeRm: number;
}

/** One night's money beyond its wage, in SEN. */
export interface NightExtrasSen {
	overtime: number;
	drinkCommission: number;
	tipCommission: number;
}

function sen(rm: number | string | null | undefined): number {
	const n = Number(rm);
	return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** A stored date's calendar day — tolerant of a timestamp-shaped string. */
function dayOf(iso: string): string {
	return iso.slice(0, 10);
}

function wageSen(row: LedgerRow): number {
	return sen(row.wagesRm ?? row.totalPayout);
}

/** The wage part of a ledger: every listed night's sealed wage, summed. */
export function historyWagesRm(rows: LedgerRow[]): number {
	return rows.reduce((acc, r) => acc + wageSen(r), 0) / 100;
}

/**
 * A DEMO ledger's take-home: its fixture seals each night's whole payout
 * (wages, OT and commission from the demo rate card) onto `totalPayout`. A
 * demo session keeps its fixture; a real one never reaches this.
 */
export function historySealedPayoutRm(rows: LedgerRow[]): number {
	return rows.reduce((acc, r) => acc + sen(r.totalPayout), 0) / 100;
}

/**
 * APPROVED overtime per assignment, in sen.
 *
 * Tests the STATUS, not the amount: a rejected claim keeps its frozen figure
 * too (the live 279-minute claim of 2026-08-03), so "has an amount" is not
 * "was approved" — the same `case` the report's overtime column uses.
 */
export function approvedOvertimeSenByAssignment(
	assignments: Pick<
		ShiftAssignment,
		"id" | "overtimeStatus" | "overtimeAmount"
	>[],
): Map<string, number> {
	const out = new Map<string, number>();
	for (const a of assignments) {
		if (a.overtimeStatus !== "approved") continue;
		const amount = sen(a.overtimeAmount);
		if (amount !== 0) out.set(a.id, amount);
	}
	return out;
}

/**
 * A short, stable digest of what the server's take-home extras depend on that
 * this screen can SEE change: the ledger PRs' voucher ids, and the ledger's PRs.
 *
 * `GET /payment-voucher/history-extras` works both out for itself, so neither
 * is sent. The digest only goes into the query KEY: a voucher or a PR that
 * becomes relevant then re-asks, and — as when each voucher was read on its
 * own — the take-home waits for the answer rather than stating a total that is
 * missing that part. Order and repeats do not matter.
 */
export function historyExtrasInputsDigest(
	voucherIds: readonly string[],
	ledgerPrIds: readonly string[],
): string {
	const vouchers = [...new Set(voucherIds)].sort();
	const prs = [...new Set(ledgerPrIds)].sort();
	const text = `${vouchers.join(",")}|${prs.join(",")}`;
	// FNV-1a, 32-bit: a collision only costs a refresh, never a figure.
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return `${vouchers.length}.${prs.length}.${(hash >>> 0).toString(36)}`;
}

/**
 * The ledger rows with each night's own overtime and commission sealed on.
 *
 * `totalPayout` becomes wages + approved overtime + commission for that night —
 * the meaning `ShiftHistoryRow` has always documented for it, and what the demo
 * fixture already seals. `serverSealed` tells the breakdown every part is a
 * stored figure, so it never re-derives one from a rate card.
 */
export function withNightExtras<T extends ShiftHistoryRow>(
	rows: T[],
	extrasByAssignment: (assignmentId: string) => NightExtrasSen | undefined,
): T[] {
	return rows.map((row) => {
		const extras = extrasByAssignment(row.id);
		const wages = wageSen(row);
		const ot = extras?.overtime ?? 0;
		const drink = extras?.drinkCommission ?? 0;
		const tip = extras?.tipCommission ?? 0;
		return {
			...row,
			wagesRm: wages / 100,
			otRm: ot / 100,
			drinkCommissionRm: drink / 100,
			tipCommissionRm: tip / 100,
			totalPayout: (wages + ot + drink + tip) / 100,
			serverSealed: true,
		};
	});
}

/**
 * Deductions per PR, in sen: each voucher ONCE, and only when its PR worked a
 * listed night inside that voucher's week — so a filtered ledger carries the
 * deductions of the weeks it shows and no others.
 */
function deductionSenByPr(
	rows: LedgerRow[],
	vouchers: HistoryVoucherDeduction[],
): Map<string, number> {
	const daysByPr = new Map<string, string[]>();
	for (const r of rows) {
		const days = daysByPr.get(r.prId) ?? [];
		days.push(dayOf(r.dateIso));
		daysByPr.set(r.prId, days);
	}
	const out = new Map<string, number>();
	for (const v of vouchers) {
		if (!v.prId || !v.weekStartIso || !v.weekEndIso) continue;
		const amount = sen(v.deduct) + sen(v.penaltyRm);
		if (amount === 0) continue;
		const start = dayOf(v.weekStartIso);
		const end = dayOf(v.weekEndIso);
		const worked = daysByPr.get(v.prId) ?? [];
		if (!worked.some((d) => d >= start && d <= end)) continue;
		out.set(v.prId, (out.get(v.prId) ?? 0) + amount);
	}
	return out;
}

function takeHomeOf(rows: MoneyRow[], deductionSen: number): HistoryTakeHome {
	let wages = 0;
	let overtime = 0;
	let commission = 0;
	let payout = 0;
	for (const r of rows) {
		wages += wageSen(r);
		overtime += sen(r.otRm);
		commission += sen(r.drinkCommissionRm) + sen(r.tipCommissionRm);
		payout += sen(r.totalPayout);
	}
	return {
		wagesRm: wages / 100,
		overtimeRm: overtime / 100,
		commissionRm: commission / 100,
		deductionsRm: deductionSen / 100,
		// From `totalPayout`, not re-added from the parts: on a real row the two
		// are equal by construction (`withNightExtras`), and a DEMO row seals its
		// payout from unrounded commission, where the parts can sit a sen away.
		takeHomeRm: (payout - deductionSen) / 100,
	};
}

/** The whole ledger's take-home — the History header. */
export function historyTakeHome(input: {
	rows: MoneyRow[];
	vouchers: HistoryVoucherDeduction[];
}): HistoryTakeHome {
	const byPr = deductionSenByPr(input.rows, input.vouchers);
	const deductions = [...byPr.values()].reduce((a, b) => a + b, 0);
	return takeHomeOf(input.rows, deductions);
}

/**
 * Each PR's own take-home over the same rows — the History cards. Summing these
 * gives `historyTakeHome` exactly: wages, overtime and commission are per night,
 * and each voucher belongs to one PR.
 */
export function historyTakeHomeByPr(input: {
	rows: MoneyRow[];
	vouchers: HistoryVoucherDeduction[];
}): Map<string, HistoryTakeHome> {
	const deductionsByPr = deductionSenByPr(input.rows, input.vouchers);
	const rowsByPr = new Map<string, MoneyRow[]>();
	for (const r of input.rows) {
		const list = rowsByPr.get(r.prId) ?? [];
		list.push(r);
		rowsByPr.set(r.prId, list);
	}
	const out = new Map<string, HistoryTakeHome>();
	for (const [prId, prRows] of rowsByPr) {
		out.set(prId, takeHomeOf(prRows, deductionsByPr.get(prId) ?? 0));
	}
	return out;
}
