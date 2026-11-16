// @vitest-environment node
// A Node CLI under test: jsdom would hand it an http: import.meta.url.
import { beforeAll, describe, expect, it } from "vitest";

/**
 * `pnpm rbac:sync` / `rbac:check` must read the SAME rows the server answers
 * from (risks #25 and #26).
 *
 * `roleHasPermission` asks for an active permission, an active module and a
 * module on the ROLE'S OWN portal. The sync's query asked for none of those,
 * so the snapshot could list a grant the API refuses: a deactivated module kept
 * its button, and a grant on another portal's `settings` twin would have been
 * counted here and refused there. `rbac:check` proves snapshot == query; this
 * pins the query to the server's rule, which `rbac:check` cannot see.
 *
 * Loaded by URL so the type-checker does not need a declaration for a plain
 * `.mjs` CLI; the script only touches the database inside `main()`.
 */

type Row = { portal: string; role: string; role_status: string; grant: string };
type Script = {
	GRANTS_SQL: string;
	build: (
		rows: Row[],
		portal: string,
		lanes: Record<string, string>,
	) => Record<string, string[]>;
	OUTLET_LANES: Record<string, string>;
	AGENCY_LANES: Record<string, string>;
};

const SCRIPT_URL = new URL(
	"../../../../../tools/scripts/sync-rbac-matrix.mjs",
	import.meta.url,
).href;

let script: Script;
beforeAll(async () => {
	script = (await import(/* @vite-ignore */ SCRIPT_URL)) as Script;
});

/** Whitespace-collapsed, so the test pins conditions rather than layout. */
const sql = () => script.GRANTS_SQL.replace(/\s+/g, " ");

describe("sync-rbac-matrix — the grant query matches roleHasPermission", () => {
	it("joins only ACTIVE permissions", () => {
		expect(sql()).toContain("pe.status = 'active'");
	});

	it("joins only ACTIVE modules", () => {
		expect(sql()).toContain("m.status = 'active'");
	});

	it("joins only modules on the role's own portal", () => {
		expect(sql()).toContain("m.portal_id = r.portal_id");
	});

	it("reads the role's status instead of filtering it, so build() can name it", () => {
		expect(sql()).toContain("r.status as role_status");
		expect(sql()).not.toMatch(/r\.status = 'active'/);
	});

	it("is still scoped to the two lane portals", () => {
		expect(sql()).toContain("where p.code in ('outlet', 'agency')");
	});
});

describe("sync-rbac-matrix — build()", () => {
	const lanes = { agency_owner: "Owner", agency_finance: "Finance" };
	const row = (role: string, grant: string, role_status = "active"): Row => ({
		portal: "agency",
		role,
		role_status,
		grant,
	});

	it("groups, de-duplicates and sorts each lane's grants", () => {
		const out = script.build(
			[
				row("Owner", "settings:update"),
				row("Owner", "billing:read"),
				row("Owner", "billing:read"),
				row("Finance", "payment_voucher:read"),
				{ ...row("Owner", "booking:create"), portal: "outlet" },
			],
			"agency",
			lanes,
		);
		expect(out).toEqual({
			agency_owner: ["billing:read", "settings:update"],
			agency_finance: ["payment_voucher:read"],
		});
	});

	it("refuses to write a snapshot while a lane's role is switched off, naming it", () => {
		expect(() =>
			script.build(
				[
					row("Owner", "settings:update"),
					row("Finance", "payment_voucher:read", "inactive"),
				],
				"agency",
				lanes,
			),
		).toThrow(/'Finance' role on the agency portal has status 'inactive'/);
	});

	it("still refuses a lane with no row at all", () => {
		expect(() =>
			script.build([row("Owner", "settings:update")], "agency", lanes),
		).toThrow(/No 'Finance' role row/);
	});

	it("knows every lane the portals render", () => {
		expect(Object.values(script.OUTLET_LANES)).toEqual([
			"Owner",
			"Guarantor",
			"Director",
			"Finance",
			"Ops Head",
		]);
		expect(Object.values(script.AGENCY_LANES)).toEqual([
			"Owner",
			"Guarantor",
			"Director",
			"Finance",
		]);
	});
});
