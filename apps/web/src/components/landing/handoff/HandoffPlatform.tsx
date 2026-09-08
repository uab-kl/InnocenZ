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

/** Module indices per phase: plan the night, run the floor, close the money. */
const PHASES = [
	[0, 1, 5, 4],
	[6, 10, 8, 7],
	[3, 2, 9, 11],
] as const;

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
				  Three phases, four modules each — the order a night actually runs in.
				  Indices into t.platform.modules are kept, so every module keeps the
				  icon and tint it has always had. Panels align to the top so a card
				  opening in one column does not stretch its neighbours.
				*/}
				<div className="hz-phases">
					{PHASES.map((idx, p) => {
						const phase = t.platform.phases[p];
						return (
							<div key={phase.label} className="hz-phase">
								{/* Same head as the Challenges cards: tint tile, 26px display title, hairline. */}
								<div className="flex items-center gap-3">
									<div
										className="grid h-14 w-14 shrink-0 place-items-center rounded-xl"
										style={moduleTint(p)}
									>
										<span className="hz-display text-[24px]">{p + 1}</span>
									</div>
									<div className="min-w-0">
										<div
											className="hz-display hz-gold-text text-[26px]"
											style={{ letterSpacing: "-0.02em" }}
										>
											{phase.label}
										</div>
										<div className="hz-phase__s">{phase.sub}</div>
									</div>
								</div>
								<div
									className="hz-phase__rule h-px"
									style={{ background: "var(--hz-line)" }}
								/>
								{idx.map((i) => {
									const m = t.platform.modules[i];
									const Icon = moduleIcons[i];
									return (
										<CollapsibleCard
											key={m.title}
											className="hz-collapse--row"
											title={m.title}
											titleClassName="hz-collapse__title--lg"
											head={
												<div
													className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
													style={moduleTint(i)}
												>
													<Icon size={24} />
												</div>
											}
										>
											{m.desc}
										</CollapsibleCard>
									);
								})}
							</div>
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
											className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
											style={{
												background:
													"linear-gradient(135deg, rgba(182,124,255,.22), transparent)",
												border: "1px solid rgba(182,124,255,.3)",
												color: "var(--hz-violet)",
											}}
										>
											<Icon size={24} />
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
