import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { WHATSAPP_CONTACT_URL } from "@/constants/contact";
import { useLandingLocale } from "@/lib/landing-i18n";
import { HandoffLanguageSwitcher } from "./HandoffLanguageSwitcher";
import { LogoMark } from "./primitives";

export function HandoffNav() {
	const { t } = useLandingLocale();
	const [scrolled, setScrolled] = useState(false);

	const links = [
		{ label: t.nav.platform, href: "#platform" },
		{ label: t.nav.ai, href: "#ai" },
		{ label: t.nav.dashboards, href: "#dashboards" },
		{ label: t.nav.pricing, href: "#pricing" },
		{ label: t.nav.whyUs, href: "#why" },
		{ label: t.nav.contactUs, href: WHATSAPP_CONTACT_URL },
	] as const;

	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > 40);
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	return (
		<nav className="hz-nav-shell">
			<div
				className="hz-glass hz-nav-bar"
				style={{
					background: scrolled
						? "rgba(10,10,14,.7)"
						: "rgba(10,10,14,.35)",
				}}
			>
				<a
					href="#top"
					className="flex items-center gap-3.5 no-underline"
				>
					<LogoMark size={52} />
					<span
						className="hz-display hz-gold-text"
						style={{ fontSize: 26, letterSpacing: "-0.02em" }}
					>
						InnocenZ
					</span>
				</a>
				<div className="hz-nav-links">
					{links.map((l) => (
						<a
							key={l.href}
							href={l.href}
							className="hz-nav-link"
							{...(l.href.startsWith("http")
								? { target: "_blank", rel: "noopener noreferrer" }
								: {})}
						>
							{l.label}
						</a>
					))}
					<HandoffLanguageSwitcher />
				</div>
				<a
					href="/login"
					className="hz-btn hz-btn-gold"
					style={{ padding: "10px 18px", fontSize: 13 }}
				>
					{t.nav.login} <ArrowRight size={14} />
				</a>
			</div>
		</nav>
	);
}
