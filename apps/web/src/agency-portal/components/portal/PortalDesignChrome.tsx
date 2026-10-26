import { IconGuide } from "@agency-portal/components/iz/IconGuide";
import type { NavItem } from "@agency-portal/components/Nav";
import {
	Dialog,
	DialogContent,
	DialogTitle,
} from "@agency-portal/components/ui/dialog";
import { ArrowUp, CircleHelp } from "lucide-react";
import { useEffect, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

export type PortalNavSection = "workspace" | "management" | "organization";
export type PortalNavSections = Record<PortalNavSection, boolean>;
type DesignPortal = "agency" | "outlet";

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

export function usePortalNavSections(portal: DesignPortal = "outlet") {
	const storageKey = `iz-${portal}-navigation-sections`;
	const [sections, setSections] = useState<PortalNavSections>({
		workspace: false,
		management: false,
		organization: false,
	});
	useEffect(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
			setSections({
				workspace: saved?.workspace === true,
				management: saved?.management === true,
				organization: saved?.organization === true,
			});
		} catch {
			/* Private browsing may make storage unavailable. */
			setSections({ workspace: false, management: false, organization: false });
		}
	}, [storageKey]);
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
