import { Briefcase, Building2 } from "lucide-react";
import { useState } from "react";
import { PoweredByBadge } from "@/components/landing/PoweredByBadge";
import {
	AGENCY_TIER_PRICES,
	OUTLET_TIER_PRICES,
	useLandingLocale,
} from "@/lib/landing-i18n";
import { LogoMark, SplitTitle } from "./primitives";

const OUTLET_POPULAR_INDEX = 2;
const AGENCY_POPULAR_INDEX = 2;

export function HandoffPricing() {
	const { t } = useLandingLocale();
	const [tab, setTab] = useState<"outlet" | "agency">("outlet");
	const isAgency = tab === "agency";
	const tiers = isAgency ? t.pricing.agencyTiers : t.pricing.outletTiers;
	const prices = isAgency ? AGENCY_TIER_PRICES : OUTLET_TIER_PRICES;
	const popularIndex = isAgency ? AGENCY_POPULAR_INDEX : OUTLET_POPULAR_INDEX;

	return (
		<section id="pricing" className="hz-section">
			<div className="hz-wrap">
				<div className="hz-section-head hz-section-head--center hz-section-head--pricing">
					<span className="hz-eyebrow hz-eyebrow--center">
						{t.pricing.eyebrow}
					</span>
					<h2 className="hz-display">
						<span className="hz-gold-text">{t.pricing.title}</span>
					</h2>
					<p className="hz-pricing-intro">
						{isAgency ? t.pricing.agencyIntro : t.pricing.outletIntro}
					</p>
					<ul
						key={tab}
						className={`hz-pricing-features ${isAgency ? "hz-pricing-features--agency" : ""}`}
					>
						{(isAgency
							? t.pricing.agencyFeatures
							: t.pricing.outletFeatures
						).map((feature) => (
							<li key={feature}>{feature}</li>
						))}
					</ul>
					<p className="hz-pricing-note">{t.pricing.platformNote}</p>
				</div>

				<div className="mb-10 flex justify-center">
					<div
						className="inline-flex rounded-full border p-1.5 backdrop-blur-md"
						style={{
							borderColor: "var(--hz-line-strong)",
							background: "rgba(10,10,14,.55)",
						}}
					>
						{(
							[
								{
									id: "outlet" as const,
									label: t.pricing.outletTab,
									icon: Building2,
								},
								{
									id: "agency" as const,
									label: t.pricing.agencyTab,
									icon: Briefcase,
								},
							] as const
						).map((tabItem) => {
							const active = tab === tabItem.id;
							const Icon = tabItem.icon;
							return (
								<button
									key={tabItem.id}
									type="button"
									onClick={() => setTab(tabItem.id)}
									className="inline-flex cursor-pointer items-center gap-2 rounded-full border-none px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-all"
									style={{
										fontFamily: "var(--hz-font-mono)",
										background: active
											? "linear-gradient(180deg,#fbe1a4,#f2c66b 60%,#c9962e)"
											: "transparent",
										color: active ? "#1a1207" : "var(--hz-ink-dim)",
										boxShadow: active
											? "0 6px 20px -6px rgba(242,198,107,.55), inset 0 1px 0 rgba(255,255,255,.4)"
											: "none",
									}}
								>
									<Icon
										className="size-[1.2em] shrink-0"
										strokeWidth={active ? 2.25 : 2}
									/>
									{tabItem.label}
								</button>
							);
						})}
					</div>
				</div>

				<div
					key={tab}
					className="hz-fade-swap grid gap-5 md:grid-cols-2 lg:grid-cols-3"
				>
					{tiers.map((tier, i) => {
						const isCustom = "price" in tier && tier.price;
						const isPopular = i === popularIndex;
						const price = isCustom
							? tier.price
							: prices[i as keyof typeof prices];

						return (
							<div
								key={tier.name}
								className="hz-glass relative flex flex-col gap-3.5 p-7"
								style={{
									border: isPopular
										? `1px solid ${isAgency ? "rgba(182,124,255,.5)" : "rgba(242,198,107,.5)"}`
										: "1px solid var(--hz-line)",
									background: isPopular
										? isAgency
											? "linear-gradient(180deg, rgba(182,124,255,.10), rgba(255,255,255,.02))"
											: "linear-gradient(180deg, rgba(242,198,107,.08), rgba(255,255,255,.02))"
										: undefined,
								}}
							>
								{isPopular && (
									<div
										className="absolute top-[-1px] right-5 rounded-b-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
										style={{
											fontFamily: "var(--hz-font-mono)",
											background: isAgency
												? "linear-gradient(180deg,#e0c9ff,#b67cff)"
												: "linear-gradient(180deg,#fbe1a4,#f2c66b)",
											color: "#1a1207",
										}}
									>
										{t.pricing.popular}
									</div>
								)}
								<div
									className="hz-mono text-[10px] uppercase tracking-[0.2em]"
									style={{ color: "var(--hz-ink-mute)" }}
								>
									{tier.capacity}
								</div>
								<div
									className="hz-display text-[32px]"
									style={{ letterSpacing: "-0.02em" }}
								>
									{tier.name}
								</div>
								<div className="flex min-h-[60px] items-baseline gap-1.5">
									{isCustom ? (
										<span
											className={`hz-display text-4xl ${isAgency ? "hz-violet-text" : "hz-gold-text"}`}
											style={{ letterSpacing: "-0.02em" }}
										>
											{price}
										</span>
									) : (
										<>
											<span
												className="text-sm"
												style={{ color: "var(--hz-ink-mute)" }}
											>
												RM
											</span>
											<span
												className={`hz-display text-5xl ${isAgency ? "hz-violet-text" : "hz-gold-text"}`}
												style={{ letterSpacing: "-0.03em" }}
											>
												{price}
											</span>
											<span
												className="text-[13px]"
												style={{ color: "var(--hz-ink-mute)" }}
											>
												{tier.period}
											</span>
										</>
									)}
								</div>
								<div
									className="text-[13px]"
									style={{ color: "var(--hz-ink-dim)" }}
								>
									{tier.detail}
								</div>
								<a
									href="#cta"
									className={`hz-btn ${isPopular ? "hz-btn-gold" : "hz-btn-ghost"} mt-2 justify-center`}
								>
									{isCustom ? t.pricing.talkToUs : t.pricing.bookDemo}{" "}
									<span className="hz-arrow">→</span>
								</a>
							</div>
						);
					})}
				</div>

				<div
					className="hz-mono mt-8 text-center text-xs uppercase tracking-[0.16em]"
					style={{ color: "var(--hz-ink-mute)" }}
				>
					{isAgency ? t.pricing.agencyFootnote : t.pricing.outletFootnote}
				</div>
			</div>
		</section>
	);
}

export function HandoffFinalCTA() {
	const { t } = useLandingLocale();

	return (
		<section id="cta" className="hz-section">
			<div className="hz-wrap">
				<div
					className="hz-glass relative overflow-hidden rounded-[36px] border px-14 py-[72px] text-center"
					style={{
						borderColor: "rgba(242,198,107,.28)",
						background:
							"linear-gradient(135deg, rgba(242,198,107,.10), rgba(182,124,255,.08), rgba(255,255,255,.02))",
					}}
				>
					<div
						className="pointer-events-none absolute rounded-full"
						style={{
							top: -100,
							right: -100,
							width: 400,
							height: 400,
							background:
								"radial-gradient(circle, rgba(242,198,107,.4), transparent 60%)",
							filter: "blur(60px)",
						}}
					/>
					<div
						className="pointer-events-none absolute rounded-full"
						style={{
							bottom: -100,
							left: -100,
							width: 400,
							height: 400,
							background:
								"radial-gradient(circle, rgba(182,124,255,.4), transparent 60%)",
							filter: "blur(60px)",
						}}
					/>
					<div className="relative">
						<span className="hz-eyebrow hz-eyebrow--center justify-center">
							{t.cta.eyebrow}
						</span>
						<h2
							className="hz-display mx-auto mt-5 max-w-[900px]"
							style={{ fontSize: "clamp(42px, 6vw, 84px)" }}
						>
							<SplitTitle
								prefix={t.cta.titlePrefix}
								highlight={t.cta.titleHighlight}
							/>
						</h2>
						<p
							className="mx-auto mt-5 mb-10 max-w-[640px] text-lg"
							style={{ color: "var(--hz-ink-dim)" }}
						>
							{t.cta.sub}
						</p>
						<div className="flex flex-wrap justify-center gap-3.5">
							<a href="/login" className="hz-btn hz-btn-gold">
								{t.cta.login} <span className="hz-arrow">→</span>
							</a>
							<a href="#pricing" className="hz-btn hz-btn-ghost">
								{t.cta.seePricing}
							</a>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

export function HandoffFooter() {
	const { t } = useLandingLocale();

	return (
		<footer
			className="relative mt-[60px] border-t pt-20 pb-10"
			style={{ borderColor: "var(--hz-line)" }}
		>
			<div className="hz-wrap">
				<div
					className="hz-foot-grid grid gap-10"
					style={{ gridTemplateColumns: "1.5fr 1fr 1fr 1fr" }}
				>
					<div>
						<div className="flex items-center gap-3.5">
							<LogoMark size={44} />
							<span
								className="hz-display text-[26px]"
								style={{ letterSpacing: "-0.02em" }}
							>
								InnocenZ
							</span>
						</div>
						<p
							className="mt-3.5 max-w-[340px] text-sm"
							style={{ color: "var(--hz-ink-dim)" }}
						>
							{t.footer.tagline}
						</p>
						<PoweredByBadge className="mt-5" />
					</div>
					{t.footer.columns.map((c) => (
						<div key={c.title}>
							<div
								className="hz-mono mb-4 text-[10px] uppercase tracking-[0.22em]"
								style={{ color: "var(--hz-gold)" }}
							>
								{c.title}
							</div>
							<div className="flex flex-col gap-2.5">
								{c.links.map((l) => (
									<a
										key={l}
										href="#top"
										className="text-[13.5px] no-underline"
										style={{ color: "var(--hz-ink-dim)" }}
									>
										{l}
									</a>
								))}
							</div>
						</div>
					))}
				</div>
				<div
					className="mt-[60px] flex flex-wrap items-center justify-between gap-3 border-t pt-6"
					style={{ borderColor: "var(--hz-line)" }}
				>
					<div
						className="hz-mono text-xs"
						style={{ color: "var(--hz-ink-mute)" }}
					>
						© {new Date().getFullYear()} InnocenZ · {t.footer.copyright}
					</div>
					<div
						className="flex gap-5 text-xs"
						style={{ color: "var(--hz-ink-mute)" }}
					>
						{t.footer.legal.map((l) => (
							<a
								key={l}
								href="#top"
								className="no-underline"
								style={{ color: "inherit" }}
							>
								{l}
							</a>
						))}
					</div>
				</div>
			</div>
		</footer>
	);
}
