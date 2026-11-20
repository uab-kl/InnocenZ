import { describe, expect, it } from "vitest";
import { sidebarSections } from "@/constants/links";
import { adminNavLabel } from "@/lib/portal-i18n/admin-nav-label";
import { translations } from "@/lib/portal-i18n/translations";
import { adminNavFilingPath, resolveAdminTrail } from "./admin-trail";

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
	 * The member page's path is nested under Agency / Outlet Organisations, but
	 * nothing on those lists opens it — it is opened from the Members lists and
	 * from Legacy Member. Before 20 Nov 2026 it crumbed (and lit the rail) as
	 * "Agency Organisations", so the admin who pressed View lost their place.
	 */
	it("files a member page under the list that opened it", () => {
		const operation = adminNavLabel("operation", "Operation", t);
		const label = (key: string) =>
			sidebarSections
				.flatMap((s) => s.items)
				.filter((item) => item.key === key)
				.map((item) => adminNavLabel(item.key, item.title, t))[0];
		expect(
			resolveAdminTrail("/user-management/agency/a1/member/u1", t),
		).toEqual([operation, label("sidebar-team-agency")]);
		expect(
			resolveAdminTrail("/user-management/outlet/o1/member/u1", t),
		).toEqual([operation, label("sidebar-team-outlet")]);
		expect(
			resolveAdminTrail(
				"/user-management/agency/a1/member/u1",
				t,
				"legacy-member",
			),
		).toEqual([operation, label("sidebar-user-legacy-member")]);
	});

	it("maps the member path for the rail too, and leaves every other path alone", () => {
		expect(
			adminNavFilingPath("/admin/user-management/outlet/o1/member/u1"),
		).toBe("/admin/user-management/outlet-team");
		expect(
			adminNavFilingPath(
				"/admin/user-management/agency/a1/member/u1",
				"legacy-member",
			),
		).toBe("/admin/user-management/legacy-member");
		// An unknown `from` is the default list, never a guess.
		expect(
			adminNavFilingPath("/admin/user-management/agency/a1/member/u1", "x"),
		).toBe("/admin/user-management/agency-team");
		for (const path of [
			"/admin/user-management/agency",
			"/admin/user-management/agency-team",
			"/admin/user-management/legacy-member",
			"/admin/dashboard",
		]) {
			expect(adminNavFilingPath(path, "legacy-member")).toBe(path);
		}
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
