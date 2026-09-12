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
 * THE OWNER'S STANDING RULES, CHECKED FOR EVERY LANE — not just the one that
 * happened to be on screen.
 *
 * Owner, 12 Sep 2026: "not only to finance, other members, other account and
 * role help me to check also."
 *
 * Each `it` is one rule stated in the owner's own words, asserted across all
 * five outlet lanes and all four agency lanes. A new role added to either
 * portal fails these until somebody decides where it sits, which is the point:
 * the expensive mistakes here have all been a lane nobody thought about.
 */
const OUTLET_LANES = [
	"outlet_owner",
	"outlet_guarantor",
	"outlet_finance",
	"outlet_ops",
	"outlet_director",
] as const;
const AGENCY_LANES = [
	"agency_owner",
	"agency_guarantor",
	"agency_finance",
	"agency_director",
] as const;

describe("the owner's standing rules — every lane, both portals", () => {
	it("'other member cannot make the change for the organisation except for the owner and the guarantor'", () => {
		for (const lane of OUTLET_LANES) {
			const mayChangeTheOrg =
				lane === "outlet_owner" || lane === "outlet_guarantor";
			expect(outletCan(lane, "editSettings"), lane).toBe(mayChangeTheOrg);
		}
		for (const lane of AGENCY_LANES) {
			const mayChangeTheOrg =
				lane === "agency_owner" || lane === "agency_guarantor";
			expect(agencyCan(lane, "editSettings"), lane).toBe(mayChangeTheOrg);
		}
	});

	it("'only the owner can make payment and see the payment method'", () => {
		// Both the Pay button and the PAYMENT METHOD section are gated on
		// `editSettings`, and the server agrees twice over: `orgOwnerPaysOnly` on
		// checkout, and `requirePermission('settings','update')` on the card's
		// own read and write.
		for (const lane of OUTLET_LANES) {
			const mayPay = lane === "outlet_owner" || lane === "outlet_guarantor";
			expect(outletCan(lane, "editSettings"), lane).toBe(mayPay);
		}
		for (const lane of AGENCY_LANES) {
			const mayPay = lane === "agency_owner" || lane === "agency_guarantor";
			expect(agencyCan(lane, "editSettings"), lane).toBe(mayPay);
		}
	});

	it("'other member only can see the history that paid or unpaid and the current list'", () => {
		// Seeing the subscription page at all is `viewSettings`, and EVERY lane
		// keeps it — the rule takes away the spending, never the reading.
		for (const lane of OUTLET_LANES) {
			expect(outletCan(lane, "viewSettings"), lane).toBe(true);
		}
		for (const lane of AGENCY_LANES) {
			expect(agencyCan(lane, "viewSettings"), lane).toBe(true);
		}
	});

	it("a Director writes NOTHING, on either portal", () => {
		// The role defined to change nothing. Asserted as a group so a new write
		// permission has to be considered for it rather than inherited.
		for (const write of [
			"postJob",
			"logSales",
			"sealShift",
			"confirmShift",
			"ratePrs",
			"manageWorkspace",
			"manageShiftStaffing",
			"editSettings",
			"confirmDaily",
			"orderSpecialService",
			"requestCutLoss",
		] as const) {
			expect(outletCan("outlet_director", write), write).toBe(false);
		}
		for (const write of [
			"approvePrSignups",
			"assignShifts",
			"managePr",
			"editSettings",
			"raisePv",
			"overrideSignedPv",
			"confirmReconciliation",
		] as const) {
			expect(agencyCan("agency_director", write), write).toBe(false);
		}
	});

	it("a Guarantor is the owner's equal on both portals — the stand-in rule", () => {
		// Not "close to" the owner: identical. The role exists for the moment the
		// owner is unavailable, so any gap is a gap at exactly the wrong time.
		for (const p of [
			"postJob",
			"logSales",
			"editSettings",
			"confirmDaily",
			"viewBilling",
			"requestCutLoss",
			"orderSpecialService",
		] as const) {
			expect(outletCan("outlet_guarantor", p), p).toBe(
				outletCan("outlet_owner", p),
			);
		}
		for (const p of [
			"approvePrSignups",
			"assignShifts",
			"managePr",
			"editSettings",
			"raisePv",
			"overrideSignedPv",
			"viewLiveFloor",
		] as const) {
			expect(agencyCan("agency_guarantor", p), p).toBe(
				agencyCan("agency_owner", p),
			);
		}
	});

	it("every lane can reach its own console — nobody is locked out", () => {
		// A derived matrix can empty a role by accident; an operator with no
		// readable screen is indistinguishable from a broken login.
		for (const lane of OUTLET_LANES) {
			expect(outletCan(lane, "viewLiveDashboard"), lane).toBe(true);
		}
		for (const lane of AGENCY_LANES) {
			expect(agencyCan(lane, "viewHome"), lane).toBe(true);
		}
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
		expect(agencyCan("agency_finance", "managePr")).toBe(false);
	});

	/*
	 * ROSTERING IS NO LONGER THE OWNER'S ALONE — owner, 12 Sep 2026: "other
	 * agency orgs member can assign member, access calander page, the rest of
	 * the page can view."
	 *
	 * This assertion used to sit in the block above and say `false`. It is
	 * inverted rather than deleted because the grant is the POINT of that change:
	 * `AGENCY_FINANCE` gained `['roster', RU]` and the three `/shift-assignment`
	 * write routes moved off the `agencyOwnerOnly` LANE guard onto
	 * `requirePermission('roster','update')`, so this cell is what decides.
	 *
	 * Director stays refused — view-only on both portals is deliberate.
	 */
	it("lets agency Finance assign shifts, but not the Director", () => {
		expect(agencyCan("agency_finance", "assignShifts")).toBe(true);
		expect(agencyCan("agency_director", "assignShifts")).toBe(false);
	});
});
