import { describe, expect, it } from "vitest";
import type { User, UserOrganisation } from "@/lib/auth";
import {
	needsOrganisationChoice,
	organisationChooserHref,
} from "@/lib/auth/needs-organisation-choice";

/**
 * The portal layouts ask the CHOOSER's question before rendering: an account
 * with a real choice must have made it in this tab, for this portal. Without
 * it no `x-org-id` travels and the server picks — which put an agency's
 * invoices under a venue's name for an account holding both.
 */

function org(
	kind: "agency" | "outlet",
	id: string,
	over: Partial<UserOrganisation> = {},
): UserOrganisation {
	return {
		kind,
		id,
		name: `${kind} ${id}`,
		subRole: "owner",
		memberCode: null,
		membershipStatus: "active",
		orgStatus: "active",
		enterable: true,
		...over,
	};
}

function user(
	organisations: UserOrganisation[],
	over: Partial<User> = {},
): User {
	return {
		id: "u1",
		email: "a@example.com",
		username: "a",
		displayName: "A",
		contactNo: "",
		isActive: true,
		roles: [],
		portals: ["agency", "outlet"],
		organisations,
		declinedRequests: [],
		readPermission: [],
		createPermission: [],
		updatePermission: [],
		modulePermissions: [],
		...over,
	};
}

const BOTH = user([org("agency", "ag-1"), org("outlet", "ou-1")]);

describe("needsOrganisationChoice", () => {
	it("sends an agency + venue account with NO choice to the chooser", () => {
		expect(needsOrganisationChoice(BOTH, "outlet", null)).toBe(true);
		expect(needsOrganisationChoice(BOTH, "agency", null)).toBe(true);
	});

	it("refuses a choice made about the OTHER portal", () => {
		// The agency's id on the venue console is exactly the reported leak.
		expect(
			needsOrganisationChoice(BOTH, "outlet", { kind: "agency", id: "ag-1" }),
		).toBe(true);
	});

	it("refuses an id that is not one of this account's organisations", () => {
		expect(
			needsOrganisationChoice(BOTH, "outlet", { kind: "outlet", id: "ou-x" }),
		).toBe(true);
	});

	it("refuses a membership that can no longer be entered", () => {
		const removed = user([
			org("outlet", "ou-1", { enterable: false, membershipStatus: "inactive" }),
			org("outlet", "ou-2"),
			org("agency", "ag-1"),
		]);
		expect(
			needsOrganisationChoice(removed, "outlet", {
				kind: "outlet",
				id: "ou-1",
			}),
		).toBe(true);
	});

	it("lets a valid choice for this portal render", () => {
		expect(
			needsOrganisationChoice(BOTH, "outlet", { kind: "outlet", id: "ou-1" }),
		).toBe(false);
		expect(
			needsOrganisationChoice(BOTH, "agency", { kind: "agency", id: "ag-1" }),
		).toBe(false);
	});

	it("never asks a single-organisation account — unchanged behaviour", () => {
		const one = user([org("outlet", "ou-1")], { portals: ["outlet"] });
		expect(needsOrganisationChoice(one, "outlet", null)).toBe(false);
		// Even a stale choice: one place to be is an answer, not a question.
		expect(
			needsOrganisationChoice(one, "outlet", { kind: "agency", id: "gone" }),
		).toBe(false);
	});

	it("counts a deactivated membership as no choice, like the chooser", () => {
		const oneLive = user(
			[org("outlet", "ou-1"), org("agency", "ag-1", { enterable: false })],
			{ portals: ["outlet"] },
		);
		expect(needsOrganisationChoice(oneLive, "outlet", null)).toBe(false);
	});

	it("asks an admin who is also on one team, as the chooser does", () => {
		const adminPlusOne = user([org("agency", "ag-1")], {
			portals: ["admin", "agency"],
			roles: ["admin"],
		});
		expect(needsOrganisationChoice(adminPlusOne, "agency", null)).toBe(true);
		expect(
			needsOrganisationChoice(adminPlusOne, "agency", {
				kind: "agency",
				id: "ag-1",
			}),
		).toBe(false);
	});

	it("falls through when the organisation list could not be read", () => {
		const unread = user([], { portals: ["agency", "outlet"] });
		expect(needsOrganisationChoice(unread, "outlet", null)).toBe(false);
	});
});

describe("organisationChooserHref", () => {
	it("carries a portal deep link through the chooser", () => {
		expect(organisationChooserHref("/outlet/billing?tab=invoices")).toBe(
			"/choose-organisation?next=%2Foutlet%2Fbilling%3Ftab%3Dinvoices",
		);
	});

	it("drops anything that is not a portal path", () => {
		expect(organisationChooserHref("/login")).toBe("/choose-organisation");
		expect(organisationChooserHref(null)).toBe("/choose-organisation");
	});
});
