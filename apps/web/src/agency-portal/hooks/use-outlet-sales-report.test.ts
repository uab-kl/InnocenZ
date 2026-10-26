import { describe, expect, it } from "vitest";
import {
	agencyLabelsByPr,
	agencyNamesById,
	wagesByAgency,
} from "./use-outlet-sales-report";

/**
 * THE "PR / AGENCY" COLUMN NAMES WHO SUPPLIED THE PR (22 Oct 2026: Reports →
 * Top performing PRs read "—" on every row, because the builder hard-coded
 * `agency: ""` — the report's cost rows carry no agency at all).
 */

const VENUE = "outlet-velvet";
const JULY_WEEK = { startIso: "2026-07-20", endIso: "2026-07-26" };

const row = (
	over: Partial<Parameters<typeof agencyLabelsByPr>[0][number]>,
) => ({
	prId: "pr-1",
	status: "completed" as const,
	agencyName: "Atlas Agency",
	shiftDate: "2026-07-23",
	outletId: VENUE,
	...over,
});

describe("agencyLabelsByPr", () => {
	it("names the agency that supplied the PR inside the window", () => {
		const labels = agencyLabelsByPr([row({})], VENUE, JULY_WEEK);
		expect(labels.get("pr-1")).toBe("Atlas Agency");
	});

	it("names both agencies, once each, for a PR supplied by two", () => {
		const labels = agencyLabelsByPr(
			[
				row({ agencyName: "Delta Crew" }),
				row({ shiftDate: "2026-07-24" }),
				row({ shiftDate: "2026-07-25" }),
			],
			VENUE,
			JULY_WEEK,
		);
		expect(labels.get("pr-1")).toBe("Atlas Agency · Delta Crew");
	});

	it("leaves out nights outside the window, as the money does", () => {
		const labels = agencyLabelsByPr(
			[row({ agencyName: "Old Agency", shiftDate: "2026-06-01" })],
			VENUE,
			JULY_WEEK,
		);
		expect(labels.has("pr-1")).toBe(false);
	});

	it("honours a custom range's exact days", () => {
		const labels = agencyLabelsByPr([row({ shiftDate: "2026-07-23" })], VENUE, {
			...JULY_WEEK,
			dateIsos: ["2026-07-24"],
		});
		expect(labels.has("pr-1")).toBe(false);
	});

	it("leaves out the non-staffing statuses the cost rows exclude", () => {
		const labels = agencyLabelsByPr(
			[
				row({ status: "cancelled" }),
				row({ status: "no_show" }),
				row({ status: "leave_approved" }),
			],
			VENUE,
			JULY_WEEK,
		);
		expect(labels.has("pr-1")).toBe(false);
	});

	it("never names an agency from another venue on a two-venue account", () => {
		const labels = agencyLabelsByPr(
			[row({ outletId: "outlet-other", agencyName: "Elsewhere Co" })],
			VENUE,
			JULY_WEEK,
		);
		expect(labels.has("pr-1")).toBe(false);
	});

	it("skips a row with no joined agency name rather than printing a blank", () => {
		const labels = agencyLabelsByPr(
			[row({ agencyName: null })],
			VENUE,
			JULY_WEEK,
		);
		expect(labels.has("pr-1")).toBe(false);
	});
});

/**
 * WAGES SPLIT BY THE AGENCY THAT SUPPLIED THEM (22 Oct 2026) — the half of the
 * reconciliation card a statement is checked against. A statement is one
 * agency's bill, so its wages must be that agency's alone.
 */
describe("wagesByAgency", () => {
	const cost = (over: {
		agencyId?: string | null;
		soldOn?: string;
		cost?: number;
	}) => ({
		prId: "pr-1",
		prName: "Mia",
		soldOn: "2026-07-23",
		cost: 100,
		commission: 40,
		overtime: 25,
		agencyId: "agency-atlas",
		...over,
	});

	it("sums wages alone per agency inside the window", () => {
		const byAgency = wagesByAgency(
			[
				cost({}),
				cost({ soldOn: "2026-07-24", cost: 150 }),
				cost({ agencyId: "agency-delta", cost: 80 }),
				cost({ soldOn: "2026-06-01", cost: 999 }),
			],
			JULY_WEEK,
		);
		// Commission and overtime stay out — the statement never billed them.
		expect(byAgency?.get("agency-atlas")).toBe(250);
		expect(byAgency?.get("agency-delta")).toBe(80);
	});

	it("is null when an in-range row carries no agency (an older backend)", () => {
		expect(
			wagesByAgency([cost({ agencyId: undefined })], JULY_WEEK),
		).toBeNull();
	});

	it("ignores an agency-less row outside the window", () => {
		const byAgency = wagesByAgency(
			[cost({}), cost({ agencyId: null, soldOn: "2026-06-01" })],
			JULY_WEEK,
		);
		expect(byAgency?.get("agency-atlas")).toBe(100);
	});
});

describe("agencyNamesById", () => {
	it("names each agency id from the joined name, skipping blanks", () => {
		const names = agencyNamesById([
			{ agencyId: "agency-atlas", agencyName: null },
			{ agencyId: "agency-atlas", agencyName: "Atlas Agency" },
			{ agencyId: "agency-delta", agencyName: "" },
		]);
		expect(names.get("agency-atlas")).toBe("Atlas Agency");
		expect(names.has("agency-delta")).toBe(false);
	});
});
