import type { PrPersonnel } from "@/services/pr-personnel";
import type { Shift } from "@/services/shift";
import type {
	ShiftAssignment,
	ShiftAssignmentStatus,
} from "@/services/shift-assignment";

/**
 * Assignment statuses that leave the slot open again — mirrors the backend's
 * NON_STAFFING_STATUSES (shift-assignment.repository.ts). A cancelled, no-show
 * or leave-approved PR is not staffing the shift, so the slot is fillable.
 */
const NON_STAFFING_STATUSES: readonly ShiftAssignmentStatus[] = [
	"cancelled",
	"no_show",
	"leave_approved",
];

/**
 * Shift statuses an agency may staff. Drafts are not published yet and sealed
 * shifts are closed for payroll, so neither takes new PRs.
 */
const ASSIGNABLE_SHIFT_STATUSES: readonly Shift["status"][] = [
	"open",
	"confirmed",
];

/**
 * Rank order of the backend `pr_tier` enum, best first. Tiers outside the enum
 * (or a null tier) sort last rather than being dropped, so an odd row never
 * silently disappears from the plan.
 */
const TIER_RANK: Readonly<Record<string, number>> = {
	tier_1: 0,
	tier_2: 1,
	tier_3: 2,
	tier_4: 3,
	tier_5: 4,
	servant: 5,
	commission_only: 6,
};
const UNRANKED_TIER = 99;

function tierRank(tier: string | null): number {
	return tier ? (TIER_RANK[tier] ?? UNRANKED_TIER) : UNRANKED_TIER;
}

/** A shift still short of its `quantity` headcount. */
export interface OpenShift {
	shiftId: string;
	outletId: string;
	outletName: string;
	shiftDate: string;
	slot: string | null;
	eventName: string | null;
	openSlots: number;
}

/** One proposed PR → shift assignment, pending the agency's confirmation. */
export interface AutoAssignPair {
	shiftId: string;
	prId: string;
	userId?: string | null;
	prName: string;
	prTier: string | null;
	outletName: string;
	shiftDate: string;
	slot: string | null;
	eventName: string | null;
	/** Shifts the PR already holds this payroll week, before this plan. */
	shiftsThisWeek: number;
}

export interface AutoAssignPlan {
	pairs: AutoAssignPair[];
	/** Open slots across the target dates, before the plan is applied. */
	openSlotCount: number;
	/** Active PRs free on at least one target date. */
	freePrCount: number;
	/** Open slots the plan cannot cover — more slots than free PRs. */
	unfilledCount: number;
}

export const EMPTY_AUTO_ASSIGN_PLAN: AutoAssignPlan = {
	pairs: [],
	openSlotCount: 0,
	freePrCount: 0,
	unfilledCount: 0,
};

/** PR display name: working nickname when set, else legal name (backend rule). */
function prDisplayName(pr: PrPersonnel): string {
	return pr.nickname?.trim() || pr.name;
}

/**
 * Open slots per shift = `quantity` minus the assignments still staffing it.
 * Shifts outside `targetDates`, unpublished/sealed shifts, and fully staffed
 * shifts are excluded.
 */
export function findOpenShifts(params: {
	shifts: Shift[];
	assignments: ShiftAssignment[];
	outletNameById: Map<string, string>;
	targetDates: readonly string[];
}): OpenShift[] {
	const { shifts, assignments, outletNameById, targetDates } = params;
	const dates = new Set(targetDates);

	const staffedByShift = new Map<string, number>();
	for (const a of assignments) {
		if (NON_STAFFING_STATUSES.includes(a.status)) continue;
		staffedByShift.set(a.shiftId, (staffedByShift.get(a.shiftId) ?? 0) + 1);
	}

	return (
		shifts
			.filter(
				(s) =>
					dates.has(s.shiftDate) &&
					ASSIGNABLE_SHIFT_STATUSES.includes(s.status),
			)
			.map((s) => ({
				shiftId: s.id,
				outletId: s.outletId,
				outletName: outletNameById.get(s.outletId) ?? "Unknown outlet",
				shiftDate: s.shiftDate,
				slot: s.slot,
				eventName: s.eventName,
				openSlots: s.quantity - (staffedByShift.get(s.id) ?? 0),
			}))
			.filter((s) => s.openSlots > 0)
			// Listing order only — the fill rotation below deliberately does NOT
			// follow it, so no outlet gains priority from where its name sorts.
			.sort(
				(a, b) =>
					a.shiftDate.localeCompare(b.shiftDate) ||
					a.outletName.localeCompare(b.outletName),
			)
	);
}

/**
 * Proposes PR → open-shift pairings for `targetDates`, most suitable first.
 *
 * Suitability, per the agency's rule: active PRs only, never one already
 * working that date, ranked by tier (Tier I first) then by who holds the fewest
 * shifts that payroll week, so the work spreads instead of always landing on
 * the same few names. Nothing is written — the caller confirms the plan.
 *
 * No outlet is preferred: slots are filled by rotating across the outlets that
 * still need staff, so a scarce night thins every outlet equally rather than
 * fully staffing one and starving another.
 *
 * `weekShifts`/`weekAssignments` cover the whole payroll week (that is what the
 * fairness tie-break counts); `targetDates` narrows which dates get filled, so
 * widening the card from today to the full week is a change of that list alone.
 */
export function buildAutoAssignPlan(params: {
	weekShifts: Shift[];
	weekAssignments: ShiftAssignment[];
	prs: PrPersonnel[];
	outletNameById: Map<string, string>;
	targetDates: readonly string[];
}): AutoAssignPlan {
	const { weekShifts, weekAssignments, prs, outletNameById, targetDates } =
		params;

	const openShifts = findOpenShifts({
		shifts: weekShifts,
		assignments: weekAssignments,
		outletNameById,
		targetDates,
	});
	const openSlotCount = openShifts.reduce((sum, s) => sum + s.openSlots, 0);

	// A PR is busy on a date if they hold a staffing assignment on a shift that
	// day; the same pass counts the week's shifts per PR for the tie-break.
	const shiftDateById = new Map(weekShifts.map((s) => [s.id, s.shiftDate]));
	const busyDatesByPr = new Map<string, Set<string>>();
	const weekCountByPr = new Map<string, number>();
	for (const a of weekAssignments) {
		if (NON_STAFFING_STATUSES.includes(a.status)) continue;
		const date = shiftDateById.get(a.shiftId) ?? a.shiftDate;
		if (!date) continue;
		const dates = busyDatesByPr.get(a.prId) ?? new Set<string>();
		dates.add(date);
		busyDatesByPr.set(a.prId, dates);
		weekCountByPr.set(a.prId, (weekCountByPr.get(a.prId) ?? 0) + 1);
	}

	const activePrs = prs.filter((p) => p.status === "active");
	const freePrCount = activePrs.filter((p) =>
		targetDates.some((d) => !busyDatesByPr.get(p.id)?.has(d)),
	).length;

	// Fill one PR at a time, rotating across outlets: each turn goes to the
	// outlet that has been given the fewest PRs so far, so every outlet is
	// staffed once before any outlet is staffed twice. No outlet is ever
	// prioritised by name or by identity — when free PRs run short, the
	// shortfall is spread across outlets instead of emptying the last one.
	// Dates are still worked in calendar order.
	const plannedByPr = new Map<string, number>();
	const pairs: AutoAssignPair[] = [];
	const dates = [...new Set(openShifts.map((s) => s.shiftDate))].sort();

	for (const date of dates) {
		const dayShifts = openShifts.filter((s) => s.shiftDate === date);
		const remainingByShift = new Map(
			dayShifts.map((s) => [s.shiftId, s.openSlots]),
		);
		const assignedByOutlet = new Map<string, number>();
		const takenToday = new Set<string>();
		const daySlotCount = dayShifts.reduce((sum, s) => sum + s.openSlots, 0);

		// At most one iteration per open slot that day.
		for (let filled = 0; filled < daySlotCount; filled += 1) {
			const stillOpen = dayShifts.filter(
				(s) => (remainingByShift.get(s.shiftId) ?? 0) > 0,
			);
			if (stillOpen.length === 0) break;

			// Whose turn: the outlet with the fewest PRs from this run, then the
			// one still shortest of staff. Names only break a dead tie, so the
			// ordering stays deterministic without favouring anyone.
			const needByOutlet = new Map<string, number>();
			for (const s of stillOpen) {
				needByOutlet.set(
					s.outletId,
					(needByOutlet.get(s.outletId) ?? 0) +
						(remainingByShift.get(s.shiftId) ?? 0),
				);
			}
			const target = [...stillOpen].sort(
				(a, b) =>
					(assignedByOutlet.get(a.outletId) ?? 0) -
						(assignedByOutlet.get(b.outletId) ?? 0) ||
					(needByOutlet.get(b.outletId) ?? 0) -
						(needByOutlet.get(a.outletId) ?? 0) ||
					a.outletName.localeCompare(b.outletName) ||
					(remainingByShift.get(b.shiftId) ?? 0) -
						(remainingByShift.get(a.shiftId) ?? 0) ||
					a.shiftId.localeCompare(b.shiftId),
			)[0];

			const load = (id: string) =>
				(weekCountByPr.get(id) ?? 0) + (plannedByPr.get(id) ?? 0);
			const pick = activePrs
				.filter(
					(p) => !takenToday.has(p.id) && !busyDatesByPr.get(p.id)?.has(date),
				)
				.sort(
					(a, b) =>
						tierRank(a.tier) - tierRank(b.tier) ||
						load(a.id) - load(b.id) ||
						prDisplayName(a).localeCompare(prDisplayName(b)),
				)[0];
			// Out of free PRs for this date — the remaining slots stay unfilled.
			if (!pick) break;

			takenToday.add(pick.id);
			plannedByPr.set(pick.id, (plannedByPr.get(pick.id) ?? 0) + 1);
			assignedByOutlet.set(
				target.outletId,
				(assignedByOutlet.get(target.outletId) ?? 0) + 1,
			);
			remainingByShift.set(
				target.shiftId,
				(remainingByShift.get(target.shiftId) ?? 0) - 1,
			);
			pairs.push({
				shiftId: target.shiftId,
				prId: pick.id,
				userId: pick.userId,
				prName: prDisplayName(pick),
				prTier: pick.tier,
				outletName: target.outletName,
				shiftDate: date,
				slot: target.slot,
				eventName: target.eventName,
				shiftsThisWeek: weekCountByPr.get(pick.id) ?? 0,
			});
		}
	}

	return {
		pairs,
		openSlotCount,
		freePrCount,
		unfilledCount: openSlotCount - pairs.length,
	};
}

/** Why a proposed pair was dropped at confirm time. */
export type DropReason = "shift-gone" | "shift-full" | "pr-busy";

export interface ValidatedPairs {
	valid: AutoAssignPair[];
	dropped: { pair: AutoAssignPair; reason: DropReason }[];
}

export function dropReasonLabel(reason: DropReason): string {
	switch (reason) {
		case "shift-gone":
			return "shift no longer open";
		case "shift-full":
			return "shift already fully staffed";
		case "pr-busy":
			return "PR booked elsewhere";
	}
}

/**
 * Re-checks a plan against freshly fetched rows, immediately before writing.
 *
 * The plan is built from cached queries, so a slot can be filled from the roster
 * (or another agency user) while the preview sheet sits open. The backend does
 * NOT enforce a shift's `quantity` or reject a double-booked PR — it only checks
 * agency ownership — so without this pass a stale plan would silently overstaff
 * a shift. Anything no longer valid is dropped and reported, never written.
 */
export function validateAutoAssignPairs(params: {
	pairs: readonly AutoAssignPair[];
	shifts: Shift[];
	assignments: ShiftAssignment[];
}): ValidatedPairs {
	const { pairs, shifts, assignments } = params;

	const shiftById = new Map(shifts.map((s) => [s.id, s]));
	const staffedByShift = new Map<string, number>();
	const busyDatesByPr = new Map<string, Set<string>>();
	for (const a of assignments) {
		if (NON_STAFFING_STATUSES.includes(a.status)) continue;
		staffedByShift.set(a.shiftId, (staffedByShift.get(a.shiftId) ?? 0) + 1);
		const date = shiftById.get(a.shiftId)?.shiftDate ?? a.shiftDate;
		if (!date) continue;
		const dates = busyDatesByPr.get(a.prId) ?? new Set<string>();
		dates.add(date);
		busyDatesByPr.set(a.prId, dates);
	}

	const valid: AutoAssignPair[] = [];
	const dropped: { pair: AutoAssignPair; reason: DropReason }[] = [];

	for (const pair of pairs) {
		const shift = shiftById.get(pair.shiftId);
		if (!shift || !ASSIGNABLE_SHIFT_STATUSES.includes(shift.status)) {
			dropped.push({ pair, reason: "shift-gone" });
			continue;
		}
		if (shift.quantity - (staffedByShift.get(shift.id) ?? 0) <= 0) {
			dropped.push({ pair, reason: "shift-full" });
			continue;
		}
		if (busyDatesByPr.get(pair.prId)?.has(shift.shiftDate)) {
			dropped.push({ pair, reason: "pr-busy" });
			continue;
		}

		// Count the pair as taken so the rest of this batch sees it.
		valid.push(pair);
		staffedByShift.set(shift.id, (staffedByShift.get(shift.id) ?? 0) + 1);
		const dates = busyDatesByPr.get(pair.prId) ?? new Set<string>();
		dates.add(shift.shiftDate);
		busyDatesByPr.set(pair.prId, dates);
	}

	return { valid, dropped };
}

/** Human label for a backend tier enum value ('tier_1' → 'Tier I'). */
export function tierLabel(tier: string | null): string {
	switch (tier) {
		case "tier_1":
			return "Tier I";
		case "tier_2":
			return "Tier II";
		case "tier_3":
			return "Tier III";
		case "tier_4":
			return "Tier IV";
		case "tier_5":
			return "Tier V";
		case "servant":
			return "Servant";
		case "commission_only":
			return "Commission only";
		default:
			return "No tier";
	}
}
