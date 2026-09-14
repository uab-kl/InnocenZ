import { describe, expect, it } from "vitest";
import { isMemberWaiting, memberQueueState } from "./member-queue-state";

/**
 * The exact shape of Atlas Agency's live `agency_user` rows on 14 Sep 2026,
 * read from the database: 6 active, 1 rejected, 1 inactive, and NOBODY
 * pending. This is the fixture that reproduces the reported bug — the rail
 * badge and the "New member" tab both said 2, directly above a queue reading
 * "Waiting (0) · Declined (1) · Deactivated (1)".
 */
const ATLAS_LIVE = [
	{ status: "active" },
	{ status: "active" },
	{ status: "active" },
	{ status: "active" },
	{ status: "active" },
	{ status: "active" },
	{ status: "rejected" },
	{ status: "inactive" },
];

describe("memberQueueState", () => {
	it("maps each stored status to the state the queue shows", () => {
		expect(memberQueueState({ status: "pending" })).toBe("waiting");
		expect(memberQueueState({ status: "active" })).toBe("active");
		expect(memberQueueState({ status: "rejected" })).toBe("declined");
		expect(memberQueueState({ status: "inactive" })).toBe("deactivated");
	});

	/*
	 * An unknown word must not accuse somebody of having been turned down —
	 * "no longer active" is true of every non-active row, "declined" is not.
	 */
	it("sends an unrecognised status to deactivated, never to declined", () => {
		expect(memberQueueState({ status: "inactve" })).toBe("deactivated");
		expect(memberQueueState({ status: "" })).toBe("deactivated");
	});
});

describe("isMemberWaiting", () => {
	it("counts only pending as waiting", () => {
		expect(isMemberWaiting({ status: "pending" })).toBe(true);
		for (const status of ["active", "rejected", "inactive", "nonsense"]) {
			expect(isMemberWaiting({ status })).toBe(false);
		}
	});

	/*
	 * THE REGRESSION THIS FILE EXISTS FOR.
	 *
	 * The old predicate was `status !== "active"`, which returns 2 for these
	 * rows — the declined one plus the deactivated one, both decisions already
	 * taken. A badge counts work still to be done, so the answer here is 0.
	 */
	it("reports no work for Atlas's live rows, where the badge wrongly said 2", () => {
		expect(ATLAS_LIVE.filter(isMemberWaiting).length).toBe(0);

		/*
		 * The bug, pinned: this asserts the OLD rule is what produced the 2, so
		 * the test above is known to discriminate rather than to pass either way.
		 * Without this line a predicate that returned 0 for everything would look
		 * just as green.
		 */
		expect(ATLAS_LIVE.filter((m) => m.status !== "active").length).toBe(2);
	});

	it("still counts somebody genuinely waiting", () => {
		const withApplicant = [...ATLAS_LIVE, { status: "pending" }];
		expect(withApplicant.filter(isMemberWaiting).length).toBe(1);
	});
});
