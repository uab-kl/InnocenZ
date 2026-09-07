import { describe, expect, it } from "vitest";
import {
	agencyNavAlerts,
	countShiftsNeedingStaff,
	outletNavAlerts,
} from "./portal-nav-alerts";

const NO_AGENCY_WORK = {
	approvals: 0,
	vouchers: 0,
	disputes: 0,
	receipts: 0,
	overtime: 0,
	unpaidPeriods: 0,
};

describe("agencyNavAlerts", () => {
	it("returns no badges when nothing is waiting", () => {
		expect(agencyNavAlerts(NO_AGENCY_WORK)).toEqual({});
	});

	it("omits a route whose own queue is empty rather than badging it zero", () => {
		const alerts = agencyNavAlerts({ ...NO_AGENCY_WORK, approvals: 3 });

		expect(alerts["/agency/pending"]).toEqual({ count: 3, tone: "amber" });
		expect(alerts["/agency/pv"]).toBeUndefined();
		expect(alerts["/agency/subscription"]).toBeUndefined();
	});

	it("sums the four payroll queues into the one Payroll row", () => {
		const alerts = agencyNavAlerts({
			...NO_AGENCY_WORK,
			vouchers: 1,
			receipts: 2,
			overtime: 4,
		});

		expect(alerts["/agency/pv"]).toEqual({ count: 7, tone: "amber" });
	});

	it("turns Payroll red when a dispute is in the pile", () => {
		const alerts = agencyNavAlerts({
			...NO_AGENCY_WORK,
			vouchers: 1,
			disputes: 1,
		});

		expect(alerts["/agency/pv"]).toEqual({ count: 2, tone: "red" });
	});

	it("keeps unpaid billing amber — waiting money is not a dispute", () => {
		const alerts = agencyNavAlerts({ ...NO_AGENCY_WORK, unpaidPeriods: 2 });

		expect(alerts["/agency/subscription"]).toEqual({ count: 2, tone: "amber" });
	});
});

describe("outletNavAlerts", () => {
	it("returns no badges when nothing is waiting", () => {
		expect(
			outletNavAlerts({ shiftsNeedingStaff: 0, unpaidPeriods: 0 }),
		).toEqual({});
	});

	it("badges Today with short-staffed shifts and Subscription with unpaid periods", () => {
		expect(
			outletNavAlerts({ shiftsNeedingStaff: 2, unpaidPeriods: 1 }),
		).toEqual({
			"/outlet": { count: 2, tone: "amber" },
			"/outlet/subscription": { count: 1, tone: "amber" },
		});
	});
});

describe("countShiftsNeedingStaff", () => {
	it("counts a shift with fewer people than it asked for", () => {
		expect(
			countShiftsNeedingStaff([
				{ quantity: 3, prs: ["a"], status: "confirmed" },
			]),
		).toBe(1);
	});

	it("does not count a shift that is full", () => {
		expect(
			countShiftsNeedingStaff([
				{ quantity: 2, prs: ["a", "b"], status: "confirmed" },
			]),
		).toBe(0);
	});

	it("trusts the server's cross-agency count over the ids this caller can see", () => {
		// The other agency filled the second seat; `prs` only ever holds our own.
		expect(
			countShiftsNeedingStaff([
				{ quantity: 2, prs: ["a"], suppliedTotal: 2, status: "confirmed" },
			]),
		).toBe(0);
	});

	it("ignores sealed and draft shifts — neither is waiting on anyone", () => {
		expect(
			countShiftsNeedingStaff([
				{ quantity: 3, prs: [], status: "sealed" },
				{ quantity: 3, prs: [], status: "draft" },
			]),
		).toBe(0);
	});

	it("counts a shift whose demand was cut but is still short", () => {
		expect(
			countShiftsNeedingStaff([
				{ quantity: 4, demandCut: 1, prs: ["a"], status: "confirmed" },
			]),
		).toBe(1);
	});

	it("does not count a shift whose demand was cut down to what is staffed", () => {
		expect(
			countShiftsNeedingStaff([
				{ quantity: 4, demandCut: 3, prs: ["a"], status: "confirmed" },
			]),
		).toBe(0);
	});
});
