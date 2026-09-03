import { describe, expect, test } from "vitest";
import type { PrPersonnel } from "@/services/pr-personnel";
import type { Shift } from "@/services/shift";
import type { ShiftAssignment } from "@/services/shift-assignment";
import { buildAutoAssignPlan, validateAutoAssignPairs } from "./auto-assign";

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
	crossAgencyBusy?: { userId: string; date: string; slot: string | null }[];
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
		crossAgencyBusy: opts.crossAgencyBusy,
	});
}

describe("buildAutoAssignPlan — who gets picked", () => {
	test("a PR who has worked at this venue outranks one who has not", () => {
		const plan = planWith({
			prs: [pr("stranger", "Aaa Stranger"), pr("regular", "Zzz Regular")],
			assignments: [worked("regular", VENUE)],
		});
		// Named last alphabetically, so only the venue history can put them first.
		// (Their history row is dated last winter, outside this payroll week, so
		// since 3 Sep 2026 it no longer counts against them on the fairness
		// tie-break either — the name is what this test now has to beat.)
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

/**
 * BUSY IS A WINDOW, NOT A DAY (3 Sep 2026).
 *
 * The planner used to drop any PR holding ANY assignment on the target date.
 * The server never did — it refuses only a real overlap — so the sheet hid
 * candidates the API would have taken, and it hid them ASYMMETRICALLY: an
 * assignment is only visible to the agency that made it, so a venue's named PR
 * was offered by one invited agency and invisible to the other.
 *
 * Fixtures put the PR's earlier shift ONLY on the assignment row, with no shift
 * row behind it. That is production's shape, not a convenience: the plan is
 * built from the week's LIVE shifts, so a shift that has already finished is
 * gone from that list while its assignment is still in the roster's.
 */
const booked = (
	prId: string,
	slot: string,
	over: Partial<ShiftAssignment> = {},
): ShiftAssignment =>
	({
		id: `booked-${prId}-${slot}`,
		shiftId: `shift-earlier-${slot}`,
		prId,
		outletId: OTHER_VENUE,
		shiftDate: DATE,
		slot,
		status: "assigned",
		checkOutAt: null,
		...over,
	}) as unknown as ShiftAssignment;

describe("buildAutoAssignPlan — busy is a window, not a day", () => {
	test("an earlier shift the same day does NOT hide a PR", () => {
		// The live case: Vicky worked 10:00-11:00 that morning and the venue asked
		// for her at 22:00. Nothing about those two collides.
		const plan = planWith({
			prs: [pr("vicky", "Vicky")],
			assignments: [booked("vicky", "10:00 - 11:00")],
		});
		expect(plan.pairs.map((p) => p.prId)).toEqual(["vicky"]);
		expect(plan.freePrCount).toBe(1);
	});

	test("an OVERLAPPING shift still hides them", () => {
		// 23:00-01:00 sits inside the target's 22:00-04:00. The server refuses this
		// one, so the planner must not propose it.
		const plan = planWith({
			prs: [pr("busy", "Aaa Busy"), pr("free", "Zzz Free")],
			assignments: [booked("busy", "23:00 - 01:00")],
		});
		expect(plan.pairs.map((p) => p.prId)).toEqual(["free"]);
	});

	test("back-to-back is not a clash", () => {
		// Ends at exactly 22:00, the target's start. Strict intersection, matching
		// the server and the outlet's own clash check.
		const plan = planWith({
			prs: [pr("vicky", "Vicky")],
			assignments: [booked("vicky", "18:00 - 22:00")],
		});
		expect(plan.pairs.map((p) => p.prId)).toEqual(["vicky"]);
	});

	test("a checked-out row cannot clash — cut-loss frees the night", () => {
		// A release mid-shift exists precisely so the PR can be sent elsewhere; the
		// released row keeps its original window, which would otherwise refuse the
		// re-assignment the release was for.
		const plan = planWith({
			prs: [pr("released", "Released PR")],
			assignments: [
				booked("released", "23:00 - 01:00", {
					checkOutAt: "2030-06-01T23:30:00.000Z",
				}),
			],
		});
		expect(plan.pairs.map((p) => p.prId)).toEqual(["released"]);
	});

	test("a completed overlapping shift does not clash either", () => {
		const plan = planWith({
			prs: [pr("done", "Done PR")],
			assignments: [booked("done", "23:00 - 01:00", { status: "completed" })],
		});
		expect(plan.pairs.map((p) => p.prId)).toEqual(["done"]);
	});

	test("the venue's named ask survives an earlier shift that day", () => {
		// What the old date rule broke: being requested is a RANKING term, applied
		// to whoever survives the busy filter. A named PR who had already worked
		// that morning never reached the ranking at all.
		const plan = planWith({
			prs: [pr("named", "Zzz Named"), pr("other", "Aaa Other")],
			assignments: [booked("named", "10:00 - 11:00")],
			requested: new Map([["shift-1", new Set(["named"])]]),
		});
		expect(plan.pairs[0]?.prId).toBe("named");
		expect(plan.pairs[0]?.requestedByVenue).toBe(true);
	});

	test("a day the PR blocked themselves still hides them", () => {
		// pr_availability blocks a DATE, not an hour, and the server refuses every
		// shift on it — so this half stays a whole-day rule.
		const plan = buildAutoAssignPlan({
			weekShifts: [shift()],
			weekAssignments: [],
			prs: [pr("off", "Aaa Off"), pr("on", "Zzz On")],
			outletNameById: new Map([[VENUE, "JK House"]]),
			targetDates: [DATE],
			blockedDatesByPr: new Map([["off", new Set([DATE])]]),
		});
		expect(plan.pairs.map((p) => p.prId)).toEqual(["on"]);
	});
});

/**
 * "N SHIFTS THIS WEEK" IS THE WEEK (3 Sep 2026).
 *
 * `weekCountByPr` counted every row it was handed, and it is handed the agency's
 * whole assignment history — the hook pages `GET /shift-assignment` to
 * exhaustion with no date filter. So the sheet printed a LIFETIME total under a
 * label that said "this week": Atlas read 31 / 2 / 3 where the real Sun–Sat week
 * was 2 / 0 / 0. `load()` reads the same map, so the ranking was wrong too.
 *
 * `DATE` is a Saturday, so the payroll week under test is 2030-05-26 → 2030-06-01.
 */
describe("buildAutoAssignPlan — shifts this week means THIS WEEK", () => {
	test("history outside the payroll week is not counted", () => {
		const plan = planWith({
			prs: [pr("solo", "Solo PR")],
			assignments: [
				worked("solo", VENUE, { shiftDate: "2030-01-01" }), // last winter
				worked("solo", VENUE, { shiftDate: "2030-05-28" }), // Tue of this week
			],
		});
		expect(plan.pairs[0]?.shiftsThisWeek).toBe(1);
	});

	test("the fairness tie-break follows the week, not the lifetime total", () => {
		// Same tier, no request, and both have history at a DIFFERENT venue so the
		// venue term cannot decide it — the count is all that is left. The veteran
		// is also named last alphabetically, so the name tie-break is set up to
		// lose: only a week-scoped count can put them first.
		const plan = planWith({
			prs: [pr("fresh", "Aaa Fresh"), pr("veteran", "Zzz Veteran")],
			assignments: [
				worked("veteran", OTHER_VENUE, { shiftDate: "2030-01-01" }),
				worked("veteran", OTHER_VENUE, { shiftDate: "2030-01-02" }),
				worked("veteran", OTHER_VENUE, { shiftDate: "2030-01-03" }),
				worked("fresh", OTHER_VENUE, { shiftDate: "2030-05-28" }),
			],
		});
		expect(plan.pairs[0]?.prId).toBe("veteran");
		expect(plan.pairs[0]?.shiftsThisWeek).toBe(0);
	});
});

/**
 * A RIVAL AGENCY'S BOOKING, WITHOUT LEARNING WHOSE (3 Sep 2026).
 *
 * `GET /shift-assignment` is agency-scoped, so the planner never sees another
 * agency's rows — Atlas seated Vicky on a shift posted to two agencies and Why
 * We Met went on offering her for that same shift, all the way to a 409 that is
 * deliberately anonymous and so could not explain itself.
 *
 * The fix is the committed read the grid has painted as UNAVAILABLE for weeks:
 * `{ userId, date, slot }` and nothing else. Owner's rule — "they should only
 * see that the PR is Busy but they should not be able to see that another agency
 * assigned them to the shift". These fixtures carry NO assignment row on purpose:
 * that absence IS the production shape.
 */
describe("buildAutoAssignPlan — rival bookings, as times only", () => {
	test("a rival booking over the shift hides the PR", () => {
		const plan = planWith({
			prs: [pr("vicky", "Aaa Vicky"), pr("abby", "Zzz Abby")],
			// Requested too, to prove the venue's ask does not override a real
			// clash — she cannot work it, and no ranking can change that.
			requested: new Map([["shift-1", new Set(["vicky"])]]),
			crossAgencyBusy: [
				{ userId: "vicky", date: DATE, slot: "22:00 - 04:00" },
			],
		});
		expect(plan.pairs.map((p) => p.prId)).toEqual(["abby"]);
	});

	test("a rival booking at another hour does not hide them", () => {
		const plan = planWith({
			prs: [pr("vicky", "Vicky")],
			crossAgencyBusy: [
				{ userId: "vicky", date: DATE, slot: "10:00 - 11:00" },
			],
		});
		expect(plan.pairs.map((p) => p.prId)).toEqual(["vicky"]);
	});

	test("a rival booking with no readable window is advice, not a refusal", () => {
		// "Spoken for at an hour nobody knows." Refusing the day for it is the
		// whole-day rule the owner retired on 20 Aug 2026.
		const plan = planWith({
			prs: [pr("vicky", "Vicky")],
			crossAgencyBusy: [{ userId: "vicky", date: DATE, slot: null }],
		});
		expect(plan.pairs.map((p) => p.prId)).toEqual(["vicky"]);
	});
});

describe("validateAutoAssignPairs — the pre-write re-check agrees", () => {
	const pairFor = (prId: string) => {
		const plan = planWith({ prs: [pr(prId, "Any Name")] });
		return plan.pairs[0];
	};

	test("keeps a pair whose PR worked earlier the same day", () => {
		const pair = pairFor("vicky");
		expect(pair).toBeDefined();
		const { valid, dropped } = validateAutoAssignPairs({
			pairs: [pair],
			shifts: [shift()],
			assignments: [booked("vicky", "10:00 - 11:00")],
		});
		expect(dropped).toEqual([]);
		expect(valid).toHaveLength(1);
	});

	test("drops a pair whose PR is booked over the shift", () => {
		const pair = pairFor("vicky");
		const { valid, dropped } = validateAutoAssignPairs({
			pairs: [pair],
			shifts: [shift()],
			assignments: [booked("vicky", "23:00 - 01:00")],
		});
		expect(valid).toEqual([]);
		expect(dropped[0]?.reason).toBe("pr-busy");
	});

	test("drops a pair a RIVAL agency seated while the sheet sat open", () => {
		// No assignment row — that race is invisible in our own rows, and it is
		// the one that used to reach the API as an unexplainable 409.
		const pair = pairFor("vicky");
		const { valid, dropped } = validateAutoAssignPairs({
			pairs: [pair],
			shifts: [shift()],
			assignments: [],
			crossAgencyBusy: [
				{ userId: "vicky", date: DATE, slot: "22:00 - 04:00" },
			],
		});
		expect(valid).toEqual([]);
		expect(dropped[0]?.reason).toBe("pr-busy");
	});
});
