import { describe, expect, test } from "vitest";
import type { PrPersonnel } from "@/services/pr-personnel";
import type { Shift } from "@/services/shift";
import type { ShiftAssignment } from "@/services/shift-assignment";
import { buildAutoAssignPlan } from "./auto-assign";

/**
 * Ranking rules for `buildAutoAssignPlan` (owner, 24 Aug 2026: "prioritise PRs
 * who have worked with the outlet before and also the ones who have been
 * requested by the outlet").
 *
 * Order under test, strongest first:
 *   1. the venue NAMED them on this shift
 *   2. they have WORKED at this venue before
 *   3. tier
 *   4. fewest shifts held
 *   5. name, so the result is stable
 *
 * Dates are far future so the planner's own ended-shift filter never fires and
 * these stay deterministic whatever day they run on.
 *
 * ⚠️ The fixtures carry only the fields the planner reads, cast to the real
 * types. The one field this feature depends on — `ShiftAssignment.outletId` —
 * was checked against the LIVE list endpoint before these were written and
 * comes back populated with real venue uuids. A fixture that invented that
 * field would prove nothing about production.
 */

const DATE = "2030-06-01";
const VENUE = "outlet-jk";
const OTHER_VENUE = "outlet-elsewhere";

const shift = (over: Partial<Shift> = {}): Shift =>
	({
		id: "shift-1",
		outletId: VENUE,
		shiftDate: DATE,
		slot: "22:00 - 04:00",
		status: "confirmed",
		quantity: 1,
		staffedCount: 0,
		eventName: "Test",
		...over,
	}) as unknown as Shift;

const pr = (
	id: string,
	name: string,
	tier: string | null = "tier_1",
): PrPersonnel =>
	({
		id,
		userId: id,
		name,
		nickname: null,
		tier,
		status: "active",
	}) as unknown as PrPersonnel;

let historyRow = 0;
const worked = (
	prId: string,
	outletId: string | undefined,
	over: Partial<ShiftAssignment> = {},
): ShiftAssignment =>
	({
		id: `history-${(historyRow += 1)}`,
		shiftId: "shift-history",
		prId,
		outletId,
		shiftDate: "2030-01-01",
		status: "completed",
		...over,
	}) as unknown as ShiftAssignment;

function planWith(opts: {
	prs: PrPersonnel[];
	assignments?: ShiftAssignment[];
	shifts?: Shift[];
	requested?: Map<string, Set<string>>;
}) {
	return buildAutoAssignPlan({
		weekShifts: opts.shifts ?? [shift()],
		weekAssignments: opts.assignments ?? [],
		prs: opts.prs,
		outletNameById: new Map([
			[VENUE, "JK House"],
			[OTHER_VENUE, "Somewhere Else"],
		]),
		targetDates: [DATE],
		requestedPrIdsByShift: opts.requested,
	});
}

describe("buildAutoAssignPlan — who gets picked", () => {
	test("a PR who has worked at this venue outranks one who has not", () => {
		const plan = planWith({
			prs: [pr("stranger", "Aaa Stranger"), pr("regular", "Zzz Regular")],
			assignments: [worked("regular", VENUE)],
		});
		// Named last alphabetically and holding one more shift, so only the venue
		// history can put them first.
		expect(plan.pairs[0]?.prId).toBe("regular");
		expect(plan.pairs[0]?.workedHereBefore).toBe(true);
	});

	test("history at a DIFFERENT venue does not count", () => {
		const plan = planWith({
			prs: [pr("aaa", "Aaa Stranger"), pr("zzz", "Zzz Elsewhere")],
			assignments: [worked("zzz", OTHER_VENUE)],
		});
		// Falls through to the name tie-break, so the alphabetical first wins.
		expect(plan.pairs[0]?.prId).toBe("aaa");
		expect(plan.pairs[0]?.workedHereBefore).toBe(false);
	});

	test("a cancelled booking is not history — they never worked it", () => {
		const plan = planWith({
			prs: [pr("aaa", "Aaa Stranger"), pr("zzz", "Zzz Cancelled")],
			assignments: [worked("zzz", VENUE, { status: "cancelled" })],
		});
		expect(plan.pairs[0]?.prId).toBe("aaa");
	});

	test("a no-show is not history either", () => {
		const plan = planWith({
			prs: [pr("aaa", "Aaa Stranger"), pr("zzz", "Zzz NoShow")],
			assignments: [worked("zzz", VENUE, { status: "no_show" })],
		});
		expect(plan.pairs[0]?.prId).toBe("aaa");
	});

	test("being NAMED by the venue still beats having worked there", () => {
		// The explicit ask for THIS shift says more than having met before.
		const plan = planWith({
			prs: [pr("named", "Zzz Named"), pr("regular", "Aaa Regular")],
			assignments: [worked("regular", VENUE)],
			requested: new Map([["shift-1", new Set(["named"])]]),
		});
		expect(plan.pairs[0]?.prId).toBe("named");
		expect(plan.pairs[0]?.requestedByVenue).toBe(true);
	});

	test("venue history outranks a BETTER tier — the deliberate trade", () => {
		// A Tier II regular beats a Tier I stranger. The tier QUOTA is untouched;
		// this only reorders candidates the shift would accept either way.
		const plan = planWith({
			prs: [
				pr("t1stranger", "Aaa TierOne", "tier_1"),
				pr("t2regular", "Zzz TierTwo", "tier_2"),
			],
			assignments: [worked("t2regular", VENUE)],
		});
		expect(plan.pairs[0]?.prId).toBe("t2regular");
	});

	test("history is found via the shift row when the join is absent", () => {
		// Older backends do not send `outletId` on the assignment. The shift the
		// assignment points at still knows the venue.
		// Dated in the PAST, matching the assignment that points at it. Giving it
		// the target date instead made the PR busy that day and dropped them from
		// the pool entirely — the fixture defeated its own test, which is the
		// failure mode a hand-built fixture is most prone to.
		const history = shift({
			id: "shift-history",
			outletId: VENUE,
			shiftDate: "2030-01-01",
		});
		const plan = planWith({
			prs: [pr("aaa", "Aaa Stranger"), pr("zzz", "Zzz Regular")],
			shifts: [shift(), history],
			assignments: [worked("zzz", undefined)],
		});
		expect(plan.pairs[0]?.prId).toBe("zzz");
		expect(plan.pairs[0]?.workedHereBefore).toBe(true);
	});

	test("with no history and no request, tier still decides", () => {
		const plan = planWith({
			prs: [pr("low", "Aaa Low", "tier_3"), pr("high", "Zzz High", "tier_1")],
		});
		expect(plan.pairs[0]?.prId).toBe("high");
	});
});
