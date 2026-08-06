import { Link, useLocation } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import {
	SidebarContent,
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
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { LANDING_IMAGES } from "@/lib/landing-assets";
import { cn } from "@/lib/utils";

function isAdminUser(user: {
	roles?: string[];
	portals?: string[];
} | null): boolean {
	if (!user) return false;
	if (user.portals?.includes("admin")) return true;
	return (user.roles ?? []).some((r) => r.toLowerCase() === "admin");
}

export function Sidebar() {
	const location = useLocation();
	const { user } = useCurrentUser();
	const { state } = useSidebar();
	const collapsed = state === "collapsed";
	const badges = useSidebarBadges();
	const admin = isAdminUser(user);

	const isActive = (href: string) => {
		const cleanPathname = location.pathname.replace(/^\/en/, "");
		const cleanHref = href.replace(/^\/en/, "");
		const pathnameWithoutQuery = cleanPathname.split("?")[0];
		const hrefWithoutQuery = cleanHref.split("?")[0];

		return (
			pathnameWithoutQuery === hrefWithoutQuery ||
			pathnameWithoutQuery.startsWith(`${hrefWithoutQuery}/`)
		);
	};

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
			<SidebarHeader className="border-b border-sidebar-border/60 py-4">
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
				</div>
			</SidebarHeader>

			<SidebarContent className="px-2 py-3">
				<nav aria-label="Admin navigation" className="space-y-5 pb-6">
					{sidebarSections.map((section) => (
						<SidebarSectionGroup
							key={section.key}
							section={section}
							collapsed={collapsed}
							isActive={isActive}
							canAccess={canAccess}
							badges={badges}
						/>
					))}
				</nav>
			</SidebarContent>

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
}: {
	section: SidebarSection;
	collapsed: boolean;
	isActive: (href: string) => boolean;
	canAccess: (item: SidebarNavItem) => boolean;
	badges: Record<string, number>;
}) {
	const visibleItems = section.items.filter(canAccess);

	if (visibleItems.length === 0) return null;

	return (
		<div className="admin-sidebar-section">
			{!collapsed && (
				<div className="admin-sidebar-section-header pointer-events-none">
					<span>{section.label}</span>
				</div>
			)}

			<ul className={cn("space-y-1", collapsed && "space-y-1.5")}>
				{visibleItems.map((item) => {
					const badge = badges[item.key] ?? item.badge;
					return (
						<li key={item.key}>
							<Link
								to={item.href}
								title={collapsed ? item.title : undefined}
								className={cn(
									"admin-sidebar-nav-item",
									isActive(item.href) && "admin-sidebar-nav-item-active",
									collapsed && "justify-center px-2",
								)}
							>
								<item.icon className="h-[22px] w-[22px] shrink-0" />
								{!collapsed && (
									<>
										<span className="flex-1 truncate">{item.title}</span>
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
	const { state, toggleSidebar } = useSidebar();
	const collapsed = state === "collapsed";

	return (
		<button
			type="button"
			onClick={toggleSidebar}
			className="admin-sidebar-collapse-toggle"
			aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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
