import { describe, expect, it } from "vitest";
import { outletCan } from "./outlet-rbac";

/**
 * WHO MAY RAISE A CUT-LOSS.
 *
 * The web answer must match the server's, which gates `POST /cutlost` by LANE —
 * `requireOutletSubRole('owner', 'finance', 'operations_head')`, with guarantor
 * folded into owner — rather than by a module grant, because outlet Finance
 * holds no `booking` permission at all.
 *
 * That is why `requestCutLoss` is the ONE outlet permission with no
 * `OUTLET_FEATURE_MODULE` entry, and why it needs its own test: it is the only
 * one whose answer comes from the sub-role matrix even on a real session that
 * carries backend module grants. Everything else on the venue's sidebar rides
 * on those grants, so when the lane went wrong this was the only thing that
 * disappeared — silently, with no error and no 403 to find.
 */

/** A real session's grants — what an Owner's `modulePermissions` looks like. */
const OUTLET_GRANTS = [
	{ moduleKey: "booking", permissionType: "create" },
	{ moduleKey: "booking", permissionType: "read" },
	{ moduleKey: "dashboard", permissionType: "read" },
	{ moduleKey: "workspace", permissionType: "update" },
];

describe("outletCan — requestCutLoss", () => {
	it("admits Owner and Ops Head", () => {
		expect(outletCan("outlet_owner", "requestCutLoss")).toBe(true);
		expect(outletCan("outlet_ops", "requestCutLoss")).toBe(true);
	});

	it("still admits them when the session also carries module grants", () => {
		// The path that matters in production: grants are present, no mapping
		// exists for this permission, so the matrix must decide instead of
		// canModule() being asked about a module key that was never assigned.
		expect(outletCan("outlet_owner", "requestCutLoss", OUTLET_GRANTS)).toBe(
			true,
		);
		expect(outletCan("outlet_ops", "requestCutLoss", OUTLET_GRANTS)).toBe(true);
	});

	it("admits Finance and Guarantor, exactly as the server does", () => {
		expect(outletCan("outlet_finance", "requestCutLoss")).toBe(true);
		expect(outletCan("outlet_guarantor", "requestCutLoss")).toBe(true);
	});

	it("refuses a Director, with or without grants", () => {
		expect(outletCan("outlet_director", "requestCutLoss")).toBe(false);
		expect(outletCan("outlet_director", "requestCutLoss", OUTLET_GRANTS)).toBe(
			false,
		);
	});

	it("refuses an UNRESOLVED lane — least privilege, by design", () => {
		// This is the state a stale or foreign identity cache used to leave an
		// Owner in. It is correct for an unknown lane to be refused; the fix is
		// that a real Owner never lands here (see outlet-identity.test.ts).
		expect(outletCan(null, "requestCutLoss", OUTLET_GRANTS)).toBe(false);
	});

	it("but a MODULE-MAPPED permission does ride on grants — why it hid", () => {
		// Same unresolved lane, same grants: Post Job still works. The sidebar
		// therefore looked like a full owner's while cut-loss was gone.
		expect(outletCan("outlet_director", "postJob")).toBe(false);
		expect(outletCan("outlet_director", "postJob", OUTLET_GRANTS)).toBe(true);
	});
});
