/**
 * PR pay class + the AGENCY's penalty-rule configuration.
 *
 * These rules used to belong to an outlet workspace. They moved to the agency
 * in migration 0113: the fine lands as a deduction on the agency→PR payment
 * voucher, which the outlet neither pays nor sees, and two of the three rules
 * count things no single outlet can observe — shifts across every venue, and MC
 * that only the agency approves. Per-outlet rules fined a PR once per venue for
 * one week's conduct.
 */

import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import type {
	AgencyPenaltyRuleRow,
	SavePenaltyRuleInput,
} from "@/services/agency-penalty-rules";

/** Employment arrangement — a commissionOnly PR earns no basic wage (RM 0 daily). */
export type PrPayClass = "basic" | "commissionOnly";

export const PR_PAY_CLASSES: readonly PrPayClass[] = [
	"basic",
	"commissionOnly",
] as const;

/**
 * Display label per pay class. Resolver functions, not strings and not keys —
 * a dictionary key is itself a `string`, so rendering one type-checks and ships
 * the key name to screen. The record KEYS stay the `PrPayClass` enum.
 */
export const PR_PAY_CLASS_LABELS: Record<
	PrPayClass,
	(t: PortalTranslations) => string
> = {
	basic: (t) => t.managePr.payClassBasic,
	commissionOnly: (t) => t.managePr.payClassCommissionOnly,
};

/** One entry in a PR's pay-class audit trail — the class takes effect from `fromIso`. */
export interface PrPayClassChange {
	payClass: PrPayClass;
	/** Effective date, ISO yyyy-mm-dd. */
	fromIso: string;
}

/** Resolve a PR's pay class — defaults to basic so legacy profiles stay valid. */
export function prPayClass(pr: { payClass?: PrPayClass }): PrPayClass {
	return pr.payClass ?? "basic";
}

/**
 * The pay class in force on a given date: the latest history entry whose
 * `fromIso` is on or before `dateIso`. Falls back to the current `payClass`
 * (then basic) when there's no applicable history — so legacy/un-migrated PRs
 * and dates before the first recorded change resolve safely.
 */
export function prPayClassOnDate(
	pr: { payClass?: PrPayClass; payClassHistory?: PrPayClassChange[] },
	dateIso: string,
): PrPayClass {
	const applicable = (pr.payClassHistory ?? [])
		.filter((c) => c.fromIso <= dateIso)
		.sort((a, b) =>
			a.fromIso < b.fromIso ? -1 : a.fromIso > b.fromIso ? 1 : 0,
		);
	const latest = applicable[applicable.length - 1];
	return latest?.payClass ?? prPayClass(pr);
}

/**
 * Record a pay-class change on a PR's history, effective from `fromIso`, and
 * set it as the current class. Immutable — returns the fields to merge. Collapses
 * a same-date entry so re-editing a future-dated change doesn't duplicate it.
 */
export function applyPayClassChange(
	pr: { payClass?: PrPayClass; payClassHistory?: PrPayClassChange[] },
	next: PrPayClass,
	fromIso: string,
): { payClass: PrPayClass; payClassHistory: PrPayClassChange[] } {
	const history = (pr.payClassHistory ?? []).filter(
		(c) => c.fromIso !== fromIso,
	);
	return {
		payClass: next,
		payClassHistory: [...history, { payClass: next, fromIso }].sort((a, b) =>
			a.fromIso < b.fromIso ? -1 : a.fromIso > b.fromIso ? 1 : 0,
		),
	};
}

/**
 * Shared shape for every penalty rule.
 *
 * No pay-class target: an enabled rule binds EVERY PR on the roster. The
 * `appliesTo` list it replaces could be emptied, which meant "enforced against
 * nobody" while the row still read as enabled — an off switch hiding behind an
 * on one.
 */
export interface PenaltyRuleBase {
	enabled: boolean;
	/** RM fine per breach — 0 = warning only, no money. */
	fineRm: number;
}

export interface MinShiftsPerWeekRule extends PenaltyRuleBase {
	/** PR must work at least this many shifts each week. */
	minShiftsPerWeek: number;
}

export interface MaxMcPerMonthRule extends PenaltyRuleBase {
	/** Allowed medical certificates per calendar month before a fine applies. */
	maxMcPerMonth: number;
	/** Fine charged per MC over the cap (multiplied by the overage). */
	finePerExcessRm: number;
}

export interface LatePerWeekRule extends PenaltyRuleBase {
	/** Being late this many times within a week triggers the fine. */
	maxLatePerWeek: number;
	/** Minutes after shift start before a check-in counts as late. */
	graceMinutes: number;
}

/**
 * Cancelling a booked shift, charged as a % of THAT shift's daily wage.
 *
 * Three bands, defined by two boundaries: at or above `freeCancelHours` notice
 * is free, at or above `shortNoticeHours` costs `shortNoticePct`, and anything
 * later costs `lateCancelPct`. Percentages rather than a flat `fineRm` because
 * the charge scales with the shift being dropped.
 *
 * Unlike the other three this is NOT a weekly-window rule — it is charged per
 * shift at the moment of cancelling, so `evaluatePrPenalties` ignores it.
 */
export interface CancellationRule extends PenaltyRuleBase {
	/** Notice at or above this many hours → free cancel. */
	freeCancelHours: number;
	/** Notice at or above this (but under free) → `shortNoticePct`. */
	shortNoticeHours: number;
	/** % of daily wage charged in the short-notice band. */
	shortNoticePct: number;
	/** % of daily wage charged below `shortNoticeHours`. */
	lateCancelPct: number;
}

export interface AgencyPenaltyRules {
	minShiftsPerWeek: MinShiftsPerWeekRule;
	maxMcPerMonth: MaxMcPerMonthRule;
	latePerWeek: LatePerWeekRule;
	cancellation: CancellationRule;
}

export const DEFAULT_PENALTY_RULES: AgencyPenaltyRules = {
	minShiftsPerWeek: {
		enabled: true,
		fineRm: 50,
		minShiftsPerWeek: 3,
	},
	maxMcPerMonth: {
		enabled: true,
		fineRm: 0,
		maxMcPerMonth: 2,
		finePerExcessRm: 80,
	},
	latePerWeek: {
		enabled: true,
		fineRm: 30,
		maxLatePerWeek: 2,
		graceMinutes: 15,
	},
	// 24 / 2 / 25 / 50 — what the cancellation code actually CHARGED before it
	// became configurable, not the 12h the PR panel used to display. Seeding the
	// displayed number would have changed everyone's bill.
	cancellation: {
		enabled: true,
		fineRm: 0,
		freeCancelHours: 24,
		shortNoticeHours: 2,
		shortNoticePct: 25,
		lateCancelPct: 50,
	},
};

/**
 * Merge persisted/partial penalty rules over defaults — back-compat safe.
 *
 * A pre-0114 persisted blob still carries `appliesTo` on each rule. Spreading
 * it through is harmless (nothing reads it any more) and stripping it would
 * cost a pass over every rule for no behavioural gain, so it is left to age
 * out. What matters is that it can no longer narrow who a rule binds.
 */
export function normalizePenaltyRules(
	rules: Partial<AgencyPenaltyRules> | undefined,
): AgencyPenaltyRules {
	const d = DEFAULT_PENALTY_RULES;
	return {
		minShiftsPerWeek: { ...d.minShiftsPerWeek, ...rules?.minShiftsPerWeek },
		maxMcPerMonth: { ...d.maxMcPerMonth, ...rules?.maxMcPerMonth },
		latePerWeek: { ...d.latePerWeek, ...rules?.latePerWeek },
		cancellation: { ...d.cancellation, ...rules?.cancellation },
	};
}

/**
 * Backend rows → the keyed object the editor works with.
 *
 * Merged over the defaults on purpose: an agency that has saved only a lateness
 * rule must still render three rows, or the two it never configured would look
 * deleted rather than unset. A rule the backend does not have therefore comes
 * back as its default with whatever `enabled` the default carries — it is not
 * enforced until saved, because `evaluatePrPenalties` only ever runs against
 * what the server returned.
 */
export function penaltyRulesFromBackend(
	rows: AgencyPenaltyRuleRow[] | null | undefined,
): AgencyPenaltyRules {
	const rules = normalizePenaltyRules(undefined);
	const num = (v: string | null | undefined, fallback: number): number =>
		v == null || v === "" ? fallback : Number(v);

	for (const row of rows ?? []) {
		if (row.ruleType === "min_shifts_per_week") {
			rules.minShiftsPerWeek = {
				enabled: row.enabled,
				fineRm: num(row.fineRm, 0),
				minShiftsPerWeek:
					row.minShiftsPerWeek ??
					DEFAULT_PENALTY_RULES.minShiftsPerWeek.minShiftsPerWeek,
			};
		} else if (row.ruleType === "max_mc_per_month") {
			rules.maxMcPerMonth = {
				enabled: row.enabled,
				fineRm: num(row.fineRm, 0),
				maxMcPerMonth:
					row.maxMcPerMonth ??
					DEFAULT_PENALTY_RULES.maxMcPerMonth.maxMcPerMonth,
				finePerExcessRm: num(
					row.finePerExcessRm,
					DEFAULT_PENALTY_RULES.maxMcPerMonth.finePerExcessRm,
				),
			};
		} else if (row.ruleType === "late_per_week") {
			rules.latePerWeek = {
				enabled: row.enabled,
				fineRm: num(row.fineRm, 0),
				maxLatePerWeek:
					row.maxLatePerWeek ??
					DEFAULT_PENALTY_RULES.latePerWeek.maxLatePerWeek,
				graceMinutes:
					row.graceMinutes ?? DEFAULT_PENALTY_RULES.latePerWeek.graceMinutes,
			};
		} else if (row.ruleType === "cancellation") {
			const d = DEFAULT_PENALTY_RULES.cancellation;
			rules.cancellation = {
				enabled: row.enabled,
				fineRm: num(row.fineRm, 0),
				freeCancelHours: row.freeCancelHours ?? d.freeCancelHours,
				shortNoticeHours: row.shortNoticeHours ?? d.shortNoticeHours,
				shortNoticePct: row.shortNoticePct ?? d.shortNoticePct,
				lateCancelPct: row.lateCancelPct ?? d.lateCancelPct,
			};
		}
	}
	return rules;
}

/** Reverse: the keyed object → the PUT payload (all three rules, always). */
export function penaltyRulesSaveInput(
	rules: AgencyPenaltyRules,
): SavePenaltyRuleInput[] {
	return [
		{
			ruleType: "min_shifts_per_week" as const,
			enabled: rules.minShiftsPerWeek.enabled,
			fineRm: rules.minShiftsPerWeek.fineRm,
			minShiftsPerWeek: rules.minShiftsPerWeek.minShiftsPerWeek,
		},
		{
			ruleType: "max_mc_per_month" as const,
			enabled: rules.maxMcPerMonth.enabled,
			fineRm: rules.maxMcPerMonth.fineRm,
			maxMcPerMonth: rules.maxMcPerMonth.maxMcPerMonth,
			finePerExcessRm: rules.maxMcPerMonth.finePerExcessRm,
		},
		{
			ruleType: "late_per_week" as const,
			enabled: rules.latePerWeek.enabled,
			fineRm: rules.latePerWeek.fineRm,
			maxLatePerWeek: rules.latePerWeek.maxLatePerWeek,
			graceMinutes: rules.latePerWeek.graceMinutes,
		},
		{
			ruleType: "cancellation" as const,
			enabled: rules.cancellation.enabled,
			fineRm: rules.cancellation.fineRm,
			freeCancelHours: rules.cancellation.freeCancelHours,
			shortNoticeHours: rules.cancellation.shortNoticeHours,
			shortNoticePct: rules.cancellation.shortNoticePct,
			lateCancelPct: rules.cancellation.lateCancelPct,
		},
	];
}

/** Per-PR attendance signals. undefined = unknown (not treated as a breach). */
export interface PrAttendanceWindow {
	/**
	 * Shifts the AGENCY assigned that week, whatever became of them —
	 * opportunity, not attendance. Safety net on the minimum-shifts rule.
	 */
	assignedThisWeek?: number;
	/** Assigned shifts the agency EXCUSED (approved MC/leave) — not opportunity. */
	excusedThisWeek?: number;
	/**
	 * Cancellations that week the PR ALREADY PAID a fee for — sealed above zero
	 * and not waived. Also removed from the opportunity, so one absence is not
	 * charged twice: a proportional cancel fee AND the flat below-minimum fine
	 * it helped cause (owner's call, 20 Aug 2026).
	 *
	 * Free cancels (24h+ notice) and waived ones are NOT counted here, so they
	 * still read as missed — nothing was taken for them, so counting them is a
	 * first charge, not a second.
	 */
	paidCancellationsThisWeek?: number;
	shiftsThisWeek?: number;
	lateThisWeek?: number;
	mcThisMonth?: number;
}

export type PenaltyRuleId = keyof AgencyPenaltyRules;

export interface PenaltyBreach {
	ruleId: PenaltyRuleId;
	label: string;
	detail: string;
	/** Computed fine in RM — 0 means warning only. */
	fineRm: number;
}

/** Read a PR's demo counters into an evaluation window. */
export function prAttendanceWindow(pr: {
	assignedThisWeek?: number;
	/** Assigned shifts the agency EXCUSED (approved MC/leave) — not opportunity. */
	excusedThisWeek?: number;
	/** Cancellations already paid for — see PrAttendanceWindow. */
	paidCancellationsThisWeek?: number;
	shiftsThisWeek?: number;
	lateThisWeek?: number;
	mcThisMonth?: number;
}): PrAttendanceWindow {
	return {
		assignedThisWeek: pr.assignedThisWeek,
		excusedThisWeek: pr.excusedThisWeek,
		paidCancellationsThisWeek: pr.paidCancellationsThisWeek,
		shiftsThisWeek: pr.shiftsThisWeek,
		lateThisWeek: pr.lateThisWeek,
		mcThisMonth: pr.mcThisMonth,
	};
}

/**
 * Evaluate a PR's attendance window against their agency's penalty rules.
 *
 * Every enabled rule binds every PR — there is no pay-class argument, so a rule
 * cannot be enabled yet enforced against nobody.
 */
export function evaluatePrPenalties(
	window: PrAttendanceWindow,
	rules: AgencyPenaltyRules,
): PenaltyBreach[] {
	const breaches: PenaltyBreach[] = [];

	const min = rules.minShiftsPerWeek;
	// SAFETY NET: you cannot work shifts you were never given, and you cannot
	// work the ones you were excused from. Opportunity = assigned MINUS approved
	// MC/leave. `?? Infinity` on assigned so an UNKNOWN count never silently
	// excuses a real breach — only a known-too-low one does; `?? 0` on excused
	// for the same reason in the other direction. Mirrors the backend guard in
	// pr-penalty.ts; if the two disagree the agency sees one number on screen
	// and another on the voucher.
	// Mirrors pr-penalty.ts exactly — see that file's header. Opportunity is
	// assigned MINUS approved leave MINUS cancellations already paid for, so one
	// absence is never billed twice.
	const opportunity =
		(window.assignedThisWeek ?? Number.POSITIVE_INFINITY) -
		(window.excusedThisWeek ?? 0) -
		(window.paidCancellationsThisWeek ?? 0);
	if (
		min.enabled &&
		opportunity >= min.minShiftsPerWeek &&
		window.shiftsThisWeek != null &&
		window.shiftsThisWeek < min.minShiftsPerWeek
	) {
		breaches.push({
			ruleId: "minShiftsPerWeek",
			label: "Below minimum shifts",
			detail: `${window.shiftsThisWeek} of ${min.minShiftsPerWeek} shifts this week`,
			fineRm: min.fineRm,
		});
	}

	const mc = rules.maxMcPerMonth;
	if (
		mc.enabled &&
		window.mcThisMonth != null &&
		window.mcThisMonth > mc.maxMcPerMonth
	) {
		const excess = window.mcThisMonth - mc.maxMcPerMonth;
		breaches.push({
			ruleId: "maxMcPerMonth",
			label: "MC cap exceeded",
			detail: `${window.mcThisMonth} MC this month · cap ${mc.maxMcPerMonth}`,
			fineRm: mc.fineRm + excess * mc.finePerExcessRm,
		});
	}

	const late = rules.latePerWeek;
	if (
		late.enabled &&
		window.lateThisWeek != null &&
		window.lateThisWeek >= late.maxLatePerWeek
	) {
		breaches.push({
			ruleId: "latePerWeek",
			label: "Late too often",
			detail: `Late ${window.lateThisWeek}× this week · limit ${late.maxLatePerWeek}`,
			fineRm: late.fineRm,
		});
	}

	return breaches;
}

/** Sum of every breach fine (RM). */
export function totalPenaltyFineRm(breaches: PenaltyBreach[]): number {
	return breaches.reduce((sum, b) => sum + b.fineRm, 0);
}

/** Total RM to deduct from a PR's next payout for their current penalty breaches. */
export function penaltyDeductRmForPr(
	pr: {
		shiftsThisWeek?: number;
		lateThisWeek?: number;
		mcThisMonth?: number;
	},
	rules: AgencyPenaltyRules,
): number {
	return totalPenaltyFineRm(evaluatePrPenalties(prAttendanceWindow(pr), rules));
}
