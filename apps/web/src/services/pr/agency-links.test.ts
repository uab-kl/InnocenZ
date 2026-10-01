import { describe, expect, it } from "vitest";
import { currentAgencyLinks, isCurrentAgencyLink } from "./agency-links";
import type { PrAgencyRef } from "./types";

/**
 * 28 Sep 2026 audit, admin (live): the PR detail sheet listed an agency the PR
 * had LEFT as still linked — the mapper dropped `approve_status`, so every
 * `agency_pr` row, departures included, read as a live membership.
 */

const link = (
	approveStatus: PrAgencyRef["approveStatus"],
	name = "Atlas",
): PrAgencyRef => ({ id: name, name, code: null, approveStatus });

describe("isCurrentAgencyLink", () => {
	it("an approved membership is current", () => {
		expect(isCurrentAgencyLink(link("approved"))).toBe(true);
	});

	it("a departure still awaiting the agency is current — she is on the roster until it says yes", () => {
		expect(isCurrentAgencyLink(link("leave_pending"))).toBe(true);
	});

	it.each([
		"left",
		"rejected",
		"pending",
	] as const)("a %s membership is NOT current", (state) => {
		expect(isCurrentAgencyLink(link(state))).toBe(false);
	});

	it("a link from a response without the field keeps the old reading", () => {
		expect(isCurrentAgencyLink(link(undefined))).toBe(true);
		expect(isCurrentAgencyLink(link(null))).toBe(true);
	});
});

describe("currentAgencyLinks", () => {
	it("keeps the agencies she works for, in order, and drops the one she left", () => {
		const links = [
			link("approved", "Atlas"),
			link("left", "Delta"),
			link("leave_pending", "Why We Met"),
		];
		expect(currentAgencyLinks(links).map((l) => l.name)).toEqual([
			"Atlas",
			"Why We Met",
		]);
	});
});
