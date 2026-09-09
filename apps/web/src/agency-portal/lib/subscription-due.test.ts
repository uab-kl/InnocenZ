import { describe, expect, it } from "vitest";
import {
	type DueInvoiceLike,
	dueStatusFor,
	GRACE_DAYS,
	isSettled,
	overdueSummary,
} from "./subscription-due";

/**
 * These pin the arithmetic behind a warning that chases somebody for money.
 * Every date here is a REAL row from the live database on 8 Sep 2026, so the
 * expectations are what the owner will actually see on the screen.
 */
const TODAY = new Date("2026-09-08T12:00:00+08:00");

/** Atlas Agency's live weekly periods, RM 125.00, all `unpaid`. */
const inv = (
	periodEnd: string,
	over: Partial<DueInvoiceLike> = {},
): DueInvoiceLike => ({
	periodEnd,
	status: "unpaid",
	paidAt: null,
	amount: "125.00",
	...over,
});

describe("dueStatusFor — the four states, on real weekly rows", () => {
	it("counts lateness from the DUE date, not from the period end", () => {
		// Arrange — 16–22 Aug, so due 29 Aug under the 7-day weekly grace.
		const invoice = inv("2026-08-22");

		// Act
		const status = dueStatusFor(invoice, "weekly", TODAY);

		// Assert — 8 Sep is 10 days past 29 Aug, NOT 17 days past 22 Aug.
		expect(status.bucket).toBe("overdue");
		expect(status.dueIso).toBe("2026-08-29");
		expect(status.daysOverdue).toBe(10);
	});

	it("calls the most recently finished period overdue by only a few days", () => {
		const status = dueStatusFor(inv("2026-08-29"), "weekly", TODAY);
		expect(status.bucket).toBe("overdue");
		expect(status.dueIso).toBe("2026-09-05");
		expect(status.daysOverdue).toBe(3);
	});

	it("leaves a period alone while its grace is still running", () => {
		// 30 Aug–5 Sep ended, due 12 Sep — 4 days out, past the 3-day warning window.
		const status = dueStatusFor(inv("2026-09-05"), "weekly", TODAY);
		expect(status.bucket).toBe("not_yet_due");
		expect(status.daysUntilDue).toBe(4);
		expect(status.daysOverdue).toBe(0);
	});

	it("flags DUE SOON once the due date is inside half the grace window", () => {
		// The same invoice read a day later: due 12 Sep, now 3 days away.
		const status = dueStatusFor(
			inv("2026-09-05"),
			"weekly",
			new Date("2026-09-09T12:00:00+08:00"),
		);
		expect(status.bucket).toBe("due_soon");
		expect(status.daysUntilDue).toBe(3);
	});

	it("never calls the CURRENT period late — it is not finished being used", () => {
		// 6–12 Sep is still running on 8 Sep. It is payable in advance and appears
		// in the list, but a period in progress cannot be in arrears.
		const status = dueStatusFor(inv("2026-09-12"), "weekly", TODAY);
		expect(status.bucket).toBe("not_yet_due");
		expect(status.periodInProgress).toBe(true);
		expect(status.daysOverdue).toBe(0);
	});
});

describe("dueStatusFor — the boundary that decides who gets chased", () => {
	it("is NOT overdue on the due date itself", () => {
		// Period ends 5 Sep, due 12 Sep, read late ON 12 Sep.
		const status = dueStatusFor(
			inv("2026-09-05"),
			"weekly",
			new Date("2026-09-12T23:00:00+08:00"),
		);
		expect(status.bucket).toBe("due_soon");
		expect(status.daysOverdue).toBe(0);
	});

	it("is overdue by exactly one the very next day", () => {
		const status = dueStatusFor(
			inv("2026-09-05"),
			"weekly",
			new Date("2026-09-13T01:00:00+08:00"),
		);
		expect(status.bucket).toBe("overdue");
		expect(status.daysOverdue).toBe(1);
	});
});

describe("dueStatusFor — a settled invoice is never warned about", () => {
	it("treats a paid_at stamp as settled even when status still says unpaid", () => {
		const status = dueStatusFor(
			inv("2026-08-22", { paidAt: "2026-08-25T00:00:00Z" }),
			"weekly",
			TODAY,
		);
		expect(status.bucket).toBe("paid");
	});

	it("reads the status column for the ordinary case", () => {
		expect(isSettled({ status: "paid" })).toBe(true);
		expect(isSettled({ status: "unpaid" })).toBe(false);
		expect(isSettled({ status: null })).toBe(false);
	});

	it("says nothing at all when the period end cannot be read", () => {
		// Better to show no due date than to invent one on a money screen.
		const status = dueStatusFor(inv("not-a-date"), "weekly", TODAY);
		expect(status.dueIso).toBeNull();
		expect(status.bucket).toBe("not_yet_due");
	});
});

describe("dueStatusFor — both cadences share one 7-day term", () => {
	it("gives monthly the same seven days as weekly (owner, 8 Sep 2026)", () => {
		// Monthly began on net-14 and was levelled to 7. ⚠️ While the two are
		// equal, NOTHING OBSERVABLE distinguishes the cadence paths — this pair
		// of assertions is the honest limit of what a due date can prove here.
		expect(GRACE_DAYS.weekly).toBe(7);
		expect(GRACE_DAYS.monthly).toBe(7);
	});

	it("dates the live outlet period from its period end either way", () => {
		// 7 Aug – 6 Sep: due 13 Sep under both terms, so still not late on 8 Sep.
		const monthly = dueStatusFor(
			inv("2026-09-06", { amount: "999.00" }),
			"monthly",
			TODAY,
		);
		const weekly = dueStatusFor(inv("2026-09-06"), "weekly", TODAY);
		expect(monthly.dueIso).toBe("2026-09-13");
		expect(weekly.dueIso).toBe(monthly.dueIso);
		expect(monthly.bucket).toBe("not_yet_due");
	});

	it("puts a monthly period inside the 3-day warning window, as weekly does", () => {
		// The due-soon window is half the grace, so levelling the term also
		// levelled the warning: 3 days for both, where monthly used to get 7.
		const status = dueStatusFor(
			inv("2026-09-06"),
			"monthly",
			new Date("2026-09-11T12:00:00+08:00"),
		);
		expect(status.bucket).toBe("due_soon");
		expect(status.daysUntilDue).toBe(2);
	});
});

describe("overdueSummary — what is LATE, never merely what is unpaid", () => {
	const liveAtlasWeeks: DueInvoiceLike[] = [
		inv("2026-09-12"), // current period, still running
		inv("2026-09-05"), // due 12 Sep, not yet
		inv("2026-08-29"), // due 5 Sep, 3 days late
		inv("2026-08-22"), // due 29 Aug, 10 days late
	];

	it("counts only the two genuinely late periods out of four unpaid ones", () => {
		const summary = overdueSummary(liveAtlasWeeks, "weekly", TODAY);
		expect(summary.count).toBe(2);
		expect(summary.amountRm).toBe(250);
	});

	it("names the OLDEST due date — the one ignored longest", () => {
		const summary = overdueSummary(liveAtlasWeeks, "weekly", TODAY);
		expect(summary.oldestDueIso).toBe("2026-08-29");
		expect(summary.oldestDaysOverdue).toBe(10);
	});

	it("reports nothing when everything is paid, so the warning stays silent", () => {
		const summary = overdueSummary(
			liveAtlasWeeks.map((i) => ({ ...i, status: "paid" })),
			"weekly",
			TODAY,
		);
		expect(summary).toEqual({
			count: 0,
			amountRm: 0,
			oldestDueIso: null,
			oldestDaysOverdue: 0,
		});
	});

	it("counts WINDOWS, not invoice rows, when a period holds several lanes", () => {
		// The live outlet case, and the one the agency can never produce: a single
		// billing window carrying a plan invoice, a POS add-on and an upgrade.
		// The banner sat above ONE red row saying "3 billing periods" until this.
		const oneWindowThreeLanes: DueInvoiceLike[] = [
			{
				periodStart: "2026-08-03",
				periodEnd: "2026-09-02",
				status: "unpaid",
				amount: "6000.00",
				billingCycle: "monthly",
			},
			{
				periodStart: "2026-08-03",
				periodEnd: "2026-09-02",
				status: "unpaid",
				amount: "999.00",
				billingCycle: "monthly",
			},
			{
				periodStart: "2026-08-03",
				periodEnd: "2026-09-02",
				status: "unpaid",
				amount: "200.00",
				billingCycle: "monthly",
			},
		];

		const summary = overdueSummary(
			oneWindowThreeLanes,
			"monthly",
			new Date("2026-10-01T12:00:00+08:00"),
		);

		// ONE period is late...
		expect(summary.count).toBe(1);
		// ...but all three lanes are owed within it.
		expect(summary.amountRm).toBe(7199);
		// 2 Sep + 7 = 9 Sep. This read 16 Sep while monthly was on net-14.
		expect(summary.oldestDueIso).toBe("2026-09-09");
	});

	it("still counts two distinct windows as two", () => {
		const twoWindows: DueInvoiceLike[] = [
			{
				periodStart: "2026-08-03",
				periodEnd: "2026-09-02",
				status: "unpaid",
				amount: "10.00",
				billingCycle: "monthly",
			},
			{
				periodStart: "2026-07-03",
				periodEnd: "2026-08-02",
				status: "unpaid",
				amount: "10.00",
				billingCycle: "monthly",
			},
		];
		expect(
			overdueSummary(
				twoWindows,
				"monthly",
				new Date("2026-10-01T12:00:00+08:00"),
			).count,
		).toBe(2);
	});

	it("sums in integer cents, so repeated odd amounts do not drift", () => {
		const odd = Array.from({ length: 3 }, () =>
			inv("2026-08-22", { amount: "0.07" }),
		);
		expect(overdueSummary(odd, "weekly", TODAY).amountRm).toBe(0.21);
	});
});
