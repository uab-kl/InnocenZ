import { InnocenZWordmark, LogoMark } from "@agency-portal/components/Brand";
import { TitleWithIcon } from "@agency-portal/components/iz/TitleWithIcon";
import { type NavItem, navIsActive } from "@agency-portal/components/Nav";
import {
	NavAlertBadge,
	navAlertAriaSuffix,
	useNavAlerts,
} from "@agency-portal/components/portal/NavAlertBadge";
import { OpsNotificationBell } from "@agency-portal/components/portal/OpsNotificationBell";
import {
	PortalBackToTop,
	PortalIconGuide,
	type PortalNavSection,
	type PortalNavSections,
	portalNavSection,
	portalPageLabel,
	usePortalNavSections,
} from "@agency-portal/components/portal/PortalDesignChrome";
import { PortalNavAlerts } from "@agency-portal/components/portal/PortalNavAlerts";

import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { agencySubRoleLabel } from "@agency-portal/lib/agency-rbac";
import { signOutToWelcome } from "@agency-portal/lib/go-welcome";
import { iconForNav } from "@agency-portal/lib/lucide-label-icons";
import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { outletSubRoleLabel } from "@agency-portal/lib/outlet-rbac";
import { publicAssetPath } from "@agency-portal/lib/public-asset";
import { useStore } from "@agency-portal/lib/store";
import {
	useAgencyCanFor,
	useOutletCanFor,
} from "@agency-portal/lib/use-portal-can";
import { Link, useLocation } from "@tanstack/react-router";
import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	LogOut,
	Menu as MenuIcon,
	X,
} from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
import { isOrgProfileOnly } from "@/components/organization/org-status";
import { PortalLanguageSwitcher } from "@/components/portal-language-switcher";
import { getPortalSessionKind } from "@/lib/auth/agency-demo-session";
import { useProfile } from "@/lib/auth/use-profile";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

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

/**
 * English nav label -> dictionary key.
 *
 * The label is translated HERE, at the render boundary, rather than in
 * `agency-rbac.ts` / `outlet-rbac.ts` where the items are declared. Those files
 * feed the same string to `iconForNav(label)`, so a translated label there would
 * silently lose every sidebar icon — the lookup would miss and fall through to
 * its default. `to`, `icon` and `permission` therefore stay in English and
 * routing/RBAC are untouched by language.
 *
 * The VALUES are `keyof t.nav`, so a typo in a key fails the build. The KEYS are
 * plain strings that cannot be checked against the two rbac files; if a label is
 * ever renamed there, `localiseNav` falls back to the original English rather
 * than rendering `undefined` — the same non-throwing posture as `usePortalLocale`.
 */
const NAV_KEY_BY_LABEL: Record<string, keyof PortalTranslations["nav"]> = {
	Today: "today",
	Roster: "roster",
	Approvals: "approvals",
	Payroll: "payroll",
	History: "history",
	"Manage PR": "managePr",
	"Manage Outlet": "manageOutlet",
	Subscription: "subscription",
	Settings: "settings",
	"Post Job": "postJob",
	"Calendar page": "calendarPage",
	Ratings: "ratings",
	Reports: "reports",
	Workspace: "workspace",
	Dashboard: "dashboard",
};

/**
 * A page's own name when the sidebar does not carry it.
 *
 * The breadcrumb names a page by finding its sidebar item, so a page with NO
 * item of its own — Special service, the outlet Profile — fell back to the
 * portal's name and read "Outlet portal / Outlet portal". So did a page whose
 * item this lane cannot see (Workspace for an Ops Head who typed the URL). The
 * sidebar still wins whenever it has the page; this is only the fallback, and
 * routes that merely redirect (`/outlet/dashboard`, `/agency/live`) need none.
 *
 * Keys are `keyof t.nav`, so a typo fails the build.
 */
const PAGE_KEY_BY_PATH: Record<string, keyof PortalTranslations["nav"]> = {
	"/outlet/special-service": "specialService",
	"/outlet/profile": "profile",
	"/outlet/ratings": "ratings",
	"/outlet/workspace": "workspace",
	"/outlet/subscription": "subscription",
	"/outlet/settings": "settings",
	"/agency/special-service": "specialService",
	"/agency/prs": "managePr",
	"/agency/outlets": "manageOutlet",
	"/agency/subscription": "subscription",
	"/agency/profile": "settings",
};

export function shellPageLabel(
	items: NavItem[],
	pathname: string,
	t: PortalTranslations,
): string | undefined {
	const fromNav = portalPageLabel(items, pathname);
	if (fromNav) return fromNav;
	const key = PAGE_KEY_BY_PATH[pathname.replace(/\/$/, "")];
	return key ? t.nav[key] : undefined;
}

/**
 * Applied to both the sidebar and the mobile drawer. Translating at one of
 * the two render sites would leave a portal whose sidebar and drawer are in
 * different languages on the same screen.
 */
function localiseNav(items: NavItem[], t: PortalTranslations): NavItem[] {
	return items.map((item) => {
		const key = NAV_KEY_BY_LABEL[item.label];
		return key ? { ...item, label: t.nav[key] } : item;
	});
}

/**
 * The extras (Workspace / Subscription / Settings) are filtered with the SAME
 * predicate the route layout builds its nav from — module grants included.
 * Passing a bare sub-role here is what let the sidebar and the pages behind it
 * answer differently.
 */
function mergeNavItems(
	portal: PortalKind,
	base: NavItem[],
	canAgency: (permission: string) => boolean,
	canOutlet: (permission: string) => boolean,
	orgProfileOnly: boolean,
): NavItem[] {
	const seen = new Set(base.map((i) => i.to));
	const extras = portal === "agency" ? AGENCY_EXTRAS : OUTLET_EXTRAS;
	const filtered = extras.filter((item) => {
		if (seen.has(item.to)) return false;
		// Pending / suspended: only Settings / Profile — no Workspace or Subscription.
		if (orgProfileOnly) {
			return item.to === "/outlet/settings" || item.to === "/agency/profile";
		}
		if (portal === "agency") return canAgency(item.permission);
		return canOutlet(item.permission);
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
	const { t } = usePortalLocale();
	const alert = useNavAlerts()[item.to];
	return (
		<Link
			to={item.to}
			className={`iz-portal-nav-link${active ? " on" : ""}`}
			onClick={onNavigate}
			/*
			 * The count is announced HERE, on the link, and hidden on the pill
			 * itself. A screen reader reading "Payroll" and then a bare "7" says
			 * nothing about what seven is.
			 */
			aria-label={`${item.label}${navAlertAriaSuffix(alert?.count, t.shell.navAlertWaiting)}`}
		>
			<item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
			<span>{item.label}</span>
			{alert && <NavAlertBadge count={alert.count} tone={alert.tone} />}
		</Link>
	);
}

function PortalSidebar({
	portal,
	items,
	identity,
	onNavigate,
	sections,
	onToggleSection,
}: {
	portal: PortalKind;
	items: NavItem[];
	/** Who this rail is acting for — the same parts the greeting prints. */
	identity: { name: string; role: string };
	onNavigate?: () => void;
	sections?: PortalNavSections;
	onToggleSection?: (section: PortalNavSection) => void;
}) {
	const { pathname } = useLocation();
	const { t, locale } = usePortalLocale();
	const portalKindLabel =
		portal === "agency" ? t.shell.agencyPortal : t.shell.outletPortal;

	return (
		<aside className="iz-portal-sidebar">
			<div className="iz-portal-sidebar-brand">
				<div className="iz-portal-sidebar-logo iz-approved-brand">
					<LogoMark />
					<InnocenZWordmark />
				</div>
				{/*
				  WHO this rail is acting for, where the portal KIND used to be.
				
				  "Agency portal" answered a question the icon beside it already
				  answers, and never the one that matters to somebody holding two
				  logins: WHICH agency. The kind is still reachable — it stays on the
				  block as a tooltip and as real (visually hidden) text, so a screen
				  reader is told no less than it used to be.
				
				  ⚠️ That hidden text is a SPAN, not an `aria-label`. A bare <p> has the
				  `generic` role, which supports no accessible name at all -- an
				  aria-label there is licensed to be dropped entirely, and the portal
				  kind would have been announced to nobody.
				*/}
				<p
					className="iz-portal-sidebar-org mt-2"
					title={`${identity.name} · ${identity.role}`}
				>
					<span className="sr-only">{portalKindLabel} · </span>
					<TitleWithIcon
						icon={iconForNav(portal === "agency" ? "PR Agency" : "Outlet")}
					>
						<span className="iz-portal-sidebar-org__name">
							<span className="iz-portal-sidebar-org__label">
								{identity.name}
							</span>
							{identity.role ? (
								<span className="iz-portal-sidebar-org__role">
									{identity.role}
								</span>
							) : null}
						</span>
					</TitleWithIcon>
				</p>
			</div>

			<nav className="iz-portal-sidebar-nav">
				{sections
					? (["workspace", "management", "organization"] as const).map(
							(section) => {
								const links = items.filter(
									(item) => portalNavSection(item.to) === section,
								);
								if (!links.length) return null;
								const labels =
									locale === "zh"
										? {
												workspace: "工作区",
												management: "管理",
												organization: "组织",
											}
										: {
												workspace: "Workspace",
												management: "Management",
												organization: "Organization",
											};
								return (
									<div className="iz-outlet-nav-group" key={section}>
										<button
											type="button"
											className="iz-outlet-nav-heading"
											aria-expanded={sections[section]}
											onClick={() => onToggleSection?.(section)}
										>
											<span>{labels[section]}</span>
											<ChevronDown aria-hidden className="h-4 w-4" />
										</button>
										<div
											className="iz-outlet-nav-items"
											hidden={!sections[section]}
										>
											{links.map((item) => (
												<PortalSidebarLink
													key={item.to}
													item={item}
													pathname={pathname}
													onNavigate={onNavigate}
												/>
											))}
										</div>
									</div>
								);
							},
						)
					: items.map((item) => (
							<PortalSidebarLink
								key={item.to}
								item={item}
								pathname={pathname}
								onNavigate={onNavigate}
							/>
						))}
			</nav>

			<div className="iz-portal-sidebar-foot">
				{/*
				  Above Sign out, below the nav: the one spot in this rail that is
				  not already occupied. The logo owns the top, the nav owns the
				  middle, and the header's bell + avatar are in a different
				  element entirely — so nothing here overlaps existing chrome.
				*/}
				<button
					type="button"
					className="iz-portal-nav-link iz-portal-sign-out w-full"
					onClick={signOutToWelcome}
				>
					<LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
					<span>{t.shell.signOut}</span>
				</button>
			</div>
		</aside>
	);
}

/**
 * The one identity string every Agency / Outlet portal prints:
 * `Organisation (Role)` — e.g. "Velvet 23 (Manager)", "Atlas PR (Owner)".
 *
 * The greeting used to print the signed-in PERSON's name, which told a manager
 * who is seated at two venues nothing about which one this screen is acting
 * for. The organisation is the fact that decides what the screen may do, and
 * the role is the fact that decides how much of it. The person's own name is
 * still one click away on their profile.
 *
 * Falls back to the person's name when an org name has not loaded yet, and to
 * the bare role when neither is known — never renders an empty bracket.
 */
function portalIdentityParts(
	orgName: string,
	ownerName: string,
	subLabel: string,
): { name: string; role: string } {
	const name = orgName.trim() || ownerName.trim();
	// No org and no person: the role IS the label, and gets no bracket of its own.
	return name ? { name, role: subLabel } : { name: subLabel, role: "" };
}

function portalIdentityLabel(
	orgName: string,
	ownerName: string,
	subLabel: string,
) {
	const { name, role } = portalIdentityParts(orgName, ownerName, subLabel);
	return role ? `${name} (${role})` : name;
}

function PortalHeader({
	portal,
	orgName,
	ownerName,
	avatarPhoto,
	subLabel,
	demoData,
	pageLabel,
	onOpenMenu,
	menuOpen,
}: {
	portal: PortalKind;
	orgName: string;
	ownerName: string;
	avatarPhoto?: string | null;
	subLabel: string;
	demoData: boolean;
	pageLabel?: string;
	onOpenMenu?: () => void;
	menuOpen?: boolean;
}) {
	const { t } = usePortalLocale();
	const portalLabel =
		portal === "agency" ? t.shell.agencyPortal : t.shell.outletPortal;

	return (
		<header className="iz-portal-header">
			<button
				type="button"
				className="iz-outlet-menu-button iz-outlet-icon-button"
				onClick={onOpenMenu}
				aria-label={t.shell.menu}
				aria-haspopup="dialog"
				aria-expanded={menuOpen}
			>
				<MenuIcon aria-hidden className="h-5 w-5" />
			</button>
			<div className="min-w-0 flex-1">
				<p
					className="iz-portal-greeting truncate"
					title={pageLabel || portalLabel}
				>
					<span className="iz-outlet-header-kind">
						{portalLabel}
						<span aria-hidden> / </span>
					</span>
					{pageLabel || portalLabel}
				</p>
			</div>
			<div className="iz-portal-header-tools flex shrink-0 items-center gap-2">
				<PortalIconGuide />
				<PortalLanguageSwitcher variant="header" />
				{demoData && (
					<span
						className="iz-tiny rounded-full border border-[var(--iz-danger,#dc2626)] px-2 py-0.5 font-bold uppercase tracking-widest text-[var(--iz-danger,#dc2626)]"
						title={t.shell.demoDataHint}
					>
						{t.shell.demoData}
					</span>
				)}
				<OpsNotificationBell portal={portal} />
				<Link
					to={portalProfilePath(portal)}
					className="iz-portal-header-profile"
					title={portalIdentityLabel(orgName, ownerName, subLabel)}
					aria-label={`${t.shell.profile} · ${portalIdentityLabel(orgName, ownerName, subLabel)}`}
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
	const { t } = usePortalLocale();
	const { data: me } = useProfile();
	// Header chip is the signed-in person's photo (`user.profile_image`), not
	// the organisation logo kept on outletOwner/agencyOwner.avatarPhoto.
	const personalPhoto = apiAssetUrl(me?.profileImage) ?? null;

	/*
	 * ⚠️ RESOLVED, not defaulted to owner. This read
	 * `AGENCY_SUB_ROLE_LABELS[agencySubRole ?? "agency_owner"]`, so while the
	 * lane was unresolved the header said "Owner" — above a sidebar
	 * `useAgencyCanFor(agencySubRole)` had just built at LEAST privilege from the
	 * same null. The person was told they were the owner and shown a Director's
	 * console.
	 */
	const subLabel =
		portal === "agency"
			? agencySubRoleLabel(agencySubRole, t)
			: outletSubRoleLabel(outletSubRole, t);

	/*
	 * Hoisted out of the header's props: the SIDEBAR prints this identity too
	 * now, and two copies of the fallback chain would be two chances to differ.
	 * Both sides read `portalIdentityParts`, so the rail and the greeting can
	 * only ever say the same thing.
	 */
	const ownerName =
		me?.username?.trim() ||
		me?.displayName?.trim() ||
		owner.ownerName.trim() ||
		"";
	const identity = portalIdentityParts(orgName, ownerName, subLabel);
	const { sections, toggleSection } = usePortalNavSections(portal);
	const { pathname } = useLocation();
	useEffect(() => {
		const attribute = portal === "agency" ? "agencyDesign" : "outletDesign";
		document.body.dataset[attribute] = "true";
		return () => {
			delete document.body.dataset[attribute];
		};
	}, [portal]);

	const orgProfileOnly =
		getPortalSessionKind() === "real" &&
		(portal === "agency"
			? isOrgProfileOnly(getAgencyIdentity()?.agencyStatus)
			: isOrgProfileOnly(getOutletIdentity()?.outletStatus));

	const canAgency = useAgencyCanFor(agencySubRole);
	const canOutlet = useOutletCanFor(outletSubRole);
	const sidebarItems = mergeNavItems(
		portal,
		navItems,
		canAgency as (permission: string) => boolean,
		canOutlet as (permission: string) => boolean,
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

	// Phone-only drawer carrying the full rail. Deliberately NOT persisted the
	// way `collapsed` is: a drawer that reopened itself on the next page load
	// would cover the screen someone had just navigated to.
	const [menuOpen, setMenuOpen] = useState(false);
	const drawerRef = useRef<HTMLDivElement>(null);
	const closeMenu = useCallback(() => setMenuOpen(false), []);
	useEffect(() => {
		const desktop = window.matchMedia("(min-width: 768px)");
		const closeOnDesktop = () => {
			if (desktop.matches) setMenuOpen(false);
		};
		desktop.addEventListener("change", closeOnDesktop);
		return () => desktop.removeEventListener("change", closeOnDesktop);
	}, []);
	useEffect(() => {
		if (!menuOpen) return;
		const previousFocus =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		const panel = drawerRef.current;
		panel?.querySelector<HTMLElement>("button")?.focus();
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setMenuOpen(false);
			if (event.key === "Tab" && panel) {
				const focusable = Array.from(
					panel.querySelectorAll<HTMLElement>(
						'a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]',
					),
				).filter((el) => el.getClientRects().length > 0);
				const first = focusable[0];
				const last = focusable[focusable.length - 1];
				if (event.shiftKey && document.activeElement === first) {
					event.preventDefault();
					last?.focus();
				} else if (!event.shiftKey && document.activeElement === last) {
					event.preventDefault();
					first?.focus();
				}
			}
		};
		window.addEventListener("keydown", onKey);
		// The panel sits over a scrolling viewport, so without this a touch drag
		// anywhere on the scrim scrolls the page underneath and the drawer
		// appears to float over content that is moving on its own.
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			window.removeEventListener("keydown", onKey);
			document.body.style.overflow = previousOverflow;
			previousFocus?.focus();
		};
	}, [menuOpen]);

	return (
		<PortalNavAlerts portal={portal}>
			<div
				className="iz-portal"
				data-portal={portal}
				data-collapsed={collapsed ? "true" : undefined}
			>
				<PortalSidebar
					portal={portal}
					items={localiseNav(sidebarItems, t)}
					identity={identity}
					sections={sections}
					onToggleSection={toggleSection}
				/>

				<button
					type="button"
					className="iz-portal-collapse-toggle"
					onClick={toggleCollapsed}
					aria-label={
						collapsed ? t.shell.expandSidebar : t.shell.collapseSidebar
					}
					title={collapsed ? t.shell.expandSidebar : t.shell.collapseSidebar}
				>
					{collapsed ? (
						<ChevronRight className="h-4 w-4" strokeWidth={2} />
					) : (
						<ChevronLeft className="h-4 w-4" strokeWidth={2} />
					)}
				</button>

				<div className="iz-portal-main" inert={menuOpen ? true : undefined}>
					<PortalHeader
						portal={portal}
						orgName={orgName}
						ownerName={ownerName}
						avatarPhoto={personalPhoto}
						subLabel={subLabel}
						demoData={demoData}
						pageLabel={shellPageLabel(
							localiseNav(sidebarItems, t),
							pathname,
							t,
						)}
						onOpenMenu={() => setMenuOpen(true)}
						menuOpen={menuOpen}
					/>

					<div className="iz-portal-viewport">{children}</div>
				</div>

				{menuOpen && (
					<div className="iz-portal-drawer md:hidden">
						{/*
					  The scrim is a real button, not a click-handled div: it is the
					  primary way out on a touch screen, and a div would be invisible
					  to a keyboard and to a screen reader.
					*/}
						<button
							type="button"
							className="iz-portal-drawer__scrim"
							aria-label={t.shell.closeMenu}
							onClick={closeMenu}
						/>
						<div
							ref={drawerRef}
							className="iz-portal-drawer__panel"
							role="dialog"
							aria-modal="true"
							aria-label={t.shell.menu}
						>
							<button
								type="button"
								className="iz-outlet-drawer-close iz-outlet-icon-button"
								aria-label={t.shell.closeMenu}
								onClick={closeMenu}
							>
								<X aria-hidden className="h-5 w-5" />
							</button>
							{/*
						  The SAME component the desktop rail renders, with the SAME
						  merged and permission-filtered list — so a phone can never
						  drift out of step with what a desktop shows. `onNavigate`
						  already existed on PortalSidebar for exactly this and had no
						  caller until now.

						  `identity` became REQUIRED when the rail started naming the
						  signed-in person. That landed on SL while this drawer landed on
						  main, so the two merged textually without ever touching each
						  other and only the typecheck caught that the combination was
						  incomplete. Passing it keeps the promise made just above: the
						  phone shows exactly what the desktop rail shows.
						*/}
							<PortalSidebar
								portal={portal}
								items={localiseNav(sidebarItems, t)}
								identity={identity}
								sections={sections}
								onToggleSection={toggleSection}
								onNavigate={closeMenu}
							/>
						</div>
					</div>
				)}

				{overlay}
				{!menuOpen && <PortalBackToTop />}
			</div>
		</PortalNavAlerts>
	);
}
