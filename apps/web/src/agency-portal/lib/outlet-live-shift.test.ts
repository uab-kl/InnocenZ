import { describe, expect, test } from "vitest";
import type { AgencyRosterSlot } from "./agency-demo";
import { pickLiveShift } from "./outlet-live-shift";
import type { ShiftRequest } from "./store";

const TODAY = "2026-08-26";
/** Local time, the way a venue reads its own clock. */
const at = (h: number, m: number) => new Date(2026, 7, 26, h, m, 0, 0);

/** Only the fields the rule reads; the DTO carries thirty more. */
const shift = (over: Partial<ShiftRequest> & { id: string }): ShiftRequest =>
	({
		date: TODAY,
		dateIso: TODAY,
		status: "confirmed",
		event: "Event",
		...over,
	}) as ShiftRequest;

const slot = (over: Partial<AgencyRosterSlot>): AgencyRosterSlot =>
	({
		dateIso: TODAY,
		status: "scheduled",
		checkedOutAt: undefined,
		...over,
	}) as AgencyRosterSlot;

describe("pickLiveShift", () => {
	/**
	 * THE BUG THIS RULE WAS EXTRACTED FOR. `outletHomeShiftRequests` sorts by
	 * event name once the date ties, so "Friday Lounge" arrives before
	 * "TESTING123" — and the old `find` took whatever came first among the shifts
	 * that were not over. At 13:50 that was the one starting at 14:10.
	 */
	test("prefers the shift running NOW over one that has not started", () => {
		const running = shift({ id: "running", shift: "11:00 - 14:00" });
		const upcoming = shift({ id: "upcoming", shift: "14:10 - 16:00" });
		const picked = pickLiveShift({
			shifts: [upcoming, running], // alphabetical order, as the list arrives
			roster: [],
			todayIso: TODAY,
			now: at(13, 50),
		});
		expect(picked?.id).toBe("running");
	});

	test("an ENDED shift nobody is still on never holds the card", () => {
		const ended = shift({ id: "ended", shift: "09:00 - 10:00" });
		const upcoming = shift({ id: "upcoming", shift: "20:00 - 23:00" });
		expect(
			pickLiveShift({
				shifts: [ended, upcoming],
				roster: [],
				todayIso: TODAY,
				now: at(13, 50),
			})?.id,
		).toBe("upcoming");
		// …and with nothing else today, the card goes empty rather than showing it.
		expect(
			pickLiveShift({
				shifts: [ended],
				roster: [],
				todayIso: TODAY,
				now: at(13, 50),
			}),
		).toBeNull();
	});

	/** Owner, 23 Aug 2026: "the pr not yet end why show another shift". */
	test("an ended shift with someone still checked in OUTRANKS the running one", () => {
		const ended = shift({ id: "ended", shift: "09:00 - 10:00" });
		const running = shift({ id: "running", shift: "11:00 - 14:00" });
		const picked = pickLiveShift({
			shifts: [ended, running],
			roster: [slot({ shift: "09:00 - 10:00" })],
			todayIso: TODAY,
			now: at(13, 50),
		});
		expect(picked?.id).toBe("ended");
	});

	test("a checked-out booking does NOT hold an ended shift", () => {
		const ended = shift({ id: "ended", shift: "09:00 - 10:00" });
		const running = shift({ id: "running", shift: "11:00 - 14:00" });
		const picked = pickLiveShift({
			shifts: [ended, running],
			roster: [
				slot({ shift: "09:00 - 10:00", checkedOutAt: "2026-08-26T10:02:00Z" }),
			],
			todayIso: TODAY,
			now: at(13, 50),
		});
		expect(picked?.id).toBe("running");
	});

	test("cancelled and no-show rows are an absence, not an open booking", () => {
		const ended = shift({ id: "ended", shift: "09:00 - 10:00" });
		const running = shift({ id: "running", shift: "11:00 - 14:00" });
		const picked = pickLiveShift({
			shifts: [ended, running],
			// "unavailable" is what cancelled / no-show / approved-leave map to.
			roster: [slot({ shift: "09:00 - 10:00", status: "unavailable" })],
			todayIso: TODAY,
			now: at(13, 50),
		});
		expect(picked?.id).toBe("running");
	});

	test("two upcoming shifts promote the one starting soonest, not the first named", () => {
		const later = shift({ id: "later", shift: "22:00 - 23:30" });
		const sooner = shift({ id: "sooner", shift: "20:00 - 21:00" });
		expect(
			pickLiveShift({
				shifts: [later, sooner],
				roster: [],
				todayIso: TODAY,
				now: at(13, 50),
			})?.id,
		).toBe("sooner");
	});

	test("two running shifts promote the one on the floor longer", () => {
		const early = shift({ id: "early", shift: "11:00 - 18:00" });
		const late = shift({ id: "late", shift: "13:00 - 18:00" });
		expect(
			pickLiveShift({
				shifts: [late, early],
				roster: [],
				todayIso: TODAY,
				now: at(13, 50),
			})?.id,
		).toBe("early");
	});

	test("a label-only shift stays eligible rather than blanking the page", () => {
		const noWindow = shift({ id: "no-window", shift: "Late night" });
		expect(
			pickLiveShift({
				shifts: [noWindow],
				roster: [],
				todayIso: TODAY,
				now: at(13, 50),
			})?.id,
		).toBe("no-window");
	});

	test("a real running shift beats a label-only one", () => {
		const noWindow = shift({ id: "no-window", shift: "Late night" });
		const running = shift({ id: "running", shift: "11:00 - 14:00" });
		expect(
			pickLiveShift({
				shifts: [noWindow, running],
				roster: [],
				todayIso: TODAY,
				now: at(13, 50),
			})?.id,
		).toBe("running");
	});

	test("only TODAY's confirmed shifts are considered", () => {
		const tomorrow = shift({
			id: "tomorrow",
			date: "2026-08-27",
			dateIso: "2026-08-27",
			shift: "11:00 - 14:00",
		});
		const draft = shift({
			id: "draft",
			shift: "11:00 - 14:00",
			status: "draft",
		});
		expect(
			pickLiveShift({
				shifts: [tomorrow, draft],
				roster: [],
				todayIso: TODAY,
				now: at(13, 50),
			}),
		).toBeNull();
	});
});
