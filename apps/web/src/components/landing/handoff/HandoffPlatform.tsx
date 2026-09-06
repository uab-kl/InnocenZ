import type { LucideIcon } from "lucide-react";
import {
	BarChart3,
	Brain,
	Briefcase,
	Calendar,
	Lock,
	ScanLine,
	Shield,
	Smartphone,
	Sparkles,
	Star,
	TrendingUp,
	Users,
	Wallet,
} from "lucide-react";
import { LANDING_IMAGES } from "@/lib/landing-assets";
import { useLandingLocale } from "@/lib/landing-i18n";
import { CollapsibleCard, SectionHead, SplitTitle } from "./primitives";

const moduleIcons: LucideIcon[] = [
	Calendar,
	Brain,
	Wallet,
	TrendingUp,
	BarChart3,
	Briefcase,
	Smartphone,
	Sparkles,
	Users,
	Lock,
	ScanLine,
	Shield,
];

const aiIcons: LucideIcon[] = [
	TrendingUp,
	Brain,
	BarChart3,
	Calendar,
	Star,
	Shield,
	Sparkles,
];

function moduleTint(i: number) {
	const violet = i % 2 === 1;
	return {
		background: violet
			? "linear-gradient(135deg, rgba(182,124,255,.2), transparent)"
			: "linear-gradient(135deg, rgba(242,198,107,.2), transparent)",
		border: `1px solid ${violet ? "rgba(182,124,255,.28)" : "rgba(242,198,107,.28)"}`,
		color: violet ? "var(--hz-violet)" : "var(--hz-gold)",
	};
}

export function HandoffPlatformModules() {
	const { t } = useLandingLocale();

	return (
		<section id="platform" className="hz-section">
			<div className="hz-wrap">
				<SectionHead
					eyebrow={t.platform.eyebrow}
					title={
						<SplitTitle
							prefix={t.platform.titlePrefix}
							highlight={t.platform.titleHighlight}
						/>
					}
					sub={t.platform.sub}
				/>
				{/*
				  `items-start` matters here: the cards open one at a time, and a
				  stretched grid row would grow every sibling to match whichever
				  card the reader expanded.
				*/}
				<div className="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-4">
					{t.platform.modules.map((m, i) => {
						const Icon = moduleIcons[i];
						return (
							<CollapsibleCard
								key={m.title}
								title={m.title}
								titleClassName="hz-collapse__title--lg"
								head={
									<div
										className="grid h-11 w-11 shrink-0 place-items-center rounded-[11px]"
										style={moduleTint(i)}
									>
										<Icon size={23} />
									</div>
								}
							>
								{m.desc}
							</CollapsibleCard>
						);
					})}
				</div>
			</div>
		</section>
	);
}

export function HandoffAIFeatures() {
	const { t } = useLandingLocale();

	return (
		<section
			id="ai"
			className="hz-section hz-ai-section relative"
			style={{
				backgroundImage: `linear-gradient(180deg, transparent, rgba(182,124,255,.06) 30%, transparent), url('${LANDING_IMAGES.aiAbstract}')`,
				backgroundPosition: "center",
				backgroundSize: "cover",
				backgroundRepeat: "no-repeat",
			}}
		>
			<div
				className="absolute inset-0"
				style={{
					background:
						"linear-gradient(180deg, var(--hz-bg) 0%, rgba(7,7,10,.85) 20%, rgba(7,7,10,.85) 80%, var(--hz-bg) 100%)",
				}}
			/>
			<div className="hz-wrap relative">
				<div className="hz-ai-grid">
					<div>
						<span className="hz-eyebrow">{t.ai.eyebrow}</span>
						<h2
							className="hz-display mt-5 mb-6"
							style={{ fontSize: "clamp(38px, 5.6vw, 72px)" }}
						>
							<SplitTitle
								prefix={t.ai.titlePrefix}
								highlight={t.ai.titleHighlight}
								suffix={t.ai.titleSuffix}
								accent="violet"
							/>
						</h2>
						<p
							className="max-w-[520px] text-lg"
							style={{ color: "var(--hz-ink-dim)" }}
						>
							{t.ai.sub}
						</p>
						<div className="hz-glass mt-8 flex items-center gap-3.5 p-5">
							<div
								className="grid h-10 w-10 place-items-center rounded-[10px]"
								style={{
									background:
										"linear-gradient(135deg, rgba(182,124,255,.25), transparent)",
									border: "1px solid rgba(182,124,255,.35)",
									color: "var(--hz-violet)",
								}}
							>
								<Sparkles size={20} />
							</div>
							<div>
								<div
									className="hz-mono text-[10px] uppercase tracking-[0.18em]"
									style={{ color: "var(--hz-ink-mute)" }}
								>
									{t.ai.modelContext}
								</div>
								<div className="text-sm">{t.ai.modelContextDesc}</div>
							</div>
						</div>
					</div>
					<div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2">
						{t.ai.features.map((f, i) => {
							const Icon = aiIcons[i];
							return (
								<CollapsibleCard
									key={f.title}
									title={f.title}
									head={
										<div
											className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg"
											style={{
												background:
													"linear-gradient(135deg, rgba(182,124,255,.22), transparent)",
												border: "1px solid rgba(182,124,255,.3)",
												color: "var(--hz-violet)",
											}}
										>
											<Icon size={16} />
										</div>
									}
								>
									{f.desc}
								</CollapsibleCard>
							);
						})}
					</div>
				</div>
			</div>
		</section>
	);
}
