import { IconGuide } from "@agency-portal/components/iz/IconGuide";
import type { NavItem } from "@agency-portal/components/Nav";
import {
	Dialog,
	DialogContent,
	DialogTitle,
} from "@agency-portal/components/ui/dialog";
import { ArrowUp, CircleHelp } from "lucide-react";
import { useEffect, useState } from "react";
import { navSectionsKey } from "@/lib/nav-sections-storage";
import { usePortalLocale } from "@/lib/portal-i18n/context";

export type PortalNavSection = "workspace" | "management" | "organization";
export type PortalNavSections = Record<PortalNavSection, boolean>;
type DesignPortal = "agency" | "outlet";

/**
 * A sidebar group's name, in the reader's language.
 *
 * ONE copy, read by both the sidebar heading and the header breadcrumb. The
 * names were written inline inside the sidebar, which is why the breadcrumb
 * could not say "Workspace" at all: the only place that knew the word was the
 * rail, and the header said "Agency portal / Today" — which page, but never
 * which section. Admin got that answer earlier the same day; this gives it to
 * the two portals without a second dictionary that could disagree with the
 * first.
 */
export function portalSectionLabel(
	section: PortalNavSection,
	locale: string,
): string {
	if (locale === "zh") {
		return { workspace: "工作区", management: "管理", organization: "组织" }[
			section
		];
	}
	return {
		workspace: "Workspace",
		management: "Management",
		organization: "Organization",
	}[section];
}

export function portalNavSection(path: string): PortalNavSection {
	if (
		path === "/outlet/settings" ||
		path === "/outlet/profile" ||
		path === "/outlet/subscription" ||
		path === "/agency/profile" ||
		path === "/agency/subscription"
	)
		return "organization";
	if (
		path === "/outlet/billing" ||
		path === "/outlet/workspace" ||
		path === "/agency/prs" ||
		path === "/agency/outlets"
	)
		return "management";
	return "workspace";
}

/**
 * A fresh session shows ONE open group: the one holding the current page.
 *
 * Owner, 19 Nov 2026: "in default when the user log in to the agency and the
 * outlet, their side panel all close it, just opened the today page". This
 * REVERSES the 16 Nov "a first visit opens the whole map" — the worry then was
 * three shut headings with nothing to say what lay behind them, and that is
 * still answered: the current page's group opens (the effect below), and a
 * closed group carries its alert count on the heading. Every sign-in clears
 * the saved choice (`resetAllNavSections` in `saveAuthTokens` /
 * `clearAuthTokens`), so each session starts here; inside a session a SAVED
 * choice still wins in full, closed groups included.
 */
const ALL_CLOSED: PortalNavSections = {
	workspace: false,
	management: false,
	organization: false,
};

export function usePortalNavSections(
	portal: DesignPortal = "outlet",
	/** The group holding the current page, opened on top of whatever is stored. */
	activeSection?: PortalNavSection,
) {
	const storageKey = navSectionsKey(portal);
	const [sections, setSections] = useState<PortalNavSections>(ALL_CLOSED);
	useEffect(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
			// `null` is "never chosen", NOT "chose closed" — the distinction the
			// old `=== true` reading threw away.
			setSections(
				saved && typeof saved === "object"
					? {
							workspace: saved.workspace === true,
							management: saved.management === true,
							organization: saved.organization === true,
						}
					: ALL_CLOSED,
			);
		} catch {
			/* Private browsing may make storage unavailable. */
			setSections(ALL_CLOSED);
		}
	}, [storageKey]);
	// Declared AFTER the restore, like the admin rail: on mount both updates
	// queue in this order, so the active group opens on top of the stored
	// state rather than under it.
	useEffect(() => {
		if (!activeSection) return;
		setSections((previous) =>
			previous[activeSection]
				? previous
				: { ...previous, [activeSection]: true },
		);
	}, [activeSection]);
	return {
		sections,
		toggleSection: (section: PortalNavSection) => {
			setSections((previous) => {
				const next = { ...previous, [section]: !previous[section] };
				try {
					localStorage.setItem(storageKey, JSON.stringify(next));
				} catch {
					/* The controls still work without persistence. */
				}
				return next;
			});
		},
	};
}

export function portalPageLabel(items: NavItem[], pathname: string) {
	return items.find((item) => item.to === pathname.replace(/\/$/, ""))?.label;
}

export function PortalIconGuide() {
	const [open, setOpen] = useState(false);
	const { t } = usePortalLocale();
	return (
		<>
			<button
				type="button"
				className="iz-outlet-icon-button"
				aria-label={t.common.iconGuide}
				title={t.common.iconGuide}
				onClick={() => setOpen(true)}
			>
				<CircleHelp aria-hidden className="h-5 w-5" />
				<span className="iz-outlet-guide-label">{t.common.iconGuide}</span>
			</button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent
					className="iz-outlet-icon-guide-dialog"
					aria-describedby={undefined}
				>
					<DialogTitle>{t.common.iconGuide}</DialogTitle>
					<IconGuide defaultOpen />
				</DialogContent>
			</Dialog>
		</>
	);
}

export function PortalBackToTop() {
	const [visible, setVisible] = useState(false);
	const { locale } = usePortalLocale();
	useEffect(() => {
		const viewport = document.querySelector<HTMLElement>(".iz-portal-viewport");
		const update = () =>
			setVisible(Math.max(window.scrollY, viewport?.scrollTop || 0) > 360);
		update();
		window.addEventListener("scroll", update, { passive: true });
		viewport?.addEventListener("scroll", update, { passive: true });
		return () => {
			window.removeEventListener("scroll", update);
			viewport?.removeEventListener("scroll", update);
		};
	}, []);
	if (!visible) return null;
	return (
		<button
			type="button"
			className="iz-outlet-back-to-top"
			aria-label={locale === "zh" ? "返回顶部" : "Back to top"}
			onClick={() => {
				const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches
					? "instant"
					: "smooth";
				window.scrollTo({ top: 0, behavior });
				document
					.querySelector(".iz-portal-viewport")
					?.scrollTo({ top: 0, behavior });
			}}
		>
			<ArrowUp aria-hidden className="h-5 w-5" />
		</button>
	);
}
