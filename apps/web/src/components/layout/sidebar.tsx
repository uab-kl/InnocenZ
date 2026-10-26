import { Link, useLocation } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, LogOut, User, X } from "lucide-react";
import {
	sectionBadgeTotal,
	useAdminNavSections,
} from "@/components/admin/admin-design-chrome";
import { adminConsoleRoleLabel } from "@/components/admin/admin-role-label";
import { Button } from "@/components/ui/button";
import {
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	Sidebar as SidebarUi,
	useSidebar,
} from "@/components/ui/sidebar";
import {
	type SidebarNavItem,
	type SidebarSection,
	sidebarSections,
} from "@/constants/links";
import { useSidebarBadges } from "@/hooks/use-sidebar-badges";
import { useAuthActions } from "@/lib/auth/use-auth-actions";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { LANDING_IMAGES } from "@/lib/landing-assets";
import { adminNavLabel } from "@/lib/portal-i18n/admin-nav-label";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { cn } from "@/lib/utils";

function isAdminUser(
	user: {
		roles?: string[];
		portals?: string[];
	} | null,
): boolean {
	if (!user) return false;
	if (user.portals?.includes("admin")) return true;
	return (user.roles ?? []).some((r) => r.toLowerCase() === "admin");
}

export function Sidebar() {
	const { t } = usePortalLocale();
	const location = useLocation();
	const { user } = useCurrentUser();
	const { state, isMobile, setOpenMobile } = useSidebar();
	const collapsed = !isMobile && state === "collapsed";
	const { logout } = useAuthActions();
	const badges = useSidebarBadges();
	const admin = isAdminUser(user);

	const isActive = (href: string) => {
		const cleanPathname = location.pathname.replace(/^\/en/, "");
		const cleanHref = href.replace(/^\/en/, "");
		const pathnameWithoutQuery = cleanPathname.split("?")[0];
		const hrefWithoutQuery = cleanHref.split("?")[0];

		// The sidebar's one RBAC entry links to Role, but Module and Pending are
		// pages of the same console: without this they lit no item and left the
		// OPERATION group folded shut on arrival.
		const RBAC = "/admin/rbac";
		if (
			hrefWithoutQuery.startsWith(`${RBAC}/`) &&
			pathnameWithoutQuery.startsWith(`${RBAC}/`)
		) {
			return true;
		}

		return (
			pathnameWithoutQuery === hrefWithoutQuery ||
			pathnameWithoutQuery.startsWith(`${hrefWithoutQuery}/`)
		);
	};

	// The group holding the current page opens itself, so the page's own entry
	// (and its badge) is never folded away on arrival.
	const activeSectionKey = sidebarSections.find((section) =>
		section.items.some((item) => isActive(item.href)),
	)?.key;
	const { sections, toggleSection } = useAdminNavSections(activeSectionKey);

	const hasPermission = (permission: string) => {
		if (permission === "*") return true;

		const grants = [
			...(user?.readPermission ?? []),
			...(user?.createPermission ?? []),
			...(user?.updatePermission ?? []),
		];

		return grants.includes("*") || grants.includes(permission);
	};

	const canAccess = (item: SidebarNavItem) => {
		// Platform admins always see the full admin shell.
		if (admin) return true;
		if (!user?.readPermission?.length) {
			return item.allowedPermission.includes("*");
		}
		return item.allowedPermission.some(hasPermission);
	};

	return (
		<SidebarUi
			className="admin-sidebar relative border-r border-sidebar-border"
			collapsible="icon"
		>
			<SidebarHeader className="iz-admin-sidebar-header py-4">
				<div
					className={cn(
						"flex items-center px-2",
						collapsed ? "justify-center" : "gap-2.5",
					)}
				>
					<img
						src={LANDING_IMAGES.innocenzLogo}
						alt="InnocenZ"
						width={40}
						height={40}
						decoding="async"
						className="h-10 w-10 shrink-0 rounded-full object-contain ring-2 ring-royal-gold/45"
					/>
					{!collapsed && (
						<span className="brand-wordmark text-gradient-royal text-[1.375rem] leading-none tracking-tight">
							InnocenZ
						</span>
					)}
					{isMobile && (
						<Button
							variant="ghost"
							size="icon"
							className="ml-auto"
							aria-label={t.common.close}
							onClick={() => setOpenMobile(false)}
						>
							<X aria-hidden />
						</Button>
					)}
				</div>
				{!collapsed && (
					<Link
						to="/admin/profile"
						className="iz-admin-sidebar-profile"
						onClick={() => setOpenMobile(false)}
					>
						<User aria-hidden className="size-5 shrink-0" />
						<div className="min-w-0">
							<p
								className="iz-admin-profile-name"
								title={user?.displayName ?? t.webShell.userFallback}
							>
								{user?.displayName ?? t.webShell.userFallback}
							</p>
							<p className="text-muted-foreground">
								{adminConsoleRoleLabel(user?.roles, t)}
							</p>
						</div>
					</Link>
				)}
			</SidebarHeader>

			<SidebarContent className="px-2 py-3">
				<nav aria-label={t.admin.adminNavigation} className="space-y-5 pb-6">
					{sidebarSections.map((section) => (
						<SidebarSectionGroup
							key={section.key}
							section={section}
							collapsed={collapsed}
							isActive={isActive}
							canAccess={canAccess}
							badges={badges}
							open={sections[section.key] === true}
							onToggle={() => toggleSection(section.key)}
							onNavigate={() => setOpenMobile(false)}
						/>
					))}
				</nav>
			</SidebarContent>
			<SidebarFooter className="iz-admin-sidebar-footer">
				<Button
					variant="outline"
					className="iz-admin-signout"
					onClick={logout}
					title={t.admin.logOut}
				>
					<LogOut aria-hidden className="size-4" />
					{!collapsed && t.admin.logOut}
				</Button>
			</SidebarFooter>

			<SidebarCollapseToggle />
		</SidebarUi>
	);
}

function SidebarSectionGroup({
	section,
	collapsed,
	isActive,
	canAccess,
	badges,
	open,
	onToggle,
	onNavigate,
}: {
	section: SidebarSection;
	collapsed: boolean;
	isActive: (href: string) => boolean;
	canAccess: (item: SidebarNavItem) => boolean;
	badges: Record<string, number>;
	open: boolean;
	onToggle: () => void;
	onNavigate: () => void;
}) {
	const { t } = usePortalLocale();
	const visibleItems = section.items.filter(canAccess);

	if (visibleItems.length === 0) return null;

	// A closed group still says something inside it is waiting.
	const closedTotal = open
		? 0
		: sectionBadgeTotal(
				visibleItems.map((item) => badges[item.key] ?? item.badge),
			);

	return (
		<div className="admin-sidebar-section">
			{!collapsed && (
				<button
					type="button"
					className="admin-sidebar-section-header"
					onClick={onToggle}
					aria-expanded={open}
					aria-controls={`admin-nav-${section.key}`}
				>
					<span>{adminNavLabel(section.key, section.label, t)}</span>
					<span className="ml-auto inline-flex items-center gap-2">
						{closedTotal > 0 && (
							<span className="admin-sidebar-badge">{closedTotal}</span>
						)}
						<ChevronDown
							aria-hidden
							className={cn(
								"size-4 transition-transform",
								!open && "-rotate-90",
							)}
						/>
					</span>
				</button>
			)}

			<ul
				id={`admin-nav-${section.key}`}
				hidden={!collapsed && !open}
				className={cn("space-y-1", collapsed && "space-y-1.5")}
			>
				{visibleItems.map((item) => {
					const badge = badges[item.key] ?? item.badge;
					return (
						<li key={item.key}>
							<Link
								to={item.href}
								onClick={onNavigate}
								aria-current={isActive(item.href) ? "page" : undefined}
								title={
									collapsed ? adminNavLabel(item.key, item.title, t) : undefined
								}
								className={cn(
									"admin-sidebar-nav-item",
									isActive(item.href) && "admin-sidebar-nav-item-active",
									collapsed && "justify-center px-2",
								)}
							>
								<item.icon className="h-[22px] w-[22px] shrink-0" />
								{!collapsed && (
									<>
										<span className="min-w-0 flex-1 whitespace-normal leading-snug">
											{adminNavLabel(item.key, item.title, t)}
										</span>
										{badge != null && badge > 0 && (
											<span className="admin-sidebar-badge">{badge}</span>
										)}
									</>
								)}
							</Link>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

function SidebarCollapseToggle() {
	const { t } = usePortalLocale();
	const { state, toggleSidebar } = useSidebar();
	const collapsed = state === "collapsed";

	return (
		<button
			type="button"
			onClick={toggleSidebar}
			className="admin-sidebar-collapse-toggle"
			aria-label={collapsed ? t.admin.expandSidebar : t.admin.collapseSidebar}
		>
			<ChevronLeft
				className={cn(
					"h-3.5 w-3.5 transition-transform duration-200",
					collapsed && "rotate-180",
				)}
			/>
		</button>
	);
}
