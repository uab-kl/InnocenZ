import { useLocation } from "@tanstack/react-router";
import { sidebarSections } from "@/constants/links";
import { getRbacSectionByKey } from "@/constants/rbac-sections";
import { adminNavLabel } from "@/lib/portal-i18n/admin-nav-label";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/** `?from=` on a member page opened from Legacy Member (see `adminNavFilingPath`). */
export const MEMBER_PAGE_FROM_LEGACY = "legacy-member";

const MEMBER_PAGE =
	/^(.*\/user-management)\/(agency|outlet)\/[^/]+\/member\/[^/]+$/;

/**
 * The path a page is FILED under in the rail, for the rail's prefix match and
 * for the trail below — the one place both ask.
 *
 * ⚠️ The member page lives at `/user-management/agency/<org>/member/<user>`,
 * NESTED under the Agency Organisations href, so both prefix matches lit
 * "Agency Organisations" and crumbed it "Operation › Agency Organisations" —
 * yet nothing on that list opens it. Its only doorways are Agency / Outlet
 * Members and Legacy Member, so the reader who pressed View lost their place
 * (design review, 20 Nov 2026). It is now filed under the list it is opened
 * from: Legacy Member when the link says `?from=legacy-member`, otherwise its
 * own kind's Members list. Every other path comes back unchanged, with or
 * without the `/en/admin` prefix.
 */
export function adminNavFilingPath(pathname: string, from?: unknown): string {
	const match = MEMBER_PAGE.exec(pathname.replace(/\/$/, ""));
	if (!match) return pathname;
	const [, base, kind] = match;
	return from === MEMBER_PAGE_FROM_LEGACY
		? `${base}/legacy-member`
		: `${base}/${kind}-team`;
}

/**
 * WHERE THE READER IS, as one answer both the header and the page head use.
 *
 * It lived inside `header.tsx` as a private hook, so the only thing on screen
 * that knew which SECTION a page belonged to was a line of 14px text in the
 * top bar — and on a phone even that folded away to the leaf. Users said they
 * could not tell where they were; they were right, because the page body never
 * said. One resolver, two places that show it.
 *
 * Pure, so every branch can be tested without a router.
 */
export function resolveAdminTrail(
	path: string,
	t: PortalTranslations,
	from?: unknown,
): string[] {
	const pathname = adminNavFilingPath(path, from);
	if (pathname === "/profile") return [t.admin.navProfile];

	/*
	 * ⚠️ THE SIDEBAR FIRST. It is what the reader is looking at, so the trail
	 * has to name the same group the rail files the page under.
	 *
	 * It used to be the LAST resort, behind special branches that named groups
	 * of their own: every user-management page crumbed as "User › …" and every
	 * subscription page as "Business › …", while the rail showed those very
	 * pages under OPERATION and SUBSCRIPTION. Agency Members and Outlet Members
	 * were not caught by the branch, fell through to the sidebar and said
	 * "Operation" — so one sidebar group answered "where am I" two different
	 * ways depending on which row you had clicked.
	 */
	for (const section of sidebarSections) {
		for (const item of section.items) {
			const href = item.href.replace(/^\/en/, "").replace(/^\/admin/, "");
			if (pathname !== href && !pathname.startsWith(`${href}/`)) continue;
			const title = adminNavLabel(item.key, item.title, t);
			// Overview is the top level — no group segment to prefix it with.
			return section.key === "overview"
				? [title]
				: [adminNavLabel(section.key, section.label, t), title];
		}
	}

	/*
	 * Pages the rail does not list. RBAC has ONE sidebar entry (Role); Module
	 * and Pending are inner pages of the same console, so their trail runs
	 * through the group and the console the rail DOES show — Operation › RBAC
	 * — rather than naming a section the reader cannot find on the left.
	 */
	if (pathname.startsWith("/rbac/")) {
		const operationSection = sidebarSections.find((s) => s.key === "operation");
		const operation = operationSection
			? adminNavLabel(operationSection.key, operationSection.label, t)
			: t.admin.navRbac;
		const rbacKey = pathname.split("/").pop();
		if (rbacKey === "pending")
			return [operation, t.admin.navRbac, t.rbac.pendingTitle];
		const rbacSection = rbacKey ? getRbacSectionByKey(rbacKey) : undefined;
		if (rbacSection)
			return [
				operation,
				t.admin.navRbac,
				adminNavLabel(`sidebar-rbac-${rbacSection.key}`, rbacSection.title, t),
			];
	}

	return [t.admin.navDashboard];
}

/**
 * The trail for the page on screen, de-duplicated.
 *
 * ⚠️ BOTH prefixes come off. `location.pathname` is `/en/admin/settings`, but
 * every comparison in `resolveAdminTrail` is written against a portal-relative
 * path (`/settings`, `/user-management/…`). Stripping only `/en` left them all
 * dead, so Settings and Profile fell through to the final fallback and
 * rendered "Dashboard".
 */
/**
 * `/en/admin/user-management/pr` → `/user-management/pr`.
 *
 * ⚠️ BOTH prefixes come off. Every comparison in `resolveAdminTrail` is
 * written against a portal-relative path, so stripping only `/en` left them
 * all dead and Settings and Profile fell through to the fallback, rendering
 * "Dashboard".
 */
function portalRelative(pathname: string): string {
	return pathname
		.replace(/^\/en/, "")
		.replace(/^\/admin/, "")
		.replace(/\/$/, "");
}

/**
 * The RBAC tab is titled "RBAC" inside a group also called "RBAC", so the
 * honest two-segment answer reads as a glitch: "RBAC › RBAC".
 */
function withoutRepeats(segments: string[]): string[] {
	return segments.filter((s, i, all) => i === 0 || s !== all[i - 1]);
}

/**
 * The trail for the page on screen, for the PERSISTENT header.
 *
 * It subscribes to router state because the header is chrome: it survives
 * every navigation and would otherwise keep showing the trail of the page the
 * reader has just left.
 */
export function useAdminTrail(): string[] {
	const { t } = usePortalLocale();
	const location = useLocation();
	const from = (location.search as Record<string, unknown> | undefined)?.from;
	return withoutRepeats(
		resolveAdminTrail(portalRelative(location.pathname), t, from),
	);
}

/**
 * The SECTION the current page sits in, or null on a top-level page.
 *
 * The leaf is the page's own name, which the page head already prints as its
 * title — so what the page head is missing, and this returns, is everything
 * before it.
 *
 * ⚠️ It reads `window.location` rather than subscribing through `useLocation`,
 * and that is deliberate. Its one caller, `PageHeader`, renders INSIDE a route
 * component, which React unmounts and re-renders on every navigation — so a
 * subscription would buy nothing and cost the thing it did cost: `useLocation`
 * throws outside a `RouterProvider`, which crashed two `admin-overview` tests
 * that render a page without one, and would crash any future test or preview
 * that does the same. A page head must not be the reason a page cannot render.
 */
export function useAdminSection(): string | null {
	const { t } = usePortalLocale();
	const pathname =
		typeof window === "undefined" ? "" : window.location.pathname;
	const from =
		typeof window === "undefined"
			? null
			: new URLSearchParams(window.location.search).get("from");
	const trail = withoutRepeats(
		resolveAdminTrail(portalRelative(pathname), t, from),
	);
	return trail.length > 1 ? trail.slice(0, -1).join(" › ") : null;
}
