import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import { shellPageLabel } from "./PortalShell";

/**
 * THE BREADCRUMB NAMES THE PAGE, NOT THE PORTAL TWICE (22 Oct 2026:
 * /outlet/special-service and /outlet/profile read "Outlet portal / Outlet
 * portal", and /agency/special-service "Agency portal / Agency portal").
 */

const en = translations.en;
const zh = translations.zh;
const icon = (() => null) as never;
const sidebar = [
	{ to: "/outlet", label: en.nav.today, icon },
	{ to: "/outlet/history", label: en.nav.history, icon },
];

describe("shellPageLabel", () => {
	it("names a page that has no sidebar item of its own", () => {
		expect(shellPageLabel(sidebar, "/outlet/special-service", en)).toBe(
			en.nav.specialService,
		);
		expect(shellPageLabel(sidebar, "/outlet/profile", en)).toBe(en.nav.profile);
		expect(shellPageLabel([], "/agency/special-service", en)).toBe(
			en.nav.specialService,
		);
	});

	it("names it in the reader's language", () => {
		expect(shellPageLabel(sidebar, "/outlet/profile/", zh)).toBe(
			zh.nav.profile,
		);
	});

	it("still lets the sidebar's own label win", () => {
		expect(shellPageLabel(sidebar, "/outlet/history", en)).toBe(en.nav.history);
	});

	it("names a page whose item this lane cannot see", () => {
		expect(shellPageLabel(sidebar, "/outlet/workspace", en)).toBe(
			en.nav.workspace,
		);
	});

	it("gives nothing for an unknown path, so the header keeps its fallback", () => {
		expect(shellPageLabel(sidebar, "/outlet/nowhere", en)).toBeUndefined();
	});
});
