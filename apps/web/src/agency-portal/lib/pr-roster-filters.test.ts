import { describe, expect, it } from "vitest";
import { foldRace, raceFilterOptions, raceMatches } from "./pr-roster-filters";

/**
 * Manage PR's race filter listed "Chinese" twice (28 Sep 2026 audit). The
 * database holds both `chinese` (19 rostered profiles) and `Chinese` (22), and
 * the options were a Set of the raw values.
 */
const ROSTER = [
	{ race: "Chinese" },
	{ race: "chinese" },
	{ race: "Chinese" },
	{ race: "malay" },
	{ race: "  Indian " },
	{ race: "" },
	{ race: null },
];

describe("raceFilterOptions", () => {
	it("offers each race once, however it was spelled", () => {
		expect(raceFilterOptions(ROSTER).map((o) => o.value)).toEqual([
			"chinese",
			"indian",
			"malay",
		]);
	});

	it("labels an option with its most common stored spelling", () => {
		const chinese = raceFilterOptions(ROSTER).find(
			(o) => o.value === "chinese",
		);
		expect(chinese?.label).toBe("Chinese");
	});

	it("drops blank races rather than offering an empty option", () => {
		expect(raceFilterOptions([{ race: " " }, { race: null }])).toEqual([]);
	});
});

describe("raceMatches", () => {
	it("matches every spelling of the picked race", () => {
		expect(raceMatches("Chinese", "chinese")).toBe(true);
		expect(raceMatches("chinese", "chinese")).toBe(true);
		expect(raceMatches(" CHINESE ", "chinese")).toBe(true);
	});

	it("does not match a different race", () => {
		expect(raceMatches("Malay", "chinese")).toBe(false);
	});

	it("matches everybody when nothing is picked", () => {
		expect(raceMatches(null, "")).toBe(true);
		expect(raceMatches("Malay", "")).toBe(true);
	});

	it("folds the same way the option values do", () => {
		expect(foldRace("  Chinese ")).toBe("chinese");
	});
});
