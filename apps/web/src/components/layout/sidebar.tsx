import { Link, useLocation } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
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

export function Sidebar() {
	const location = useLocation();
	const { user } = useCurrentUser();
	const { state } = useSidebar();
	const collapsed = state === "collapsed";
	const badges = useSidebarBadges();

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

			<SidebarContent className="relative">
				<ScrollArea className="h-full px-2 py-3">
					<nav aria-label="Admin navigation" className="space-y-5">
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
				</ScrollArea>
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
	const sectionActive = visibleItems.some((item) => isActive(item.href));
	const [open, setOpen] = useState(true);

	useEffect(() => {
		if (sectionActive) setOpen(true);
	}, [sectionActive]);

	if (visibleItems.length === 0) return null;

	return (
		<div className="admin-sidebar-section">
			{!collapsed && (
				<button
					type="button"
					onClick={() => setOpen((value) => !value)}
					className="admin-sidebar-section-header"
					aria-expanded={open}
				>
					<span>{section.label}</span>
					<ChevronDown
						className={cn(
							"h-4 w-4 shrink-0 transition-transform duration-200",
							open && "rotate-180",
						)}
					/>
				</button>
			)}

			{open && (
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
			)}
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
