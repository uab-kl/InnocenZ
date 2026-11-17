import { describe, expect, it } from "vitest";
import { sidebarSections } from "@/constants/links";
import { adminNavLabel } from "@/lib/portal-i18n/admin-nav-label";
import { translations } from "@/lib/portal-i18n/translations";
import { resolveAdminTrail } from "./admin-trail";

const t = translations.en;
const rel = (href: string) => href.replace(/^\/en/, "").replace(/^\/admin/, "");

describe("resolveAdminTrail", () => {
	/*
	 * THE RULE: "where am I" must name the SAME group the sidebar files the
	 * page under. Generated over the whole sidebar config, so a page added
	 * tomorrow is covered without anyone remembering to add a case.
	 *
	 * This failed before 16 Nov 2026 for every user-management page ("User"
	 * where the rail said OPERATION) and every subscription page ("Business"
	 * where the rail said SUBSCRIPTION).
	 */
	for (const section of sidebarSections) {
		for (const item of section.items) {
			it(`${item.href} names its sidebar group`, () => {
				const trail = resolveAdminTrail(rel(item.href), t);
				const title = adminNavLabel(item.key, item.title, t);
				if (section.key === "overview") {
					expect(trail).toEqual([title]);
				} else {
					expect(trail).toEqual([
						adminNavLabel(section.key, section.label, t),
						title,
					]);
				}
			});
		}
	}

	it("keeps a child page under its parent's group", () => {
		const trail = resolveAdminTrail(
			"/user-management/agency/abc-123/member/def-456",
			t,
		);
		expect(trail[0]).toBe(adminNavLabel("operation", "Operation", t));
	});

	/*
	 * Module and Pending are not on the rail, so their trail runs through the
	 * group and the console that ARE — never a section the reader cannot find.
	 */
	it("files the inner RBAC pages under Operation › RBAC", () => {
		const operation = adminNavLabel("operation", "Operation", t);
		expect(resolveAdminTrail("/rbac/module", t).slice(0, 2)).toEqual([
			operation,
			t.admin.navRbac,
		]);
		expect(resolveAdminTrail("/rbac/pending", t)).toEqual([
			operation,
			t.admin.navRbac,
			t.rbac.pendingTitle,
		]);
	});

	it("names Profile, and falls back to Dashboard for an unknown page", () => {
		expect(resolveAdminTrail("/profile", t)).toEqual([t.admin.navProfile]);
		expect(resolveAdminTrail("/no-such-page", t)).toEqual([
			t.admin.navDashboard,
		]);
	});
});
