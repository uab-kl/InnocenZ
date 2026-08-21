/**
 * Cancellation & lateness rules for agency-managed PR shifts.
 *
 * The three notice bands are NO LONGER defined here — they are the agency's
 * `cancellation` penalty rule (migration 0115), edited on Manage PR. Every
 * function below takes that rule as an argument rather than reading a module
 * constant, which is deliberate: the previous constants were duplicated in
 * three places that had drifted apart, and a PR cancelling 6 hours out was
 * SHOWN -50% while being CHARGED -25%. A required parameter makes that class of
 * drift impossible — a caller cannot forget to use the configured value,
 * because there is nothing else to use.
 */
import {
	type CancellationRule,
	DEFAULT_PENALTY_RULES,
} from "@agency-portal/lib/pr-penalties";

export const CANCEL_RULES = {
	/** Arriving more than this many minutes after shift start triggers wage deduction */
	lateArrivalMinutes: 15,
	defaultDailyWagesRm: 350,
} as const;

/** Fallback only, for surfaces that have not loaded the agency's rule yet. */
export const DEFAULT_CANCELLATION_RULE: CancellationRule =
	DEFAULT_PENALTY_RULES.cancellation;

export type CancellationTier = "safe" | "short_notice" | "penalty";

export interface CancellationEvaluation {
	tier: CancellationTier;
	hoursUntilStart: number;
	deductionRm: number;
	headline: string;
	detail: string;
}

/**
 * Malaysia is UTC+8 all year — no DST — so a fixed offset is exact. The third
 * statement of this constant in the repo, alongside the backend's
 * `slot-window.ts` and the PR app's `lib/venue-time.ts`; the day a venue is not
 * Malaysian, all three move onto the outlet row together.
 */
const VENUE_UTC_OFFSET_MINUTES = 8 * 60;

/**
 * A shift's start as a real instant, read in the VENUE's timezone.
 *
 * ⚠️ This built the date with `new Date(y, m, d, hh, mm)` — the local-time
 * constructor, which here resolves the wall clock in the BROWSER's timezone.
 * That is right only while every operator's device is set to Malaysia. It is the
 * web copy of the defect fixed in the backend's cancel-fee path and in the PR
 * app, where the same drift was eight hours and moved real money.
 *
 * Lower stakes than those two — `outletShiftStarted` gates a display, not a
 * charge — but the same rule, because "has this shift started" is a question
 * about the venue's clock and nobody else's.
 */
export function shiftStartMs(dateIso: string, shiftStart: string): number {
	const [y, m, d] = dateIso.split("-").map(Number);
	const [hh, mm] = shiftStart.split(":").map(Number);
	const midnight =
		Date.UTC(y as number, (m as number) - 1, d as number) -
		VENUE_UTC_OFFSET_MINUTES * 60_000;
	return midnight + ((hh || 0) * 60 + (mm || 0)) * 60_000;
}

export function hoursUntilShiftStart(
	now: Date,
	dateIso: string,
	shiftStart: string,
): number {
	const diff = shiftStartMs(dateIso, shiftStart) - now.getTime();
	return diff / (60 * 60 * 1000);
}

export function evaluateShiftCancellation(
	now: Date,
	dateIso: string,
	shiftStart: string,
	dailyWagesRm: number = CANCEL_RULES.defaultDailyWagesRm,
	rule: CancellationRule = DEFAULT_CANCELLATION_RULE,
): CancellationEvaluation {
	const hours = hoursUntilShiftStart(now, dateIso, shiftStart);

	// A disabled rule is not "0% everywhere" — it is no cancellation charge at
	// all, so the PR must not be shown a deduction line they will never be
	// billed for.
	if (!rule.enabled || hours >= rule.freeCancelHours) {
		return {
			tier: "safe",
			hoursUntilStart: hours,
			deductionRm: 0,
			headline: "On time notice — no pay deduction",
			detail: rule.enabled
				? `${Math.floor(hours)}h+ before shift · your agency will reassign coverage.`
				: "Your agency does not charge for cancellations.",
		};
	}

	if (hours >= rule.shortNoticeHours) {
		const deductionRm = Math.round((dailyWagesRm * rule.shortNoticePct) / 100);
		return {
			tier: "short_notice",
			hoursUntilStart: hours,
			deductionRm,
			headline: `Short notice — −RM ${deductionRm} from next PV`,
			detail: `Less than ${rule.freeCancelHours}h but more than ${rule.shortNoticeHours}h before start.`,
		};
	}

	const deductionRm = Math.round((dailyWagesRm * rule.lateCancelPct) / 100);
	const lateLabel =
		hours <= 0
			? "Shift already started or passed"
			: `Less than ${rule.shortNoticeHours}h before start`;
	return {
		tier: "penalty",
		hoursUntilStart: hours,
		deductionRm,
		headline: `Late cancel — −RM ${deductionRm} from next PV`,
		detail: `${lateLabel} · same rule as arriving ${CANCEL_RULES.lateArrivalMinutes}+ min late.`,
	};
}

export function evaluateLateArrival(
	minutesLate: number,
	dailyWagesRm: number = CANCEL_RULES.defaultDailyWagesRm,
	rule: CancellationRule = DEFAULT_CANCELLATION_RULE,
): { applies: boolean; deductionRm: number; headline: string } {
	if (minutesLate <= CANCEL_RULES.lateArrivalMinutes) {
		return {
			applies: false,
			deductionRm: 0,
			headline: `Within ${CANCEL_RULES.lateArrivalMinutes} min grace — no deduction`,
		};
	}
	// Arriving very late has always been charged at the late-CANCEL rate: the
	// shift is as good as dropped. It follows the configured percentage for the
	// same reason.
	const deductionRm = Math.round((dailyWagesRm * rule.lateCancelPct) / 100);
	return {
		applies: true,
		deductionRm,
		headline: `${minutesLate} min late — −RM ${deductionRm} wage deduction`,
	};
}

/**
 * The three bands as display rows, derived from the agency's rule.
 *
 * A function, not a constant: the old constant was a second copy of the numbers
 * the evaluator used, and the two drifted — which is exactly how the PR panel
 * came to advertise a 12h boundary that nothing charged against.
 */
export function cancellationRuleSummary(
	rule: CancellationRule = DEFAULT_CANCELLATION_RULE,
): { label: string; outcome: string; tone: "green" | "amber" | "red" }[] {
	if (!rule.enabled) {
		return [
			{
				label: "Any time before shift",
				outcome: "Free cancel — your agency charges no cancellation fee",
				tone: "green",
			},
		];
	}
	return [
		{
			label: `${rule.freeCancelHours}h+ before shift`,
			outcome: "Cancel or mark unavailable — no deduction",
			tone: "green",
		},
		{
			label: `${rule.shortNoticeHours}h – ${rule.freeCancelHours}h before`,
			outcome: `−${rule.shortNoticePct}% daily wages on next PV`,
			tone: "amber",
		},
		{
			label: `<${rule.shortNoticeHours}h before OR ${CANCEL_RULES.lateArrivalMinutes}+ min late`,
			outcome: `−${rule.lateCancelPct}% daily wages on next PV`,
			tone: "red",
		},
	];
}
