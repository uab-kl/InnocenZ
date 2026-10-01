import { describe, expect, it } from "vitest";
import { type OutletSubRole, outletCan } from "./outlet-rbac";
import { todayPrPanelAccess } from "./outlet-today-access";

/**
 * A DIRECTOR'S TODAY SHOWS WHO IS WORKING, READ-ONLY (29 Sep 2026 follow-up:
 * "a Director's outlet Today shows no PR panel").
 *
 * Asked of `outletCan` with no module grants, so every lane answers from the
 * matrix GENERATED from `role_permission` — the same rows the server reads.
 */
const access = (lane: OutletSubRole) =>
	todayPrPanelAccess((permission) => outletCan(lane, permission));

describe("todayPrPanelAccess", () => {
	it("shows a Director the panel, its sales and its history — and no Rate", () => {
		expect(access("outlet_director")).toEqual({
			show: true,
			canRate: false,
			canSeeSales: true,
			canSeeHistory: true,
		});
	});

	it.each([
		"outlet_owner",
		"outlet_guarantor",
		"outlet_finance",
		"outlet_ops",
	] as const)("keeps everything %s had, including Rate", (lane) => {
		expect(access(lane)).toEqual({
			show: true,
			canRate: true,
			canSeeSales: true,
			canSeeHistory: true,
		});
	});

	it("an unresolved lane is least privilege — the Director's view", () => {
		expect(
			todayPrPanelAccess((permission) => outletCan(null, permission)),
		).toEqual(access("outlet_director"));
	});

	it("a lane holding nothing sees nothing", () => {
		expect(todayPrPanelAccess(() => false)).toEqual({
			show: false,
			canRate: false,
			canSeeSales: false,
			canSeeHistory: false,
		});
	});

	it("rating alone still opens the panel, as it always did", () => {
		expect(
			todayPrPanelAccess((permission) => permission === "ratePrs").show,
		).toBe(true);
	});
});
