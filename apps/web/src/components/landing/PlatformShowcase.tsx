import { motion } from "motion/react";
import { useState } from "react";
import { MaterialIcon } from "@/components/landing/MaterialIcon";
import { Reveal } from "@/components/landing/Reveal";
import { LANDING_IMAGES } from "@/lib/landing-assets";

type PortalId = "outlet" | "agency" | "pr";
type DemoLayout = "desktop" | "mobile";

const portals: {
	id: PortalId;
	label: string;
	tabLabel: string;
	icon: string;
	flowHeadline: string[];
	desc: string;
	flow: string[];
}[] = [
	{
		id: "outlet",
		label: "Outlet",
		tabLabel: "Outlet",
		icon: "storefront",
		flowHeadline: ["Tonight", "Live floor", "Net sales"],
		desc: "Book PR coverage, watch GPS check-ins in real time, and close the night with ratings and Net Sales Report.",
		flow: ["Book PR by tier", "Live shift board", "Net Sales Report"],
	},
	{
		id: "agency",
		label: "PR Agency",
		tabLabel: "Agency",
		icon: "groups",
		flowHeadline: ["Roster", "Live floor", "Payroll"],
		desc: "Plan weekly rosters across outlets, monitor who's on duty, issue payment vouchers, and settle each payroll cycle.",
		flow: [
			"Weekly roster plan",
			"Live workforce view",
			"Dispute payment vouchers management",
		],
	},
	{
		id: "pr",
		label: "PR",
		tabLabel: "PR",
		icon: "star",
		flowHeadline: ["Tonight", "Check in", "Payout"],
		desc: "Accept tonight's shift, check in with GPS, scan receipts on the floor, then review and sign your payment voucher.",
		flow: ["Accept shift", "Check in", "Scan receipts · sign PV"],
	},
];

const portalDemos: Record<
	PortalId,
	{ src: string; alt: string; layout: DemoLayout; title: string }
> = {
	outlet: {
		src: LANDING_IMAGES.outletPortalDemo,
		alt: "Outlet portal with PR tonight roster and live Hennessy Launch event",
		layout: "desktop",
		title: "Outlet portal",
	},
	agency: {
		src: LANDING_IMAGES.agencyPortalDemo,
		alt: "Agency portal with live workforce, payouts, and roster planning",
		layout: "desktop",
		title: "Agency portal",
	},
	pr: {
		src: LANDING_IMAGES.prPortalDemo,
		alt: "PR mobile app with tonight's shift, check-in, and payout flow",
		layout: "mobile",
		title: "PR app",
	},
};

function FlowHeadline({ steps }: { steps: string[] }) {
	// No `aria-label` here: a generic <div> carries no role, so assistive tech
	// ignores the label and reads the children instead. The step words below are
	// real text and only the "→" separators are hidden, so the announced headline
	// is already the step list in order.
	return (
		<div className="platform-flow-headline">
			{steps.map((step, i) => (
				<span key={step} className="platform-flow-headline__group">
					<span className="platform-flow-headline__step">{step}</span>
					{i < steps.length - 1 ? (
						<span className="platform-flow-headline__arrow" aria-hidden>
							→
						</span>
					) : null}
				</span>
			))}
		</div>
	);
}

function PortalDemo({ portal }: { portal: PortalId }) {
	const demo = portalDemos[portal];
	const isMobile = demo.layout === "mobile";

	return (
		<div className="platform-demo-stage">
			<div
				className={`platform-demo-frame ${
					isMobile
						? "platform-demo-frame--mobile"
						: "platform-demo-frame--desktop"
				}`}
			>
				<div
					className={`platform-demo-viewport platform-demo-viewport--${portal}`}
				>
					<img
						src={demo.src}
						alt={demo.alt}
						className="platform-demo-shot"
						loading="lazy"
						decoding="async"
					/>
					<div className="platform-demo-caption">
						<span className="platform-demo-caption__dot" aria-hidden />
						<span>{demo.title}</span>
						<span className="platform-demo-caption__badge">Demo</span>
					</div>
				</div>
			</div>
		</div>
	);
}

export function PlatformShowcase() {
	const [active, setActive] = useState<PortalId>("outlet");
	const portal = portals.find((p) => p.id === active)!;

	return (
		<section className="platform-showcase w-full border-y border-royal-gold/20 bg-section-violet px-6 py-20">
			<Reveal className="mx-auto mb-12 max-w-3xl text-center">
				<div className="landing-label text-royal-gold">Platform in action</div>
				<h2 className="landing-section-h2 mt-4 uppercase tracking-tight text-foreground">
					Built for how you actually run shifts
				</h2>
				<p className="landing-section-body mt-4 text-foreground/75">
					Three portals — outlet web, agency web, and PR mobile — synced from
					roster planning through receipt scan to signed payment voucher.
				</p>
			</Reveal>

			<Reveal className="platform-portal-tabs-wrap mx-auto mb-10 flex w-full justify-center px-2">
				<div
					className="platform-portal-tabs"
					role="tablist"
					aria-label="Platform portals"
				>
					{portals.map((p) => {
						const isActive = active === p.id;
						return (
							<button
								key={p.id}
								type="button"
								role="tab"
								aria-selected={isActive}
								onClick={() => setActive(p.id)}
								className={`platform-portal-tab ${isActive ? "is-active" : ""}`}
							>
								<span className="platform-portal-tab__icon" aria-hidden>
									<MaterialIcon name={p.icon} />
								</span>
								<span className="platform-portal-tab__label">{p.tabLabel}</span>
							</button>
						);
					})}
				</div>
			</Reveal>

			<div
				className={`platform-showcase-grid platform-showcase-grid--${active} mx-auto grid w-full gap-10 xl:items-center`}
			>
				<Reveal
					className={`platform-showcase-panel platform-showcase-panel--portal platform-showcase-panel--${active} relative z-10 flex min-w-0 flex-col justify-center xl:py-4`}
				>
					<FlowHeadline steps={portal.flowHeadline} />
					<p className="platform-showcase-desc landing-section-body mt-4 leading-relaxed text-foreground/80">
						{portal.desc}
					</p>

					<ul className="platform-showcase-steps platform-showcase-steps--portal mt-8 space-y-4">
						{portal.flow.map((step, i) => (
							<li
								key={step}
								className="platform-showcase-step flex items-center gap-4 text-foreground/85"
							>
								<span className="platform-showcase-step__num flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-royal-gold-soft text-base font-bold text-royal-gold ring-1 ring-royal-gold/40">
									{i + 1}
								</span>
								<span className="platform-showcase-step__label">{step}</span>
							</li>
						))}
					</ul>

					<a
						href="https://ng8522.github.io/InnocenZ-proto/"
						target="_blank"
						rel="noopener noreferrer"
						className="landing-btn platform-prototype-btn platform-prototype-btn--portal group relative mt-10 inline-flex w-full items-center justify-center gap-2.5 overflow-hidden bg-[image:var(--gradient-royal)] text-[#1a1726] shadow-glow-gold transition-transform hover:-translate-y-0.5 sm:w-auto"
					>
						<span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-sheen bg-white/30 blur-md" />
						Try the live prototype
						<MaterialIcon name="open_in_new" className="!text-xl" />
					</a>
				</Reveal>

				<Reveal
					delay={120}
					className={`platform-showcase-demo platform-showcase-demo--${active} relative z-0 flex min-w-0 items-center justify-center`}
				>
					<motion.div
						key={active}
						className="w-full"
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.4 }}
					>
						<PortalDemo portal={active} />
					</motion.div>
				</Reveal>
			</div>
		</section>
	);
}
