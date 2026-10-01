import { describe, expect, it } from "vitest";
import type { AgencyRosterSlot } from "./agency-demo";
import {
	rosterServerWageRows,
	slotHasServerWage,
} from "./roster-payout-breakdown";

const slot = (over: Partial<AgencyRosterSlot>): AgencyRosterSlot =>
	({
		id: "a1",
		prId: "pr-1",
		prName: "Vicky",
		outlet: "JK House",
		date: "2026-09-29",
		dateIso: "2026-09-29",
		shift: "22:00 - 04:00",
		shiftStart: "22:00",
		shiftEnd: "04:00",
		status: "scheduled",
		...over,
	}) as AgencyRosterSlot;

describe("slotHasServerWage", () => {
	it("is the server's figure when the slot carries wageRm — even RM 0", () => {
		expect(slotHasServerWage(slot({ wageRm: 500 }))).toBe(true);
		expect(slotHasServerWage(slot({ wageRm: 0 }))).toBe(true);
	});

	it("a demo slot has none and keeps the fixture", () => {
		expect(slotHasServerWage(slot({ estPayout: 360 }))).toBe(false);
	});
});

describe("rosterServerWageRows — the Est. payout sheet on a real session", () => {
	const anchor = slot({ id: "a1", prId: "pr-1", prName: "Vicky", wageRm: 500 });
	const scope = [
		anchor,
		slot({ id: "a2", prId: "pr-2", prName: "Alice", wageRm: 600.5 }),
		// Excused — off the plan, so it adds nothing, exactly as the column does.
		slot({
			id: "a3",
			prId: "pr-3",
			prName: "Mei",
			wageRm: 500,
			status: "unavailable",
		}),
		// Another shift the same night.
		slot({
			id: "a4",
			prId: "pr-4",
			prName: "Zoe",
			wageRm: 700,
			shift: "18:00 - 22:00",
		}),
		// Another venue.
		slot({
			id: "a5",
			prId: "pr-5",
			prName: "Ann",
			wageRm: 700,
			outlet: "Elsewhere",
		}),
	];

	it("lists the anchor's shift, with each booking's server wage and tier", () => {
		const { rows, totalRm } = rosterServerWageRows(anchor, scope, [
			{ id: "pr-2", trainingLevel: "Tier II" },
		]);
		expect(rows).toEqual([
			{
				slotId: "a2",
				prId: "pr-2",
				prName: "Alice",
				tier: "Tier II",
				wageRm: 600.5,
			},
			{
				slotId: "a1",
				prId: "pr-1",
				prName: "Vicky",
				tier: undefined,
				wageRm: 500,
			},
		]);
		// The sum the sheet shows is the sum of the column's own figures.
		expect(totalRm).toBe(1100.5);
	});

	it("falls back to estPayout on a slot mapped before wageRm existed", () => {
		const { rows } = rosterServerWageRows(
			anchor,
			[anchor, slot({ id: "a6", prId: "pr-6", prName: "Bea", estPayout: 450 })],
			[],
		);
		expect(rows.find((r) => r.prId === "pr-6")?.wageRm).toBe(450);
	});
});
