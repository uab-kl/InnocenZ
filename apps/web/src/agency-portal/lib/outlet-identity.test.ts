import { beforeEach, describe, expect, it } from "vitest";
import { writeTabScoped } from "@/lib/auth/tab-scoped-storage";
import type { OutletMembership } from "@/services/outlet";
import {
	getOutletIdentity,
	identityFromMembership,
	outletSubRoleFromBackend,
	saveOutletIdentity,
} from "./outlet-identity";

/**
 * THE CACHE THAT BELONGED TO SOMEONE ELSE.
 *
 * `iz-outlet-identity` is tab-scoped but SEEDED from localStorage, so a brand-new
 * tab inherits whatever the last portal sign-in on this machine wrote. The portal
 * mount prefers that cache over re-deriving, so an Owner could run a whole
 * session on a Director lane cached by an earlier tab — and the symptom was
 * almost invisible: every module-granted screen (Post Job, Workspace, Settings)
 * still worked off the backend grants, and only the MATRIX-ONLY permissions
 * vanished. `requestCutLoss` is the only outlet permission with no module
 * mapping, so "Reduce cutlost" disappeared from Today on its own, with no error.
 *
 * The identity now names the user it was derived for, and a read that knows who
 * is signed in refuses anything else.
 */

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const DIRECTOR_ID = "22222222-2222-4222-8222-222222222222";

function membership(over: Partial<OutletMembership> = {}): OutletMembership {
	return {
		membershipId: "membership-1",
		userId: OWNER_ID,
		outletId: "outlet-1",
		outletName: "Emhub Testing",
		outletStatus: "active",
		subRole: "owner",
		status: "active",
		...over,
	};
}

beforeEach(() => {
	sessionStorage.clear();
	localStorage.clear();
});

describe("outletSubRoleFromBackend", () => {
	/**
	 * Every lane spelled out, because the owner was NOT — it relied on falling
	 * through to a fallback that used to be `outlet_owner`, and once that
	 * fallback became least privilege every owner silently became a Director.
	 * A table beats four assertions here: adding a lane cannot quietly miss one.
	 */
	it.each([
		["owner", "outlet_owner"],
		["finance", "outlet_finance"],
		["operations_head", "outlet_ops"],
		["director", "outlet_director"],
		["guarantor", "outlet_guarantor"],
	] as const)("maps %s to %s", (backend, portal) => {
		expect(outletSubRoleFromBackend(backend)).toBe(portal);
	});

	it("hands an unknown lane the least privilege, never the owner's", () => {
		expect(
			outletSubRoleFromBackend(
				"regional_manager" as Parameters<typeof outletSubRoleFromBackend>[0],
			),
		).toBe("outlet_director");
	});
});

describe("identityFromMembership", () => {
	it("stamps the user the membership belongs to", () => {
		expect(identityFromMembership(membership()).userId).toBe(OWNER_ID);
	});

	it("carries the lane and venue beside that user", () => {
		const identity = identityFromMembership(
			membership({ userId: DIRECTOR_ID, subRole: "director" }),
		);
		expect(identity).toMatchObject({
			userId: DIRECTOR_ID,
			outletId: "outlet-1",
			outletName: "Emhub Testing",
			subRole: "outlet_director",
		});
	});
});

describe("getOutletIdentity", () => {
	it("returns the cache to the user it was derived for", () => {
		saveOutletIdentity(identityFromMembership(membership()));
		expect(getOutletIdentity(OWNER_ID)?.subRole).toBe("outlet_owner");
	});

	it("refuses a cache that names a DIFFERENT user", () => {
		// The bug in one line: the Director signed in on this machine first, then
		// the Owner opened a new tab and inherited the seed.
		saveOutletIdentity(
			identityFromMembership(
				membership({ userId: DIRECTOR_ID, subRole: "director" }),
			),
		);
		expect(getOutletIdentity(OWNER_ID)).toBeNull();
	});

	it("refuses an UNSTAMPED cache — it could have come from any account", () => {
		// Exactly the shape every tab held before this fix shipped.
		writeTabScoped(
			"iz-outlet-identity",
			JSON.stringify({
				outletId: "outlet-1",
				outletName: "Emhub Testing",
				subRole: "outlet_director",
				outletStatus: "active",
			}),
		);
		expect(getOutletIdentity(OWNER_ID)).toBeNull();
		// And with no expected user either: an anonymous cache is not a valid one,
		// so the hooks that only ask "is this a real session, and which venue"
		// re-derive instead of inheriting a stranger's.
		expect(getOutletIdentity()).toBeNull();
	});

	it("still clamps an unknown lane to least privilege", () => {
		writeTabScoped(
			"iz-outlet-identity",
			JSON.stringify({
				userId: OWNER_ID,
				outletId: "outlet-1",
				outletName: "Emhub Testing",
				subRole: "outlet_superuser",
				outletStatus: "active",
			}),
		);
		expect(getOutletIdentity(OWNER_ID)?.subRole).toBe("outlet_director");
	});

	it("returns null when nothing is cached", () => {
		expect(getOutletIdentity(OWNER_ID)).toBeNull();
	});
});
