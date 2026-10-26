import { describe, expect, it } from "vitest";
import { statusPillShown } from "./RosterShiftTable";

/**
 * The shift table printed "No-show" AND "Unavailable" on one booking (22 Oct
 * 2026): a no-show folds into the UI status "unavailable" and also carries
 * `noShowFlag`. One fact, one pill.
 */

describe("statusPillShown — one pill for a no-show", () => {
	it("drops the generic Unavailable pill beside No-show", () => {
		expect(statusPillShown({ status: "unavailable", noShowFlag: true })).toBe(
			false,
		);
	});

	it("keeps Unavailable for a cancel or an excused absence", () => {
		expect(statusPillShown({ status: "unavailable" })).toBe(true);
		expect(statusPillShown({ status: "unavailable", noShowFlag: false })).toBe(
			true,
		);
	});

	it("keeps any OTHER status beside a no-show flag — it says something else", () => {
		expect(statusPillShown({ status: "on-duty", noShowFlag: true })).toBe(true);
		expect(statusPillShown({ status: "scheduled", noShowFlag: true })).toBe(
			true,
		);
	});
});
