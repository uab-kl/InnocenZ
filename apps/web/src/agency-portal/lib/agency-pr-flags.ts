import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";

export const RATING_WARN_THRESHOLD = 3.5;
export const RATING_SUSPEND_SHIFT_THRESHOLD = 3.0;
export const CONSECUTIVE_LOW_SUSPEND_COUNT = 3;
const TIED_MIN_MS = 365 * 86400000;

export function prTiedSinceMs(pr: AgencyManagedPR): number {
	return pr.tiedSince
		? new Date(pr.tiedSince).getTime()
		: Date.now() - 400 * 86400000;
}

export function isPrTiedUnderOneYear(
	pr: AgencyManagedPR,
	now = Date.now(),
): boolean {
	return now - prTiedSinceMs(pr) < TIED_MIN_MS;
}

export function tiedMonthsLabel(pr: AgencyManagedPR, now = Date.now()): string {
	const months = Math.max(
		0,
		Math.floor((now - prTiedSinceMs(pr)) / (30 * 86400000)),
	);
	return months < 12 ? `${months} mo` : `${Math.floor(months / 12)} yr`;
}

export type AgencyPrFlagLevel = "ok" | "warn" | "suspend";

/** Agency roster availability — suspended or detached PRs are inactive. */
export function isAgencyPrActive(pr: AgencyManagedPR): boolean {
	return !pr.suspended && !pr.detached;
}

/**
 * `average` is the PR's real mean rating, or null when they have never been
 * rated. It defaults to the record's own `rating` so existing callers are
 * unaffected; pass it explicitly wherever the true average is known.
 *
 * An unrated PR is not a poor performer, so a null average never warns. That
 * matters now that backend PRs arrive with `rating: 0` as a placeholder — every
 * one of them used to trip the "below 3.5★" warning on sight.
 */
export function getAgencyPrFlags(
	pr: AgencyManagedPR,
	average: number | null = pr.rating,
) {
	const consecutiveLow = pr.consecutiveLowRatings ?? 0;
	const warnLowAvg = average !== null && average < RATING_WARN_THRESHOLD;
	const suspendStreak = consecutiveLow >= CONSECUTIVE_LOW_SUSPEND_COUNT;
	const tiedUnderOneYear = isPrTiedUnderOneYear(pr);

	let level: AgencyPrFlagLevel = "ok";
	if (suspendStreak) level = "suspend";
	else if (warnLowAvg || consecutiveLow > 0) level = "warn";

	return {
		warnLowAvg,
		consecutiveLow,
		suspendStreak,
		tiedUnderOneYear,
		level,
		warnLabel: warnLowAvg
			? `Avg ${(average ?? 0).toFixed(1)}★ · below ${RATING_WARN_THRESHOLD}★`
			: null,
		suspendLabel: suspendStreak
			? `${CONSECUTIVE_LOW_SUSPEND_COUNT} consecutive shifts below ${RATING_SUSPEND_SHIFT_THRESHOLD}★`
			: consecutiveLow > 0
				? `${consecutiveLow}/${CONSECUTIVE_LOW_SUSPEND_COUNT} low-shift streak`
				: null,
	};
}
