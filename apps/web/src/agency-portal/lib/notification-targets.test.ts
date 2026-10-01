import { describe, expect, it } from "vitest";
import type {
	NotificationKind,
	NotificationRecord,
} from "@/services/notification";
import {
	gateAgencyTarget,
	notificationTarget,
	opsKindFor,
} from "./notification-targets";

/**
 * THE BELLS' ICONS AND DOORS (28 Sep 2026 audit, agency portal, seen live):
 * "bill notices have no icon or link, notifications open a page rather than
 * the item". Every row below has the payload shape the backend writes today
 * (`innocenz-test`, 29 Sep, read-only).
 */

function row(
	kind: NotificationKind,
	payload: Record<string, unknown> | null = null,
): NotificationRecord {
	return {
		id: "n1",
		userId: "u1",
		kind,
		title: "t",
		body: null,
		payload,
		readAt: null,
		createdAt: "2026-09-28T10:00:00.000Z",
	};
}

describe("opsKindFor — every kind the backend writes has a chip", () => {
	it("THE BUG: a new bill is a Subscription row, not an unknown one", () => {
		expect(opsKindFor("subscription_invoice_opened")).toBe(
			"subscription_tier_weekly",
		);
		expect(opsKindFor("subscription_autopay_failed")).toBe(
			"subscription_tier_weekly",
		);
	});

	it("cut-loss requests and answers have their own chip", () => {
		expect(opsKindFor("cutlost_requested")).toBe("cutlost");
		expect(opsKindFor("cutlost_decided")).toBe("cutlost");
	});

	it("a kind this build has never heard of still degrades to a readable row", () => {
		expect(opsKindFor("from_a_newer_backend" as NotificationKind)).toBe(
			"unknown",
		);
	});
});

describe("notificationTarget — the ITEM, not just the page", () => {
	it("THE BUG: a new bill opens Subscription, for an agency and for a venue", () => {
		const bill = row("subscription_invoice_opened", {
			amount: "99.00",
			currency: "MYR",
			count: 1,
			periodStart: "2026-09-27",
			periodEnd: "2026-10-03",
		});
		expect(notificationTarget(bill, "agency")).toEqual({
			href: "/agency/subscription",
		});
		expect(notificationTarget(bill, "outlet")).toEqual({
			href: "/outlet/subscription",
		});
	});

	it("a day-review notice holding ONE voucher opens that voucher", () => {
		const held = row("pv_day_review_pending", {
			voucherIds: ["pv-uuid-1"],
			weekStart: "2026-09-20",
			weekEnd: "2026-09-26",
		});
		expect(notificationTarget(held, "agency")).toEqual({
			href: "/agency/pv",
			search: { pv: "pv-uuid-1" },
		});
	});

	it("holding several, it opens the list filtered to what waits on review", () => {
		const held = row("pv_day_review_pending", {
			voucherIds: ["a", "b"],
		});
		expect(notificationTarget(held, "agency")).toEqual({
			href: "/agency/pv",
			search: { status: "PENDING_REVIEW" },
		});
	});

	it("overtime opens Payroll's Overtime tab, where it is decided — not the roster", () => {
		expect(
			notificationTarget(
				row("overtime_pending_approval", { assignmentId: "a" }),
				"agency",
			),
		).toEqual({ href: "/agency/pv", search: { tab: "overtime" } });
	});

	it("an MC/leave request opens Approvals ON the MC/Leaves tab", () => {
		expect(
			notificationTarget(
				row("leave_requested", { assignmentId: "a", shiftId: "s" }),
				"agency",
			),
		).toEqual({ href: "/agency/pending", search: { tab: "leaves" } });
	});

	it("a cut-loss request opens Approvals on the Cutlost tab; its answer opens the venue floor", () => {
		expect(
			notificationTarget(
				row("cutlost_requested", { requestId: "r", shiftId: "s" }),
				"agency",
			),
		).toEqual({ href: "/agency/pending", search: { tab: "cutlost" } });
		expect(
			notificationTarget(
				row("cutlost_decided", { requestId: "r", decision: "approve" }),
				"outlet",
			),
		).toEqual({ href: "/outlet" });
	});

	it("a rating drop opens that PR", () => {
		expect(
			notificationTarget(
				row("pr_rating_low", { prId: "pr-1", average: 2.5 }),
				"agency",
			),
		).toEqual({ href: "/agency/prs", search: { pr: "pr-1" } });
	});

	it("a voucher notice opens the voucher", () => {
		expect(
			notificationTarget(
				row("payment_voucher_paid", { voucherId: "pv-9" }),
				"agency",
			),
		).toEqual({ href: "/agency/pv", search: { pv: "pv-9" } });
	});

	it("an id missing from the payload falls back to the page, never to a broken link", () => {
		expect(notificationTarget(row("pr_rating_low", {}), "agency")).toEqual({
			href: "/agency/prs",
		});
		expect(
			notificationTarget(row("pv_day_review_pending", null), "agency"),
		).toEqual({ href: "/agency/pv", search: { status: "PENDING_REVIEW" } });
	});

	it("a broadcast has nothing to open", () => {
		expect(
			notificationTarget(row("agency_broadcast", { agencyId: "a" }), "agency"),
		).toBeUndefined();
	});
});

describe("gateAgencyTarget — a door the reader will be let through, or none", () => {
	it("a reader who cannot open the page gets no link (the row is still marked read)", () => {
		const target = notificationTarget(
			row("pr_rating_low", { prId: "pr-1" }),
			"agency",
		);
		expect(gateAgencyTarget(target, () => false)).toBeUndefined();
	});

	it("a reader who can keeps the item", () => {
		const target = notificationTarget(
			row("leave_requested", { assignmentId: "a" }),
			"agency",
		);
		expect(gateAgencyTarget(target, (p) => p === "viewApprovals")).toEqual({
			href: "/agency/pending",
			search: { tab: "leaves" },
		});
	});
});
