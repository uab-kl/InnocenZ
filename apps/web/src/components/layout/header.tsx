import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { Bell, LogOut, Settings, User as UserIcon } from "lucide-react";
import { AdminIconGuide } from "@/components/admin/admin-design-chrome";
import { adminConsoleRoleLabel } from "@/components/admin/admin-role-label";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
import { PortalLanguageSwitcher } from "@/components/portal-language-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getBusinessSectionByKey } from "@/constants/business-sections";
import { sidebarSections } from "@/constants/links";
import { getRbacSectionByKey } from "@/constants/rbac-sections";
import { getUserTypeByKey } from "@/constants/user-types";
import { useAuthActions } from "@/lib/auth/use-auth-actions";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { adminNavLabel } from "@/lib/portal-i18n/admin-nav-label";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import { fetchPendingCount } from "@/services/admin-request";

/** Pure, so the hook below can post-process every branch in one place. */
function resolveBreadcrumbSegments(
	pathname: string,
	t: PortalTranslations,
): string[] {
	if (pathname.startsWith("/user-management/")) {
		const userTypeKey = pathname.split("/").pop();
		const userType = userTypeKey ? getUserTypeByKey(userTypeKey) : undefined;
		if (userType)
			return [
				t.admin.navUser,
				adminNavLabel(`sidebar-user-${userType.key}`, userType.title, t),
			];
	}

	if (pathname.startsWith("/rbac/")) {
		const rbacKey = pathname.split("/").pop();
		if (rbacKey === "pending") return [t.admin.navRbac, t.rbac.pendingTitle];
		const rbacSection = rbacKey ? getRbacSectionByKey(rbacKey) : undefined;
		if (rbacSection)
			return [
				t.admin.navRbac,
				adminNavLabel(`sidebar-rbac-${rbacSection.key}`, rbacSection.title, t),
			];
	}

	if (pathname.startsWith("/business/")) {
		const businessKey = pathname.split("/").pop();
		const businessSection = businessKey
			? getBusinessSectionByKey(businessKey)
			: undefined;
		if (businessSection)
			return [
				t.admin.navBusiness,
				adminNavLabel(
					`sidebar-business-${businessSection.key}`,
					businessSection.title,
					t,
				),
			];
	}

	if (pathname === "/profile") return [t.admin.navProfile];
	if (pathname === "/settings") return [t.admin.navSettings];

	/*
	 * Fall back to the SIDEBAR config rather than `allNavigationItems`, which
	 * lists only Dashboard / User / RBAC / Audit Log — every Service and
	 * Subscription page missed it and rendered "Dashboard" as its breadcrumb.
	 * `sidebarSections` is the one config carrying every admin page, and it
	 * carries the section each page sits under, so a hit yields both segments.
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

	return [t.admin.navDashboard];
}

function useBreadcrumbSegments() {
	const { t } = usePortalLocale();
	const location = useLocation();
	/*
	 * BOTH prefixes come off. `location.pathname` is `/en/admin/settings`, but
	 * every comparison in `resolveBreadcrumbSegments` is written against a
	 * portal-relative path (`/settings`, `/user-management/…`). Stripping only
	 * `/en` left them all dead, so Settings and Profile fell through to the
	 * final fallback and rendered "Dashboard".
	 */
	const pathname = location.pathname
		.replace(/^\/en/, "")
		.replace(/^\/admin/, "")
		.replace(/\/$/, "");

	// The RBAC tab is titled "RBAC" inside a group also called "RBAC", so the
	// honest two-segment answer reads as a glitch: "RBAC › RBAC".
	return resolveBreadcrumbSegments(pathname, t).filter(
		(segment, i, all) => i === 0 || segment !== all[i - 1],
	);
}

/** Where the bell opens, and the count that page will show. */
export function bellTarget(
	pendingRequests: number,
	pendingPlanChanges: number,
): {
	to: "/admin/service/requests" | "/admin/service/plan-changes";
	count: number;
} {
	if (pendingRequests <= 0 && pendingPlanChanges > 0) {
		return { to: "/admin/service/plan-changes", count: pendingPlanChanges };
	}
	return { to: "/admin/service/requests", count: Math.max(0, pendingRequests) };
}

function NotificationBell() {
	const { t } = usePortalLocale();
	const { logout } = useAuthActions();
	/*
	 * The bell counted EVERY pending request — plan changes included — and then
	 * opened Plan Request, which lists everything but plan changes, so a bell
	 * reading 3 could land on a page holding 1. Each page's own count now (the
	 * sidebar badges' query keys, one cache, refreshed by the pages'
	 * "admin-requests" invalidation), and the bell names the page it opens: Plan
	 * Request while anything waits there, else Plan Change.
	 */
	const requestsQuery = useQuery({
		queryKey: ["admin-requests", "pending-count", "without-plan-changes"],
		queryFn: () => fetchPendingCount(logout, { excludeType: "plan_change" }),
		staleTime: 30_000,
		refetchInterval: 60_000,
	});
	const planChangesQuery = useQuery({
		queryKey: ["admin-requests", "pending-count", "plan-change"],
		queryFn: () => fetchPendingCount(logout, { type: "plan_change" }),
		staleTime: 30_000,
		refetchInterval: 60_000,
	});
	const target = bellTarget(
		requestsQuery.data?.pending ?? 0,
		planChangesQuery.data?.pending ?? 0,
	);
	const count = target.count;

	return (
		<Link
			to={target.to}
			aria-label={fill(
				count === 1 ? t.admin.notificationsOne : t.admin.notificationsMany,
				{ n: count },
			)}
			className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
		>
			<Bell className="h-5 w-5" />
			{count > 0 && (
				<span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
					{count > 99 ? "99+" : count}
				</span>
			)}
		</Link>
	);
}

export function Header() {
	const { t } = usePortalLocale();
	const { logout } = useAuthActions();
	const { user } = useCurrentUser();
	const breadcrumbSegments = useBreadcrumbSegments();
	/* Keyed on the trail so far, not on the position: a label can repeat inside
	   one trail (User › User), so the segment alone is not unique, while the
	   prefix that leads to it is — and it is stable when the route changes. */
	const breadcrumbCrumbs = breadcrumbSegments.map((segment, index) => ({
		segment,
		key: breadcrumbSegments.slice(0, index + 1).join(" / "),
		isFirst: index === 0,
		isLast: index === breadcrumbSegments.length - 1,
	}));

	const handleLogout = () => {
		logout();
	};

	/*
	 * `user.roles[0]` is a server `roleName` (see `use-profile.ts`), so it went
	 * to screen untranslated — the same leak `portalRoleLabel` was written for
	 * on the member and invite dropdowns. The default goes THROUGH the resolver
	 * rather than beside it: treat "Admin" as the stand-in role NAME, not as a
	 * finished label, or the two branches would disagree in Chinese — a real
	 * role rendering "Admin" while the empty case rendered 管理员.
	 *
	 * ⚠️ The ADMIN role, not `roles[0]` — the list has no order, and an admin
	 * who also holds a Finance lane was titled "Finance" here (28 Sep audit).
	 */
	const roleLabel = adminConsoleRoleLabel(user?.roles, t);
	const avatarSrc = apiAssetUrl(user?.profileImage);

	return (
		<header className="iz-admin-header flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-3 md:px-6">
			<div className="flex min-w-0 items-center gap-1">
				{/*
				  Below 768px `ui/sidebar.tsx` swaps the rail for an off-canvas
				  Sheet, and NOTHING in the app rendered a control to open it —
				  `SidebarTrigger` had no call site anywhere in the tree. So on a
				  phone the admin had exactly one reachable page: whichever one was
				  already on screen. Dashboard, Business, RBAC, User management,
				  Audit log and Service were all unreachable, with nothing on
				  screen to suggest anything was missing. Desktop keeps the
				  always-open rail, so this is hidden from `md:` up rather than
				  rendered and ignored.
				*/}
				<SidebarTrigger className="-ml-1 size-9 shrink-0 md:hidden" />

				<nav
					aria-label={t.admin.breadcrumb}
					className="flex min-w-0 items-center gap-2 text-sm font-semibold"
				>
					{breadcrumbCrumbs.map((crumb) => (
						<span
							key={crumb.key}
							/*
							  The trail is the one thing in this bar that grows without
							  bound. At 375px a three-deep trail pushed the bell and the
							  avatar off the right edge, so on a phone everything but the
							  LEAF folds away — the leaf is the crumb that says where you
							  are, and the ancestors are now one tap away in the drawer.
							*/
							className={`flex min-w-0 items-center gap-2${
								crumb.isLast ? "" : " hidden sm:flex"
							}`}
						>
							{!crumb.isFirst && (
								// On a phone the ancestors fold away, so the leaf's own
								// separator would lead the trail with a lone "›".
								<span
									className={`text-muted-foreground${
										crumb.isLast ? " hidden sm:inline" : ""
									}`}
									aria-hidden="true"
								>
									›
								</span>
							)}
							<span
								className={`truncate ${
									crumb.isLast ? "text-primary" : "text-foreground/80"
								}`}
							>
								{crumb.segment}
							</span>
						</span>
					))}
				</nav>
			</div>

			<div className="iz-admin-header-controls flex shrink-0 items-center gap-2">
				<AdminIconGuide />
				{/*
				  Inside the existing control cluster. It adds no overlay and no
				  portal, so the breadcrumb on the left and the avatar dropdown on
				  the right are both untouched. (The light/dark toggle that sat
				  beside it is gone — the app is dark only, theme-provider.tsx.)
				*/}
				<PortalLanguageSwitcher variant="header" className="mr-1" />

				<NotificationBell />

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							aria-label={`${user?.displayName ?? t.webShell.userFallback} — ${t.admin.navProfile}`}
							className="iz-admin-avatar-button hover:bg-muted/50"
						>
							<div className="relative shrink-0">
								<Avatar className="h-9 w-9">
									{avatarSrc ? (
										<AvatarImage
											src={avatarSrc}
											alt={user?.displayName ?? ""}
										/>
									) : null}
									<AvatarFallback>
										{user?.displayName?.charAt(0) ?? (
											<UserIcon className="h-4 w-4" />
										)}
									</AvatarFallback>
								</Avatar>
								<span
									className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-gold"
									aria-hidden="true"
								/>
							</div>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-56" align="end" forceMount>
						<DropdownMenuLabel className="font-normal">
							<div className="flex flex-col space-y-1">
								<p className="text-sm font-medium leading-none">
									{user?.displayName}
								</p>
								<p className="text-xs leading-none text-muted-foreground">
									{user?.email}
								</p>
								<p className="mt-1 text-xs font-medium text-gold-light leading-none">
									{roleLabel}
								</p>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem asChild>
							<Link to="/admin/profile">
								<UserIcon className="h-4 w-4" />
								<span>{t.admin.navProfile}</span>
							</Link>
						</DropdownMenuItem>
						<DropdownMenuItem asChild>
							<Link to="/admin/settings">
								<Settings className="h-4 w-4" />
								<span>{t.admin.navSettings}</span>
							</Link>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={handleLogout}>
							<LogOut className="h-4 w-4" />
							<span>{t.admin.logOut}</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</header>
	);
}
