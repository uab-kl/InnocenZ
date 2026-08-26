import { beforeEach, describe, expect, it } from "vitest";
import type { AgencyMembership } from "@/services/agency";
import {
	agencySubRoleFromBackend,
	getAgencyIdentity,
	identityFromMembership,
	saveAgencyIdentity,
} from "./agency-identity";

/**
 * The agency twin of `outlet-identity.test.ts`, and it carries the same two
 * faults: an `owner` membership that was never named in the lane map (so it fell
 * through to least privilege the moment that fallback stopped being the owner),
 * and a tab-scoped identity cache that could be inherited from another account.
 * Both are one-liners; neither failed loudly, because module grants answer for
 * most of the console.
 */

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const FINANCE_ID = "33333333-3333-4333-8333-333333333333";

function membership(over: Partial<AgencyMembership> = {}): AgencyMembership {
	return {
		membershipId: "membership-1",
		userId: OWNER_ID,
		agencyId: "agency-1",
		agencyName: "Atlas Talent",
		agencyCode: "AG-0001",
		agencyStatus: "active",
		subRole: "owner",
		status: "active",
		...over,
	};
}

beforeEach(() => {
	sessionStorage.clear();
	localStorage.clear();
});

describe("agencySubRoleFromBackend", () => {
	it.each([
		["owner", "agency_owner"],
		["finance", "agency_finance"],
		["director", "agency_director"],
		["guarantor", "agency_guarantor"],
	] as const)("maps %s to %s", (backend, portal) => {
		expect(agencySubRoleFromBackend(backend)).toBe(portal);
	});

	it("hands an unknown lane the least privilege, never the owner's", () => {
		expect(
			agencySubRoleFromBackend(
				"regional_head" as Parameters<typeof agencySubRoleFromBackend>[0],
			),
		).toBe("agency_director");
	});
});

describe("getAgencyIdentity", () => {
	it("returns the cache to the user it was derived for", () => {
		saveAgencyIdentity(identityFromMembership(membership()));
		expect(getAgencyIdentity(OWNER_ID)?.subRole).toBe("agency_owner");
	});

	it("refuses a cache that names a different user", () => {
		saveAgencyIdentity(
			identityFromMembership(
				membership({ userId: FINANCE_ID, subRole: "finance" }),
			),
		);
		expect(getAgencyIdentity(OWNER_ID)).toBeNull();
	});
});
