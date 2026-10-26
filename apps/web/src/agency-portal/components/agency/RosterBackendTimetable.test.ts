import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import { toneFor } from "./RosterBackendTimetable";

/**
 * THE WORD ON A FILLED CELL. `no_show`, `cancelled` and an approved MC all fold
 * into the slot status "unavailable" — right for the plan, which counts none of
 * them — but a no-show is a different fact, and the PR's profile and the shift
 * table already call it "No-show". The grid read "Unavailable" about the same
 * night.
 */

const en = translations.en;

describe("toneFor — the planning grid's cell label", () => {
	it("calls a no-show a No-show, in the same off-plan tone", () => {
		const tone = toneFor({ status: "unavailable", noShowFlag: true });
		expect(tone.label(en)).toBe(en.rosterGrid.noShow);
		expect(tone.className).toBe(toneFor({ status: "unavailable" }).className);
	});

	it("keeps Unavailable for a cancel or an excused absence", () => {
		expect(toneFor({ status: "unavailable" }).label(en)).toBe(
			en.roster.unavailable,
		);
	});

	it("still says No-show when a stamp predates the decision", () => {
		const tone = toneFor({
			status: "unavailable",
			noShowFlag: true,
			checkedOutAt: "2026-10-20T03:00:00Z",
		});
		expect(tone.label(en)).toBe(en.rosterGrid.noShow);
	});

	it("leaves a worked shift's checked-out label alone", () => {
		expect(
			toneFor({
				status: "scheduled",
				checkedOutAt: "2026-10-20T03:00:00Z",
			}).label(en),
		).toBe(en.roster.checkedOut);
	});
});
