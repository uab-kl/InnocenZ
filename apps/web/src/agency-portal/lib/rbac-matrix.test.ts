import { describe, expect, it } from "vitest";
import {
	AGENCY_FEATURE_MODULE,
	buildRoleMatrix,
	OUTLET_FEATURE_MODULE,
} from "@/lib/auth/module-permissions";
import { agencyCan } from "./agency-rbac";
import { outletCan } from "./outlet-rbac";
import {
	AGENCY_ROLE_GRANTS,
	OUTLET_ROLE_GRANTS,
} from "./rbac-grants.generated";

/**
 * THE DATABASE IS THE RBAC AUTHORITY.
 *
 * Owner, 11 Sep 2026: "the rbac must ensure what can do what cannot do, ofcourse
 * must from the database … web matrix must follow what database given."
 *
 * The portals used to carry a hand-written second copy of `role_permission`,
 * and it had drifted 14 cells. These tests exist so it cannot drift again
 * unnoticed: nothing may be granted that the database does not back, with the
 * two lane-gated exceptions named explicitly below.
 *
 * ⚠️ This pins the matrix to the SNAPSHOT. The snapshot is pinned to the live
 * table by `pnpm rbac:check`, which is the half a unit test cannot do without
 * a database.
 */

/** The server gates these by LANE — there is no grant to derive them from. */
const OUTLET_MATRIX_ONLY = ["requestCutLoss"];
const AGENCY_MATRIX_ONLY = ["viewLiveFloor"];

describe("portal RBAC matrix — derived from the database, not hand-written", () => {
	it("grants an outlet lane nothing the database does not back", () => {
		for (const [lane, grants] of Object.entries(OUTLET_ROLE_GRANTS)) {
			const held = new Set<string>(grants);
			for (const [permission, module] of Object.entries(
				OUTLET_FEATURE_MODULE,
			)) {
				// Called with no module grants, so the matrix answers — which is
				// exactly the value under test.
				const matrixSays = outletCan(
					lane as Parameters<typeof outletCan>[0],
					permission as Parameters<typeof outletCan>[1],
				);
				expect(
					matrixSays,
					`outlet ${lane} / ${permission} (${module.key}:${module.type})`,
				).toBe(held.has(`${module.key}:${module.type}`));
			}
		}
	});

	it("grants an agency lane nothing the database does not back", () => {
		for (const [lane, grants] of Object.entries(AGENCY_ROLE_GRANTS)) {
			const held = new Set<string>(grants);
			for (const [permission, module] of Object.entries(
				AGENCY_FEATURE_MODULE,
			)) {
				const matrixSays = agencyCan(
					lane as Parameters<typeof agencyCan>[0],
					permission as Parameters<typeof agencyCan>[1],
				);
				expect(
					matrixSays,
					`agency ${lane} / ${permission} (${module.key}:${module.type})`,
				).toBe(held.has(`${module.key}:${module.type}`));
			}
		}
	});

	it("keeps the lane-gated exceptions, and ONLY those, off the module map", () => {
		// If one of these ever gains a module mapping, it stops being derived by
		// hand — and the hand-kept list beside it becomes the stale copy.
		expect(
			OUTLET_MATRIX_ONLY.filter((p) => !(p in OUTLET_FEATURE_MODULE)),
		).toEqual(OUTLET_MATRIX_ONLY);
		expect(
			AGENCY_MATRIX_ONLY.filter((p) => !(p in AGENCY_FEATURE_MODULE)),
		).toEqual(AGENCY_MATRIX_ONLY);
	});

	it("mirrors the server's lane list for cut-loss", () => {
		// `POST /cutlost` is requireOutletSubRole('owner','finance','operations_head'),
		// with guarantor folded into owner by holdsOutletLane. A Director is refused.
		expect(outletCan("outlet_owner", "requestCutLoss")).toBe(true);
		expect(outletCan("outlet_guarantor", "requestCutLoss")).toBe(true);
		expect(outletCan("outlet_finance", "requestCutLoss")).toBe(true);
		expect(outletCan("outlet_ops", "requestCutLoss")).toBe(true);
		expect(outletCan("outlet_director", "requestCutLoss")).toBe(false);
	});

	it("keeps the live floor off finance — the reason it is unmapped", () => {
		expect(agencyCan("agency_owner", "viewLiveFloor")).toBe(true);
		expect(agencyCan("agency_guarantor", "viewLiveFloor")).toBe(true);
		expect(agencyCan("agency_director", "viewLiveFloor")).toBe(true);
		expect(agencyCan("agency_finance", "viewLiveFloor")).toBe(false);
	});

	it("buildRoleMatrix adds a matrix-only permission to the named lanes only", () => {
		const built = buildRoleMatrix<"a" | "b", "mapped" | "laneOnly">(
			{ a: ["mod:read"], b: [] },
			{ mapped: { key: "mod", type: "read" } },
			{ laneOnly: ["b"] },
		);
		expect(built.a).toEqual(["mapped"]);
		expect(built.b).toEqual(["laneOnly"]);
	});
});

/**
 * The findings that made the owner ask for this, pinned as regressions.
 *
 * Each was a cell where the hand-written matrix contradicted the database, and
 * the database won on screen — so these describe what the portal ALREADY did,
 * not a behaviour change.
 */
describe("the drift that prompted the rule", () => {
	it("outlet Finance CAN post a job — the database grants booking:create", () => {
		// `POST /shift` is requirePermission('booking','create'), reading the same
		// role_permission row. The old matrix called Finance view-only while Post
		// Job sat in their sidebar.
		expect(outletCan("outlet_finance", "postJob")).toBe(true);
		expect(outletCan("outlet_finance", "viewBookings")).toBe(true);
		expect(outletCan("outlet_finance", "logSales")).toBe(true);
		expect(outletCan("outlet_finance", "ratePrs")).toBe(true);
	});

	it("outlet Ops Head CAN see sales and history", () => {
		expect(outletCan("outlet_ops", "viewSalesDashboard")).toBe(true);
		expect(outletCan("outlet_ops", "viewHistory")).toBe(true);
	});

	it("confirm daily is the OWNER's and the guarantor's, not finance's", () => {
		// `billing:update` was held by NOBODY, so this was refused for every lane
		// including the owner — on a screen that offered the button. Granted to
		// the owner (and the guarantor, which shares that list) in `seed-rbac.ts`
		// on the owner's instruction, 11 Sep 2026.
		//
		// ⚠️ Finance stays out, which is the half worth pinning: the standing
		// rule is "other member cannot make the change for the organisation
		// except for the owner and the guarantor". The OLD hand-written matrix
		// granted finance this, and the database never did.
		expect(outletCan("outlet_owner", "confirmDaily")).toBe(true);
		expect(outletCan("outlet_guarantor", "confirmDaily")).toBe(true);
		expect(outletCan("outlet_finance", "confirmDaily")).toBe(false);
		expect(outletCan("outlet_ops", "confirmDaily")).toBe(false);
		expect(outletCan("outlet_director", "confirmDaily")).toBe(false);
	});

	it("still refuses a Director everything that writes", () => {
		expect(outletCan("outlet_director", "postJob")).toBe(false);
		expect(outletCan("outlet_director", "editSettings")).toBe(false);
		expect(outletCan("outlet_director", "logSales")).toBe(false);
		expect(outletCan("outlet_director", "manageWorkspace")).toBe(false);
	});

	it("lets an agency FINANCIAL HEAD sign a payment voucher", () => {
		// Owner, 11 Sep 2026: "make sure financial head can sign the pv."
		// `/agency/pv` gates signing on `raisePv` (payment_voucher:create) and the
		// override on `overrideSignedPv` (payment_voucher:update); the database
		// grants finance both, which is the line between this role and Director.
		// Pinned because the matrix is DERIVED now — revoking the grant would
		// silently take signing away, and payroll would simply stop.
		expect(agencyCan("agency_finance", "raisePv")).toBe(true);
		expect(agencyCan("agency_finance", "viewPv")).toBe(true);
		expect(agencyCan("agency_finance", "overrideSignedPv")).toBe(true);
		// A Director oversees and does not sign — the distinction that matters.
		expect(agencyCan("agency_director", "raisePv")).toBe(false);
		expect(agencyCan("agency_director", "overrideSignedPv")).toBe(false);
	});

	it("still refuses agency Finance the owner's lanes", () => {
		expect(agencyCan("agency_finance", "editSettings")).toBe(false);
		expect(agencyCan("agency_finance", "approvePrSignups")).toBe(false);
		expect(agencyCan("agency_finance", "assignShifts")).toBe(false);
		expect(agencyCan("agency_finance", "managePr")).toBe(false);
	});
});
