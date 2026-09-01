import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

/**
 * One day a PR has declared themselves not available to work.
 *
 * The row's EXISTENCE is the block — there is no `available` flag. Keyed on the
 * PERSON server-side (`user_id`), so a PR on two agencies' books is unavailable
 * to both; this agency simply cannot see the ones outside its own roster.
 */
export interface PrAvailabilityRow {
	id: string;
	/** The PR's user id — the same id `AgencyRosterSlot.prId` carries. */
	userId: string;
	/** 'YYYY-MM-DD'. */
	unavailableDate: string;
	reason: string | null;
	prName: string | null;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

/**
 * Blocked days across this agency's own roster for a window.
 *
 * Agency-scoped server-side through `agency_pr` — the endpoint has no PR id to
 * tamper with, and an agency never sees the calendar of someone who is not its
 * approved member.
 */
export async function fetchPrAvailability(
	params: { from?: string; to?: string; prId?: string },
	onRefreshFail: () => void,
): Promise<PrAvailabilityRow[]> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		from: params.from,
		to: params.to,
		prId: params.prId,
	});
	const response = await client.get<{
		success: boolean;
		message: string;
		data: PrAvailabilityRow[];
	}>(`/pr-availability${queryString}`);
	return response.data.data ?? [];
}

/**
 * Blocked days folded into `prId -> Set<'YYYY-MM-DD'>`, which is the shape both
 * the week grid and the auto-assign planner actually ask questions in
 * ("is this PR blocked on this date?"). Built once per fetch rather than
 * re-derived per cell — the grid asks it PRs × 7 times per render.
 */
export function blockedDatesByPr(
	rows: PrAvailabilityRow[],
): Map<string, Set<string>> {
	const byPr = new Map<string, Set<string>>();
	for (const row of rows) {
		const set = byPr.get(row.userId) ?? new Set<string>();
		set.add(row.unavailableDate);
		byPr.set(row.userId, set);
	}
	return byPr;
}

/** Key for `blockedReasons` — one PR on one day. */
export function blockedReasonKey(prId: string, dateIso: string): string {
	return `${prId}__${dateIso}`;
}

/**
 * The PR's own words for why, keyed `prId__YYYY-MM-DD`.
 *
 * Kept SEPARATE from `blockedDatesByPr` rather than widening it to a nested map:
 * the reason is display-only, and every caller that decides something — the
 * auto-assign planner, the assign dialog — asks the yes/no question and would
 * otherwise carry a payload it must not branch on. A blocked day with no reason
 * simply has no entry; absence here never means "not blocked".
 */
export function blockedReasonsByPr(
	rows: PrAvailabilityRow[],
): Map<string, string> {
	const byKey = new Map<string, string>();
	for (const row of rows) {
		const reason = row.reason?.trim();
		if (reason)
			byKey.set(blockedReasonKey(row.userId, row.unavailableDate), reason);
	}
	return byKey;
}

/**
 * A window this agency's PR is already working for SOMEONE ELSE.
 *
 * Times only — no agency, no outlet, no shift id. That is the whole payload the
 * backend will give, deliberately: an agency must know WHEN its own roster member
 * cannot be booked, or it cannot roster around them, and is entitled to nothing
 * beyond that. Naming the venue would hand over a rival's client.
 */
export type PrCommittedWindow = {
	userId: string;
	/** YYYY-MM-DD. */
	date: string;
	/** "15:00 - 04:00", or null for a label-only shift that carries no window. */
	slot: string | null;
};

export async function fetchPrCommittedWindows(
	params: { from?: string; to?: string; prId?: string },
	onRefreshFail: () => void,
): Promise<PrCommittedWindow[]> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		from: params.from,
		to: params.to,
		prId: params.prId,
	});
	const response = await client.get<{
		success: boolean;
		message: string;
		data: PrCommittedWindow[];
	}>(`/pr-availability/committed${queryString}`);
	return response.data.data ?? [];
}

/**
 * Committed windows folded into `prId -> date -> slots`, the shape the week grid
 * asks its question in ("is this PR busy that day, and when?").
 *
 * SEPARATE from `blockedDatesByPr`, and it must stay separate: a self-declared
 * block takes the whole DAY and the agency cannot book around it, while these are
 * time windows the agency very much can book around — that is the entire point of
 * the rule change. Merging them would flatten a bookable day into an unbookable
 * one and undo it.
 *
 * A window with no slot still registers the date with an empty entry, so a
 * label-only shift shows as "busy, time unknown" rather than vanishing.
 */
export function committedWindowsByPr(
	rows: PrCommittedWindow[],
): Map<string, Map<string, string[]>> {
	const byPr = new Map<string, Map<string, string[]>>();
	for (const row of rows) {
		const byDate = byPr.get(row.userId) ?? new Map<string, string[]>();
		const slots = byDate.get(row.date) ?? [];
		const slot = row.slot?.trim();
		if (slot && !slots.includes(slot)) slots.push(slot);
		// A windowless row (label-only slot, stripped to null at the server's
		// privacy boundary) still REGISTERS its date: an empty array here is
		// the signal "spoken for at an unknown hour", which the grid, the
		// assign sheet and the live badge all read the same way.
		byDate.set(row.date, slots);
		byPr.set(row.userId, byDate);
	}
	return byPr;
}
