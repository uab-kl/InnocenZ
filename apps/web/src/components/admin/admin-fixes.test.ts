import { describe, expect, it } from "vitest";
import { actorText } from "@/components/admin/actor-name";
import { adminConsoleRoleLabel } from "@/components/admin/admin-role-label";
import {
	PV_STATUS_BADGE,
	RECEIPT_STATUS_BADGE,
} from "@/components/admin/pv-status-tone";
import {
	buildOrgNameMap,
	currentOrgName,
} from "@/components/admin/use-current-org-names";
import {
	auditEntityLabel,
	formatAuditTimestamp,
} from "@/components/audit-log/audit-log-format";
import { recordedRoleText } from "@/components/audit-log/audit-log-role-copy";
import { memberPageTarget } from "@/components/organization/member-page-target";
import {
	memberStatusBadgeClass,
	memberStatusLabel,
} from "@/components/organization/org-status";
import { pagePlansByPrice } from "@/components/subscription/plan-catalogue-page";
import {
	type PortalTranslations,
	translations,
} from "@/lib/portal-i18n/translations";

const t = {
	adminUsers: { actorSystem: "System", actorUnknown: "Unknown" },
} as unknown as PortalTranslations;

/** The real English dictionary — the labels below are its words, not a stub's. */
const tStatus = translations.en;

describe("PV status colours follow the owner's code", () => {
	it("draws signed and paid green, pending and sent amber, disputed red", () => {
		expect(PV_STATUS_BADGE.signed).toContain("emerald");
		expect(PV_STATUS_BADGE.paid).toContain("emerald");
		expect(PV_STATUS_BADGE.pending_review).toContain("amber");
		expect(PV_STATUS_BADGE.sent).toContain("amber");
		expect(PV_STATUS_BADGE.disputed).toContain("rose");
		for (const tone of Object.values(PV_STATUS_BADGE)) {
			expect(tone).not.toMatch(/sky|violet/);
		}
	});

	it("keeps an approved receipt amber beside pending, verified green", () => {
		expect(RECEIPT_STATUS_BADGE.pending).toBe(RECEIPT_STATUS_BADGE.approved);
		expect(RECEIPT_STATUS_BADGE.approved).toContain("amber");
		expect(RECEIPT_STATUS_BADGE.verified).toContain("emerald");
	});
});

describe("actorText never prints a raw account id", () => {
	const id = "96cb6034-1111-4222-8333-944455556666";

	it("prefers the resolved name", () => {
		expect(actorText(id, "Siaw Long", t)).toBe("Siaw Long");
	});

	it("shows a placeholder while resolving and Unknown once it is gone", () => {
		expect(actorText(id, null, t, true)).toBe("…");
		expect(actorText(id, null, t)).toBe("Unknown");
	});

	it("names system, gateways and service tokens in words", () => {
		expect(actorText("system", null, t)).toBe("System");
		expect(actorText("gateway:fiuu", null, t)).toBe("fiuu");
		expect(actorText(null, null, t)).toBe("—");
	});

	it("never prints a seed or script tag — those read as System", () => {
		for (const tag of [
			"seed-sample",
			"seed-org-details",
			"seed-why-we-met",
			"weekly-payout-job",
			"member-signup",
			"probe:role-deactivation",
		]) {
			expect(actorText(tag, null, t)).toBe("System");
		}
	});

	it("still prefers a server-joined name over the tag", () => {
		expect(actorText("seed-sample", "Siaw Long", t)).toBe("Siaw Long");
	});
});

describe("member status labels on the member page", () => {
	it("words every membership and account state, never the raw code", () => {
		expect(memberStatusLabel("active", tStatus)).toBe("Active");
		expect(memberStatusLabel("inactive", tStatus)).toBe("Inactive");
		expect(memberStatusLabel("pending", tStatus)).toBe("Awaiting approval");
		expect(memberStatusLabel("rejected", tStatus)).toBe("Declined");
		expect(memberStatusLabel("blocked", tStatus)).toBe("Blocked");
	});

	it("keeps the organisation states as they were", () => {
		expect(memberStatusLabel("pending_review", tStatus)).toBe("Pending review");
		expect(memberStatusLabel("suspended", tStatus)).toBe("Suspended");
	});

	it("colours by the owner's code: amber waiting, red refused, grey off", () => {
		expect(memberStatusBadgeClass("pending")).toContain("amber");
		expect(memberStatusBadgeClass("rejected")).toContain("rose");
		expect(memberStatusBadgeClass("blocked")).toContain("rose");
		expect(memberStatusBadgeClass("active")).toContain("emerald");
		expect(memberStatusBadgeClass("inactive")).toContain("muted");
		expect(memberStatusBadgeClass("something-new")).toContain("muted");
	});
});

describe("adminConsoleRoleLabel", () => {
	it("labels the stored lower-case admin role", () => {
		expect(adminConsoleRoleLabel(["admin"], tStatus)).toBe("Admin");
		expect(adminConsoleRoleLabel(["Finance", "admin"], tStatus)).toBe("Admin");
	});

	it("gives the not-loaded stand-in the same label", () => {
		expect(adminConsoleRoleLabel(undefined, tStatus)).toBe("Admin");
	});
});

describe("currentOrgName reads the org row, not the stored copy", () => {
	const names = buildOrgNameMap(
		[{ id: "a1", name: "Why We Met" }],
		[{ id: "o1", name: "UAB Emhub" }],
	);

	it("returns today's name for a renamed organisation", () => {
		expect(currentOrgName(names, "outlet", "o1", "Emhub Testing")).toBe(
			"UAB Emhub",
		);
		expect(currentOrgName(names, "agency", "a1", "Why We Met Agency")).toBe(
			"Why We Met",
		);
	});

	it("keys by kind, so an agency id never resolves as an outlet", () => {
		expect(currentOrgName(names, "outlet", "a1", "Stored")).toBe("Stored");
	});

	it("falls back to the stored copy when the org is not loaded", () => {
		expect(currentOrgName(names, "agency", "gone", "Old Name")).toBe(
			"Old Name",
		);
		expect(currentOrgName(names, null, null, "Old Name")).toBe("Old Name");
	});
});

describe("pagePlansByPrice sorts the whole catalogue before paging", () => {
	const plans = Array.from({ length: 13 }, (_, i) => ({
		name: `Plan ${i}`,
		// Server order is not price order: the cheapest arrives LAST.
		price: String(1300 - i * 100),
	}));

	it("puts the cheapest plan on page 1 even when the server sent it last", () => {
		const first = pagePlansByPrice(plans, 1, 10);
		expect(first.rows[0].price).toBe("100");
		expect(first.rows).toHaveLength(10);
		expect(first.pagination).toMatchObject({
			page: 1,
			totalCount: 13,
			totalPages: 2,
			hasNextPage: true,
			hasPrevPage: false,
		});
		const second = pagePlansByPrice(plans, 2, 10);
		expect(second.rows.map((row) => row.price)).toEqual([
			"1100",
			"1200",
			"1300",
		]);
	});

	it("clamps a page a filter has shrunk away", () => {
		expect(pagePlansByPrice(plans.slice(0, 3), 2, 10).pagination.page).toBe(1);
	});
});

describe("audit log formatting", () => {
	it("prints the admin's day-first date, never month-first", () => {
		const text = formatAuditTimestamp(
			new Date(2026, 4, 10, 15, 4, 5).toISOString(),
		);
		expect(text).toMatch(/^10 May 2026/);
		expect(text).toMatch(/03:04:05/);
		expect(text).not.toContain("05/10/2026");
	});

	it("keeps an unparseable value as it was", () => {
		expect(formatAuditTimestamp("not a date")).toBe("not a date");
	});

	it("writes the recorded PR role as the acronym", () => {
		expect(recordedRoleText("pr")).toBe("PR");
		expect(recordedRoleText("agency")).toBe("Agency");
	});

	it("makes a route-slug table name readable, never the raw slug", () => {
		expect(auditEntityLabel("shift-template")).toBe("Shift Template");
		expect(auditEntityLabel("payment-voucher-receipt")).toBe(
			"Payment Voucher Receipt",
		);
		expect(auditEntityLabel("pr-availability")).toBe("PR Availability");
		expect(auditEntityLabel("pr")).toBe("PR");
		expect(auditEntityLabel("cutlost")).toBe("Cut Loss");
	});

	it("reads the backend's mapped names as words too", () => {
		expect(auditEntityLabel("Auth")).toBe("Auth");
		expect(auditEntityLabel("Role")).toBe("Role");
		expect(auditEntityLabel("UserRole")).toBe("User Role");
		expect(auditEntityLabel("RolePermission")).toBe("Role Permission");
	});

	it("falls back to a dash for an empty key", () => {
		expect(auditEntityLabel("  ")).toBe("—");
	});
});

describe("memberPageTarget", () => {
	it("opens the agency or outlet member page for the person", () => {
		expect(memberPageTarget("agency", "a1", "u1")).toEqual({
			to: "/admin/user-management/agency/$agencyId/member/$userId",
			params: { agencyId: "a1", userId: "u1" },
		});
		expect(memberPageTarget("outlet", "o1", "u1")).toEqual({
			to: "/admin/user-management/outlet/$outletId/member/$userId",
			params: { outletId: "o1", userId: "u1" },
		});
	});

	it("never guesses a destination when an id is missing", () => {
		expect(memberPageTarget("agency", undefined, "u1")).toBeNull();
		expect(memberPageTarget(undefined, "a1", "u1")).toBeNull();
	});
});
