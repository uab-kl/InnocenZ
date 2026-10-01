import { describe, expect, it } from "vitest";
import type { AgencyRosterSlot } from "./agency-demo";
import { rosterWageBillRm, rosterWeekHeadcount } from "./roster-week-plan";

const slot = (
	id: string,
	prId: string,
	status: AgencyRosterSlot["status"] = "scheduled",
	estPayout = 500,
) => ({ id, prId, status, estPayout }) as AgencyRosterSlot;

describe("rosterWeekHeadcount — PRs rostered this week", () => {
	it("counts PEOPLE, with the bookings beside them", () => {
		// One PR on three nights and another on one: 2 PRs, 4 shifts — the tile
		// used to read "4 PRs rostered".
		expect(
			rosterWeekHeadcount([
				slot("a1", "pr-vicky"),
				slot("a2", "pr-vicky"),
				slot("a3", "pr-vicky", "on-duty"),
				slot("a4", "pr-alice"),
			]),
		).toEqual({ prs: 2, shifts: 4 });
	});

	it("leaves out bookings off the plan, and a PR who only has those", () => {
		expect(
			rosterWeekHeadcount([
				slot("a1", "pr-vicky"),
				slot("a2", "pr-vicky", "unavailable"),
				slot("a3", "pr-mc", "unavailable"),
			]),
		).toEqual({ prs: 1, shifts: 1 });
	});

	it("an empty week is nobody and nothing", () => {
		expect(rosterWeekHeadcount([])).toEqual({ prs: 0, shifts: 0 });
	});

	it("agrees with the labour cost about which bookings count", () => {
		const week = [
			slot("a1", "pr-vicky", "scheduled", 500),
			slot("a2", "pr-vicky", "unavailable", 500),
			slot("a3", "pr-alice", "scheduled", 600),
		];
		expect(rosterWeekHeadcount(week).shifts).toBe(2);
		expect(rosterWageBillRm(week)).toBe(1100);
	});
});
