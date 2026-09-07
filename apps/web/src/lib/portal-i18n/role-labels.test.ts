import { describe, expect, it } from "vitest";
import { translations } from "./translations";

/**
 * ONE ROLE, ONE NAME, IN EVERY LANGUAGE.
 *
 * Five roles are labelled from two different sources: `roles.*` is keyed by the
 * client's sub-role (header greeting, Nav, PV sub-head) and `profile.role*` by
 * the server's stored `role_name` through `portalRoleLabel` (member list, role
 * dropdowns, invite preview, admin header).
 *
 * They disagreed harmlessly while one was prefixed — "Agency Finance" beside
 * "Finance" read as two registers. Once both went short (7 Sep 2026) the
 * leftovers read as bugs instead: "Financial Head" in the header against
 * "Finance" in the dropdown for the same person, and 总监 against 董事, which
 * are different jobs in Chinese. Aligned on the owner's call — and pinned here,
 * because the next person to reword one list will not know the other exists.
 */
const PAIRS = [
	{
		role: "owner",
		profile: "roleOwner",
		roles: ["agencyOwner", "outletOwner"],
	},
	{
		role: "finance",
		profile: "roleFinance",
		roles: ["agencyFinance", "outletFinance"],
	},
	// No agency ops lane — outlet only.
	{ role: "ops", profile: "roleOps", roles: ["outletOps"] },
	{
		role: "director",
		profile: "roleDirector",
		roles: ["agencyDirector", "outletDirector"],
	},
	{
		role: "guarantor",
		profile: "roleGuarantor",
		roles: ["agencyGuarantor", "outletGuarantor"],
	},
] as const;

describe.each(["en", "zh"] as const)("%s role labels", (locale) => {
	const t = translations[locale];

	it.each(PAIRS)("names $role the same in both lists", (pair) => {
		const expected = t.profile[pair.profile];
		expect(expected.trim()).not.toBe("");
		for (const key of pair.roles) {
			expect(t.roles[key]).toBe(expected);
		}
	});

	it("never puts the organisation back into the role", () => {
		// The org name already sits beside it — `Atlas Agency (Owner)`.
		for (const value of Object.values(t.roles)) {
			expect(value).not.toMatch(/agency|outlet|经纪公司|门店/i);
		}
	});
});
