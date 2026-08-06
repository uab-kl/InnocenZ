import { InnocenZLogoHorizontal } from "@agency-portal/components/Brand";
import { TitleWithIcon } from "@agency-portal/components/iz/TitleWithIcon";
import {
	BottomNav,
	type NavItem,
	navIsActive,
} from "@agency-portal/components/Nav";
import { OpsNotificationBell } from "@agency-portal/components/portal/OpsNotificationBell";
import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { nowAgencyDateTime } from "@agency-portal/lib/agency-demo";
import {
	AGENCY_SUB_ROLE_LABELS,
	agencyCan,
} from "@agency-portal/lib/agency-rbac";
import { signOutToWelcome } from "@agency-portal/lib/go-welcome";
import { iconForNav } from "@agency-portal/lib/lucide-label-icons";
import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import {
	OUTLET_SUB_ROLE_LABELS,
	outletCan,
} from "@agency-portal/lib/outlet-rbac";
import { publicAssetPath } from "@agency-portal/lib/public-asset";
import { useStore } from "@agency-portal/lib/store";
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { isOrgProfileOnly } from "@/components/organization/org-status";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
import { getPortalSessionKind } from "@/lib/auth/agency-demo-session";
import { useProfile } from "@/lib/auth/use-profile";

export type PortalKind = "agency" | "outlet";

type ExtraNavItem = NavItem & { permission: string };

const AGENCY_EXTRAS: ExtraNavItem[] = [
	{
		to: "/agency/prs",
		label: "Manage PR",
		icon: iconForNav("Manage PR"),
		permission: "managePr",
	},
	{
		to: "/agency/outlets",
		label: "Manage Outlet",
		icon: iconForNav("Manage Outlet"),
		permission: "managePr",
	},
	{
		to: "/agency/subscription",
		label: "Subscription",
		icon: iconForNav("Subscription"),
		permission: "viewSettings",
	},
	{
		to: "/agency/profile",
		label: "Settings",
		icon: iconForNav("Settings"),
		permission: "viewSettings",
	},
];

const OUTLET_EXTRAS: ExtraNavItem[] = [
	{
		to: "/outlet/workspace",
		label: "Workspace",
		icon: iconForNav("Workspace"),
		permission: "viewWorkspace",
	},
	{
		to: "/outlet/subscription",
		label: "Subscription",
		icon: iconForNav("Subscription"),
		permission: "viewSettings",
	},
	{
		to: "/outlet/settings",
		label: "Settings",
		icon: iconForNav("Settings"),
		permission: "viewSettings",
	},
];

function portalGreeting() {
	const h = new Date().getHours();
	if (h < 12) return "Good morning";
	if (h < 17) return "Good afternoon";
	return "Good evening";
}

function mergeNavItems(
	portal: PortalKind,
	base: NavItem[],
	agencySubRole: ReturnType<typeof useStore.getState>["agencySubRole"],
	outletSubRole: ReturnType<typeof useStore.getState>["outletSubRole"],
	orgProfileOnly: boolean,
): NavItem[] {
	const seen = new Set(base.map((i) => i.to));
	const extras = portal === "agency" ? AGENCY_EXTRAS : OUTLET_EXTRAS;
	const filtered = extras.filter((item) => {
		if (seen.has(item.to)) return false;
		// Pending / suspended: only Settings / Profile — no Workspace or Subscription.
		if (orgProfileOnly) {
			return (
				item.to === "/outlet/settings" || item.to === "/agency/profile"
			);
		}
		if (portal === "agency")
			return agencyCan(
				agencySubRole,
				item.permission as Parameters<typeof agencyCan>[1],
			);
		return outletCan(
			outletSubRole,
			item.permission as Parameters<typeof outletCan>[1],
		);
	});
	return [...base, ...filtered];
}

function portalAvatarGradient(portal: PortalKind) {
	return portal === "agency"
		? "var(--iz-grad)"
		: "linear-gradient(135deg,#39D98A,#1f8f5c)";
}

function portalProfilePath(portal: PortalKind) {
	return portal === "agency" ? "/agency/profile" : "/outlet/settings";
}

function PortalAvatar({
	portal,
	ownerName,
	orgName,
	avatarPhoto,
	className,
}: {
	portal: PortalKind;
	ownerName: string;
	orgName: string;
	avatarPhoto?: string | null;
	className?: string;
}) {
	const avatarLetter =
		ownerName.trim()[0]?.toUpperCase() ??
		orgName.trim()[0]?.toUpperCase() ??
		"?";

	return (
		<div
			className={`iz-avatar${className ? ` ${className}` : ""}${avatarPhoto ? " iz-avatar-photo" : ""}`}
			style={
				avatarPhoto ? undefined : { background: portalAvatarGradient(portal) }
			}
		>
			{avatarPhoto ? (
				<img src={publicAssetPath(avatarPhoto)} alt="" />
			) : (
				avatarLetter
			)}
		</div>
	);
}

function PortalSidebarLink({
	item,
	pathname,
	onNavigate,
}: {
	item: NavItem;
	pathname: string;
	onNavigate?: () => void;
}) {
	const active = navIsActive(pathname, item.to);
	return (
		<Link
			to={item.to}
			className={`iz-portal-nav-link${active ? " on" : ""}`}
			onClick={onNavigate}
		>
			<item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
			<span>{item.label}</span>
		</Link>
	);
}

function PortalSidebar({
	portal,
	items,
	onNavigate,
}: {
	portal: PortalKind;
	items: NavItem[];
	onNavigate?: () => void;
}) {
	const { pathname } = useLocation();

	return (
		<aside className="iz-portal-sidebar">
			<div className="iz-portal-sidebar-brand">
				<InnocenZLogoHorizontal className="iz-portal-sidebar-logo" />
				<p className="iz-tiny iz-muted mt-2">
					<TitleWithIcon
						icon={iconForNav(portal === "agency" ? "PR Agency" : "Outlet")}
					>
						{portal === "agency" ? "Agency portal" : "Outlet portal"}
					</TitleWithIcon>
				</p>
			</div>

			<nav className="iz-portal-sidebar-nav">
				{items.map((item) => (
					<PortalSidebarLink
						key={item.to}
						item={item}
						pathname={pathname}
						onNavigate={onNavigate}
					/>
				))}
			</nav>

			<div className="iz-portal-sidebar-foot">
				<button
					type="button"
					className="iz-portal-nav-link w-full"
					onClick={signOutToWelcome}
				>
					<LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
					<span>Sign out</span>
				</button>
			</div>
		</aside>
	);
}

function isAgencyHomePath(pathname: string) {
	return /\/agency\/?$/.test(pathname);
}

function isAgencyRosterPath(pathname: string) {
	return pathname.startsWith("/agency/roster");
}

function PortalHeader({
	portal,
	orgName,
	ownerName,
	avatarPhoto,
	subLabel,
	demoData,
}: {
	portal: PortalKind;
	orgName: string;
	ownerName: string;
	avatarPhoto?: string | null;
	subLabel: string;
	demoData: boolean;
}) {
	const { pathname } = useLocation();
	const onAgencyHome = portal === "agency" && isAgencyHomePath(pathname);
	const onAgencyRoster = portal === "agency" && isAgencyRosterPath(pathname);
	const showDatetime = onAgencyHome || onAgencyRoster;
	const { date, time } = showDatetime
		? nowAgencyDateTime()
		: { date: "", time: "" };

	return (
		<header className="iz-portal-header">
			<div className="min-w-0">
				<h1 className="font-sora text-xl font-extrabold tracking-tight text-[var(--iz-txt)] md:text-2xl">
					{portalGreeting()},{" "}
					<span className="text-[var(--iz-gold-l)]">
						{ownerName.trim() || orgName}
					</span>
				</h1>
				{showDatetime &&
					(onAgencyRoster ? (
						<p className="iz-tiny iz-muted2 mt-1">
							{date} · {time}
						</p>
					) : (
						<p className="iz-portal-header-datetime">
							<span className="iz-tiny iz-muted2 uppercase tracking-widest">
								Today
							</span>
							<span className="font-sora text-lg font-extrabold leading-snug text-[var(--iz-txt)]">
								{date} · {time}
							</span>
						</p>
					))}
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{demoData && (
					<span
						className="iz-tiny rounded-full border border-[var(--iz-danger,#dc2626)] px-2 py-0.5 font-bold uppercase tracking-widest text-[var(--iz-danger,#dc2626)]"
						title="Fixture data. This session was never authenticated against the backend, so nothing here is real and nothing you do will be saved."
					>
						Demo data
					</span>
				)}
				<OpsNotificationBell portal={portal} />
				<Link
					to={portalProfilePath(portal)}
					className="iz-portal-header-profile"
					title={`${ownerName} · ${subLabel}`}
					aria-label={`Profile · ${ownerName}`}
				>
					<PortalAvatar
						portal={portal}
						ownerName={ownerName}
						orgName={orgName}
						avatarPhoto={avatarPhoto}
						className="iz-avatar--md"
					/>
				</Link>
			</div>
		</header>
	);
}

export function PortalShell({
	portal,
	navItems,
	children,
	overlay,
}: {
	portal: PortalKind;
	navItems: NavItem[];
	children: ReactNode;
	overlay?: ReactNode;
}) {
	const agencySubRole = useStore((s) => s.agencySubRole);
	const outletSubRole = useStore((s) => s.outletSubRole);
	const agencyOwner = useStore((s) => s.agencyOwner);
	const outletOwner = useStore((s) => s.outletOwner);
	const owner = portal === "agency" ? agencyOwner : outletOwner;
	const orgName = owner.orgName;
	const { data: me } = useProfile();
	// Header chip is the signed-in person's photo (`user.profile_image`), not
	// the organisation logo kept on outletOwner/agencyOwner.avatarPhoto.
	const personalPhoto = apiAssetUrl(me?.profileImage) ?? null;

	const subLabel =
		portal === "agency"
			? AGENCY_SUB_ROLE_LABELS[agencySubRole ?? "agency_owner"]
			: OUTLET_SUB_ROLE_LABELS[outletSubRole ?? "outlet_owner"];

	const orgProfileOnly =
		getPortalSessionKind() === "real" &&
		(portal === "agency"
			? isOrgProfileOnly(getAgencyIdentity()?.agencyStatus)
			: isOrgProfileOnly(getOutletIdentity()?.outletStatus));

	const sidebarItems = mergeNavItems(
		portal,
		navItems,
		agencySubRole,
		outletSubRole,
		orgProfileOnly,
	);

	// A session that did not authenticate against the backend renders fixtures,
	// and until now said so nowhere: org name and sub-role read identically to a
	// real login. Anything other than 'real' counts, including an UNSET marker —
	// that is the legacy case, and it keeps the demo seed too.
	const [demoData, setDemoData] = useState(false);
	useEffect(() => {
		setDemoData(getPortalSessionKind() !== "real");
	}, []);

	const [collapsed, setCollapsed] = useState(false);
	useEffect(() => {
		try {
			setCollapsed(localStorage.getItem("iz-portal-sidebar-collapsed") === "1");
		} catch {
			/* ignore unavailable storage */
		}
	}, []);
	const toggleCollapsed = () =>
		setCollapsed((prev) => {
			const next = !prev;
			try {
				localStorage.setItem("iz-portal-sidebar-collapsed", next ? "1" : "0");
			} catch {
				/* ignore unavailable storage */
			}
			return next;
		});

	return (
		<div
			className="iz-portal"
			data-portal={portal}
			data-collapsed={collapsed ? "true" : undefined}
		>
			<PortalSidebar portal={portal} items={sidebarItems} />

			<button
				type="button"
				className="iz-portal-collapse-toggle"
				onClick={toggleCollapsed}
				aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
				title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
			>
				{collapsed ? (
					<ChevronRight className="h-4 w-4" strokeWidth={2} />
				) : (
					<ChevronLeft className="h-4 w-4" strokeWidth={2} />
				)}
			</button>

			<div className="iz-portal-main">
				<PortalHeader
					portal={portal}
					orgName={orgName}
					ownerName={
						me?.username?.trim() ||
						me?.displayName?.trim() ||
						owner.ownerName.trim() ||
						""
					}
					avatarPhoto={personalPhoto}
					subLabel={subLabel}
					demoData={demoData}
				/>

				<div className="iz-portal-viewport">{children}</div>
			</div>

			{navItems.length > 0 && (
				<div className="iz-portal-mobile-footer md:hidden">
					<BottomNav items={navItems} />
				</div>
			)}

			{overlay}
		</div>
	);
}
