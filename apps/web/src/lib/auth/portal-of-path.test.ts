import { describe, expect, it } from "vitest";
import { nextForPortal, portalOfPath } from "@/lib/auth/portal-of-path";

describe("portalOfPath", () => {
	it("names the portal a path opens in", () => {
		expect(portalOfPath("/admin/user-management/legacy-member")).toBe("admin");
		expect(portalOfPath("/agency/pv")).toBe("agency");
		expect(portalOfPath("/outlet/workspace")).toBe("outlet");
	});

	it("tolerates a locale prefix", () => {
		expect(portalOfPath("/en/agency/pv")).toBe("agency");
		expect(portalOfPath("/zh/outlet/workspace")).toBe("outlet");
	});

	it("belongs to no portal: the signed-out and chooser pages", () => {
		expect(portalOfPath("/login")).toBeNull();
		expect(portalOfPath("/choose-organisation")).toBeNull();
		expect(portalOfPath("/no-access")).toBeNull();
	});

	it("matches whole segments, never a word prefix", () => {
		// `startsWith("/agency")` would call this an agency page.
		expect(portalOfPath("/agency-signup")).toBeNull();
		expect(portalOfPath("/outlet-register")).toBeNull();
	});

	it("refuses anything that is not a same-origin app path", () => {
		expect(portalOfPath(null)).toBeNull();
		expect(portalOfPath(undefined)).toBeNull();
		expect(portalOfPath("")).toBeNull();
		expect(portalOfPath("//evil.example.com/admin")).toBeNull();
		expect(portalOfPath("https://evil.example.com/admin")).toBeNull();
	});
});

describe("nextForPortal", () => {
	/**
	 * THE REGRESSION. Owner, 14 Sep 2026, holding admin + Atlas Agency + two
	 * outlets: opening `/admin/user-management/legacy-member` while signed out
	 * carried that link through login into the chooser, and picking the AGENCY
	 * then navigated an agency session to the admin URL. The admin guard
	 * refused, the bounce returned them to the chooser with the same link, and
	 * that agency could not be entered at all.
	 *
	 * This is the assertion that fails without the fix.
	 */
	it("drops an admin deep link when an agency is the organisation being opened", () => {
		expect(
			nextForPortal("/admin/user-management/legacy-member", "agency"),
		).toBeNull();
		expect(
			nextForPortal("/admin/user-management/legacy-member", "outlet"),
		).toBeNull();
	});

	it("keeps the deep link for the portal it belongs to", () => {
		expect(nextForPortal("/admin/user-management/legacy-member", "admin")).toBe(
			"/admin/user-management/legacy-member",
		);
		expect(nextForPortal("/agency/pv", "agency")).toBe("/agency/pv");
		expect(nextForPortal("/outlet/workspace", "outlet")).toBe(
			"/outlet/workspace",
		);
	});

	it("drops an agency link when an outlet is being opened, and the reverse", () => {
		expect(nextForPortal("/agency/pv", "outlet")).toBeNull();
		expect(nextForPortal("/outlet/workspace", "agency")).toBeNull();
	});

	it("returns null for nothing, so the caller falls back to its landing page", () => {
		expect(nextForPortal(null, "agency")).toBeNull();
		expect(nextForPortal(undefined, "admin")).toBeNull();
		expect(nextForPortal("/login", "agency")).toBeNull();
	});
});
