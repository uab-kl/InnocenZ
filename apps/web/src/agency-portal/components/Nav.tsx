import { TitleWithIcon } from "@agency-portal/components/iz/TitleWithIcon";
import { AGENCY_SUB_ROLE_LABELS } from "@agency-portal/lib/agency-rbac";
import { goToWelcome } from "@agency-portal/lib/go-welcome";
import {
	getAutoBackLabel,
	getAutoBackTo,
	WELCOME_PATH,
} from "@agency-portal/lib/nav-back";
import { OUTLET_SUB_ROLE_LABELS } from "@agency-portal/lib/outlet-rbac";
import { publicAssetPath } from "@agency-portal/lib/public-asset";
import { useStore } from "@agency-portal/lib/store";
import { usePrPortalReady } from "@agency-portal/lib/use-pr-sub-role";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

export interface NavItem {
	to: string;

	label: string;

	icon: LucideIcon;
}

export function navIsActive(pathname: string, to: string) {
	if (pathname === to || pathname === `${to}/`) return true;

	const hubs = ["/host", "/outlet", "/agency"];

	if (hubs.includes(to)) return false;

	return pathname.startsWith(`${to}/`);
}

export function BottomNav({
	items,
	className,
	trailing,
}: {
	items: NavItem[];
	className?: string;
	/**
	 * Rendered as the last cell of the bar, beside the links.
	 *
	 * This bar is the ONLY navigation a phone gets — `.iz-portal-sidebar` is
	 * `display: none` below 768px — and it was handed the BASE nav list while
	 * the sidebar got the MERGED one. Everything the merge adds (Settings,
	 * Subscription, Workspace, Manage PR / Manage Outlet) therefore had no
	 * route to it on a phone at all, and neither did Sign out, which lives in
	 * the sidebar foot. `trailing` is where the overflow control goes;
	 * `.iz-tabbar` already styles `button` identically to `a`, so it needs no
	 * new chrome.
	 */
	trailing?: ReactNode;
}) {
	const { pathname } = useLocation();

	return (
		<nav className={className ? `iz-tabbar ${className}` : "iz-tabbar"}>
			{items.map((i) => {
				const isActive = navIsActive(pathname, i.to);

				return (
					<Link
						key={i.to}
						to={i.to}
						className={isActive ? "on" : ""}
						data-active={isActive ? "true" : undefined}
					>
						<i.icon className="h-5 w-5" strokeWidth={1.8} />

						<span>{i.label}</span>
					</Link>
				);
			})}

			{trailing}
		</nav>
	);
}

/**
 * The topbar identity when we do not yet know who is signed in.
 *
 * ⚠️ `name` is a FALLBACK, not a person. It read "Vicky", "Atlas Agency" and
 * "Velvet 23" — three demo identities — and `displayName` below is
 * `prDisplayName ?? meta.name`, where `prDisplayName` is a PR field. So every
 * agency session that rendered this bar was greeted as **Atlas Agency** and
 * every outlet session as **Velvet 23**, whoever they actually were. That is
 * the failure `.cursor/rules/no-demo-data-on-real-sessions.mdc` exists to stop,
 * and a name is the worst thing to guess: a wrong one is indistinguishable from
 * a right one.
 *
 * A fallback may describe the ROLE. It may never name a company or a person.
 *
 * `name` and `label` are RESOLVERS, not strings: both are rendered, and a
 * module-scope map cannot call a hook to read the dictionary. The record KEYS
 * are the internal role discriminators (`host`, `vendor`, \u2026) and never move.
 * "PR" itself stays English in every locale \u2014 it is the product's term for the
 * role and the word the database stores, so translating it on screen alone
 * would make the portal and the data disagree.
 */
const ROLE_LABELS: Record<
	string,
	{
		name: (t: PortalTranslations) => string;
		label: (t: PortalTranslations) => string;
		av: string;
		gradient: string;
	}
> = {
	host: {
		name: () => "PR",
		label: () => "PR",
		av: "P",
		gradient: "linear-gradient(135deg,#6b7280,#374151)",
	},

	host_tied: {
		name: () => "PR",
		label: (t) => t.portalShell.rolePrAgencyTied,
		av: "P",
		gradient: "linear-gradient(135deg,#C99B4E,#8a5e22)",
	},

	agency: {
		name: (t) => t.portalShell.roleNameAgency,
		label: (t) => t.portalUi.portalNameAgency,
		av: "A",
		gradient: "var(--iz-grad)",
	},

	vendor: {
		name: (t) => t.portalUi.portalNameOutlet,
		label: (t) => t.portalUi.portalNameOutlet,
		av: "O",
		gradient: "linear-gradient(135deg,#39D98A,#1f8f5c)",
	},
};

export type AppTopbarProps = {
	backTo?: string;

	backLabel?: string;

	/** In-page back — return `false` to also run route navigation */

	onBack?: () => void | boolean;

	hideBack?: boolean;

	/** Extra class on the back/cancel control (e.g. larger Cancel edit). */
	backClassName?: string;
};

export function PortalBackButton({
	backTo,

	backLabel,

	onBack,

	className,
}: {
	backTo?: string;

	backLabel?: string;

	onBack?: () => void | boolean;

	className?: string;
}) {
	const { t } = usePortalLocale();
	const navigate = useNavigate();

	const { pathname } = useLocation();

	const resolvedBackTo = backTo ?? getAutoBackTo(pathname);

	// OWNER'S RULE (20 Aug): every back control in every portal is named
	// "Return" — one word, every page. The cancel variant keeps its own
	// label because cancelling an edit is not a navigation back.
	const isCancel = className?.includes("--cancel") ?? false;
	const resolvedLabel = isCancel
		? (backLabel ?? getAutoBackLabel(pathname))
		: t.postJob.returnBack;

	const showBack = onBack != null || resolvedBackTo != null;

	if (!showBack) {
		return <span className="iz-topbar-spacer" aria-hidden />;
	}

	const handleBack = () => {
		if (onBack) {
			const fallThrough = onBack();

			if (fallThrough !== false) return;
		}

		if (resolvedBackTo === WELCOME_PATH) {
			goToWelcome();

			return;
		}

		// OWNER'S RULE (20 Aug): Return goes to the page the user was ACTUALLY
		// on before — real history — never a hardcoded "home". The fixed route
		// survives only as the fallback for a deep link with no history.
		if (window.history.length > 1) {
			window.history.back();

			return;
		}

		if (resolvedBackTo) void navigate({ to: resolvedBackTo });
	};

	return (
		<button
			type="button"
			className={className ? `iz-topbar-back ${className}` : "iz-topbar-back"}
			onClick={handleBack}
			aria-label={resolvedLabel}
			title={resolvedLabel}
		>
			<ArrowLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />

			<span className="iz-topbar-back-label">{resolvedLabel}</span>
		</button>
	);
}

export function AppTopbar({
	backTo,

	backLabel,

	onBack,

	hideBack = false,

	backClassName,
}: AppTopbarProps) {
	const { t } = usePortalLocale();
	const { pathname } = useLocation();

	const { role: prSubRole } = usePrPortalReady();

	const outletSubRole = useStore((s) => s.outletSubRole);

	const agencySubRole = useStore((s) => s.agencySubRole);

	const prDisplayName = useStore((s) => s.prDisplayName);

	const prAvatarPhoto = useStore((s) => s.prAvatarPhoto);

	let role: keyof typeof ROLE_LABELS = "host";

	if (pathname.startsWith("/outlet")) role = "vendor";
	else if (pathname.startsWith("/agency")) role = "agency";
	else if (pathname.startsWith("/host")) {
		role = prSubRole === "pr_tied" ? "host_tied" : "host";
	}

	const meta = ROLE_LABELS[role];

	const displayName = prDisplayName ?? meta.name(t);

	const displayAv = displayName.trim()[0]?.toUpperCase() ?? meta.av;

	const displayGradient = meta.gradient;

	const displayLabel =
		pathname.startsWith("/outlet") && outletSubRole
			? OUTLET_SUB_ROLE_LABELS[outletSubRole](t)
			: pathname.startsWith("/agency") && agencySubRole
				? AGENCY_SUB_ROLE_LABELS[agencySubRole](t)
				: meta.label(t);

	const resolvedBackTo = backTo ?? getAutoBackTo(pathname);
	const isPortalShell =
		pathname.startsWith("/outlet") || pathname.startsWith("/agency");

	if (isPortalShell && onBack == null) {
		return null;
	}

	// The `isPrPortal ? hasExplicitBack : …` arm went with the `/host` branch
	// below: no such route exists in this app, so it was never taken. Everything
	// that is not the portal shell now uses the ordinary rule.
	const showBack =
		!hideBack &&
		(isPortalShell ? onBack != null : onBack != null || resolvedBackTo != null);

	return (
		<header
			className={`iz-topbar${isPortalShell ? " iz-topbar--minimal" : ""}${!showBack ? " iz-topbar--no-back" : ""}`}
		>
			{showBack && (
				<PortalBackButton
					backTo={backTo}
					backLabel={backLabel}
					onBack={onBack}
					className={backClassName}
				/>
			)}

			{/*
			 * The `/host` branch that used to sit here — a lazy `PrPortalTopbar`
			 * behind `isPrPortal` — is gone with the rest of the PR web portal.
			 * `apps/web` has no `/host` route (only admin/, agency/, outlet/,
			 * invite/ and the auth pages), so `pathname.startsWith("/host")` was
			 * never true and the branch could not render. The PR product is
			 * `apps/mobile`, which carries its own navigation.
			 */}
			{!isPortalShell && (
				<div className="iz-topbar-identity">
					<div
						className={`iz-avatar iz-avatar--sm${prAvatarPhoto ? " iz-avatar-photo" : ""}`}
						style={prAvatarPhoto ? undefined : { background: displayGradient }}
					>
						{prAvatarPhoto ? (
							<img src={publicAssetPath(prAvatarPhoto)} alt="" />
						) : (
							displayAv
						)}
					</div>
					<div className="iz-topbar-meta">
						<div className="iz-topbar-name">{displayName}</div>
						<div className="iz-topbar-role">{displayLabel}</div>
					</div>
				</div>
			)}
		</header>
	);
}

/** Standalone back row below topbar (detail overlays, sheets) */

export function BackBar({
	label,

	onBack,

	to,
}: {
	label?: string;

	onBack?: () => void;

	to?: string;
}) {
	const { t } = usePortalLocale();
	const navigate = useNavigate();

	// A default parameter value is evaluated before any hook runs, so it cannot
	// read the dictionary — the fallback has to be resolved here in the body.
	const resolvedLabel = label ?? t.common.back;

	return (
		<button
			type="button"
			className="iz-chip mb-2"
			onClick={() => {
				if (onBack) onBack();
				else if (to) navigate({ to });
			}}
		>
			<ArrowLeft className="h-3.5 w-3.5" />

			{resolvedLabel}
		</button>
	);
}

/** Screen shell: topbar + optional page title (wrap route content in `iz-screen`). */

export function AppHeader({
	title,

	subtitle,

	right,

	iconKey,

	...topbar
}: AppTopbarProps & {
	title: string;

	subtitle?: string;

	right?: ReactNode;

	/**
	 * ENGLISH lookup key for the title's icon. `TitleWithIcon` otherwise scrapes
	 * the key out of the rendered `title`, and that table is keyed on English —
	 * a translated title resolves to no icon at all, with nothing thrown and
	 * nothing logged. Any caller whose `title` comes from the dictionary MUST
	 * pass this, holding the key's `en` value.
	 */
	iconKey?: string;
}) {
	return (
		<>
			<AppTopbar {...topbar} />

			{(subtitle || title || right) && (
				<div className="pb-2">
					{subtitle && (
						<p className="iz-tiny iz-muted2 uppercase tracking-widest">
							{subtitle}
						</p>
					)}

					<div className="flex items-start justify-between gap-2">
						{title ? (
							<h1 className="font-sora text-[22px] font-extrabold tracking-tight text-[var(--iz-txt)]">
								<TitleWithIcon iconKey={iconKey}>{title}</TitleWithIcon>
							</h1>
						) : (
							<span />
						)}

						{right}
					</div>
				</div>
			)}
		</>
	);
}
