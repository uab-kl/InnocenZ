import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import {
	Bell,
	ChevronDown,
	LogOut,
	Settings,
	User as UserIcon,
} from "lucide-react";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
import { PortalLanguageSwitcher } from "@/components/portal-language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
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

function NotificationBell() {
	const { t } = usePortalLocale();
	const { logout } = useAuthActions();
	const { data } = useQuery({
		queryKey: ["admin-requests", "pending-count"],
		queryFn: () => fetchPendingCount(logout),
		staleTime: 30_000,
		refetchInterval: 60_000,
	});
	const count = data?.pending ?? 0;

	return (
		<Link
			to="/admin/service/requests"
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

	const handleLogout = () => {
		logout();
	};

	const roleLabel = user?.roles?.[0] ?? "Admin";
	const avatarSrc = apiAssetUrl(user?.profileImage);

	return (
		<header className="flex h-16 items-center justify-between border-b bg-background px-6">
			<nav
				aria-label={t.admin.breadcrumb}
				className="flex items-center gap-2 text-sm font-semibold"
			>
				{breadcrumbSegments.map((segment, index) => (
					<span key={`${segment}-${index}`} className="flex items-center gap-2">
						{index > 0 && (
							<span className="text-muted-foreground" aria-hidden="true">
								›
							</span>
						)}
						<span
							className={
								index === breadcrumbSegments.length - 1
									? "text-primary"
									: "text-foreground/80"
							}
						>
							{segment}
						</span>
					</span>
				))}
			</nav>

			<div className="flex items-center gap-1">
				{/*
				  Left of the theme toggle, inside the existing control cluster.
				  It adds no overlay and no portal, so the breadcrumb on the left
				  and the avatar dropdown on the right are both untouched.
				*/}
				<PortalLanguageSwitcher variant="header" className="mr-1" />

				<ThemeToggle />

				<NotificationBell />

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							className="h-auto gap-3 px-2 py-1.5 hover:bg-muted/50"
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

							<div className="hidden text-left sm:block">
								<p className="text-sm font-semibold leading-none text-foreground">
									{user?.displayName ?? "User"}
								</p>
								<p className="mt-1 text-xs leading-none text-muted-foreground">
									{roleLabel}
								</p>
							</div>

							<ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
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
