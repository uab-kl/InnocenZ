import {
	Briefcase,
	Building2,
	ContactRound,
	Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LANDING_IMAGES } from "@/lib/landing-assets";
import { useLandingLocale } from "@/lib/landing-i18n";
import { SectionHead, SplitTitle } from "./primitives";

function tintStyle(color: "gold" | "violet") {
	const isGold = color === "gold";
	return {
		background: isGold
			? "linear-gradient(135deg, rgba(242,198,107,.22), rgba(242,198,107,.05))"
			: "linear-gradient(135deg, rgba(182,124,255,.22), rgba(182,124,255,.05))",
		border: `1px solid ${isGold ? "rgba(242,198,107,.3)" : "rgba(182,124,255,.3)"}`,
		color: isGold ? "var(--hz-gold)" : "var(--hz-violet)",
	};
}

export function HandoffChallenges() {
	const { t } = useLandingLocale();

	const groups: {
		role: string;
		icon: LucideIcon;
		color: "gold" | "violet";
		pains: string[];
	}[] = [
		{
			role: t.challenges.outletOwners,
			icon: Building2,
			color: "gold",
			pains: t.challenges.outletPains,
		},
		{
			role: t.challenges.prAgencies,
			icon: Briefcase,
			color: "violet",
			pains: t.challenges.agencyPains,
		},
		{
			role: t.challenges.prProfessionals,
			icon: ContactRound,
			color: "gold",
			pains: t.challenges.prPains,
		},
	];

	return (
		<section id="challenges" className="hz-section relative">
			<div
				className="pointer-events-none absolute inset-0 overflow-hidden"
				aria-hidden
			>
				<img
					src={LANDING_IMAGES.outletVenue}
					alt=""
					className="absolute"
					style={{
						top: "-6%",
						right: "-8%",
						width: "62%",
						opacity: 0.28,
						filter: "saturate(1.05)",
						maskImage:
							"radial-gradient(circle at 60% 40%, #000 0%, transparent 68%)",
						WebkitMaskImage:
							"radial-gradient(circle at 60% 40%, #000 0%, transparent 68%)",
					}}
				/>
			</div>
			<div className="hz-wrap relative z-[1]">
				<SectionHead
					eyebrow={t.challenges.eyebrow}
					title={
						<SplitTitle
							prefix={t.challenges.titlePrefix}
							highlight={t.challenges.titleHighlight}
						/>
					}
					sub={t.challenges.sub}
				/>
				<div className="grid gap-5 md:grid-cols-3">
					{groups.map((g) => {
						const Icon = g.icon;
						const tint = tintStyle(g.color);
						return (
							<div
								key={g.role}
								className="hz-glass flex flex-col gap-[18px] p-7"
							>
								<div className="flex items-center gap-3">
									<div
										className="grid h-11 w-11 place-items-center rounded-xl"
										style={tint}
									>
										<Icon size={22} />
									</div>
									<div>
										<div
											className="hz-mono hz-label uppercase tracking-[0.2em]"
											style={{ color: "var(--hz-ink-mute)" }}
										>
											{t.challenges.forLabel}
										</div>
										<div
											className="hz-display text-[22px]"
											style={{ letterSpacing: "-0.02em" }}
										>
											{g.role}
										</div>
									</div>
								</div>
								<div className="h-px" style={{ background: "var(--hz-line)" }} />
								<ul className="hz-pain-list m-0 flex list-none flex-col gap-2.5 p-0">
									{g.pains.map((p) => (
										<li
											key={p}
											className="flex items-start gap-2.5"
											style={{ color: "var(--hz-ink-dim)" }}
										>
											<span
												className="mt-1.5 shrink-0 rounded-full"
												style={{
													width: 5,
													height: 5,
													background:
														g.color === "gold"
															? "var(--hz-gold)"
															: "var(--hz-violet)",
													boxShadow: `0 0 8px ${g.color === "gold" ? "var(--hz-gold)" : "var(--hz-violet)"}`,
												}}
											/>
											{p}
										</li>
									))}
								</ul>
							</div>
						);
					})}
				</div>
			</div>
		</section>
	);
}

function FlowNode({
	x,
	y,
	image,
	imageAlt,
	imageFit = "cover",
	label,
	desc,
	idx,
	accent = "gold",
}: {
	x: string;
	y: string;
	image: string;
	imageAlt: string;
	imageFit?: "cover" | "contain";
	label: string;
	desc: string;
	idx: number;
	accent?: "gold" | "violet";
}) {
	const isGold = accent === "gold";
	const borderColor = isGold
		? "rgba(242,198,107,.35)"
		: "rgba(182,124,255,.35)";
	const glowColor = isGold
		? "rgba(242,198,107,.4)"
		: "rgba(182,124,255,.35)";

	return (
		<div
			className="absolute text-center"
			style={{
				left: x,
				top: y,
				transform: "translate(-50%, -50%)",
			}}
		>
			<div
				className="relative h-[120px] w-[120px] overflow-hidden rounded-full"
				style={{
					border: `1px solid ${borderColor}`,
					boxShadow: `0 20px 60px -20px ${glowColor}, inset 0 0 40px rgba(0,0,0,.35)`,
				}}
			>
				<img
					src={image}
					alt={imageAlt}
					className="absolute inset-0 h-full w-full"
					style={{
						objectFit: imageFit,
						objectPosition: "center top",
					}}
				/>
				<div
					className="pointer-events-none absolute inset-0 rounded-full"
					style={{
						background:
							"radial-gradient(circle at 50% 28%, rgba(255,255,255,.12), transparent 52%), radial-gradient(circle at 50% 100%, rgba(0,0,0,.55), transparent 58%)",
					}}
				/>
				<div
					className="pointer-events-none absolute rounded-full"
					style={{
						inset: -2,
						border: `1px solid ${isGold ? "rgba(182,124,255,.3)" : "rgba(242,198,107,.25)"}`,
						animation: `hz-pulse-ring 3s ease-out infinite ${idx * 0.6}s`,
					}}
				/>
			</div>
			<div
				className="hz-display mt-3.5 text-2xl"
				style={{ letterSpacing: "-0.02em" }}
			>
				{label}
			</div>
			<div
				className="hz-mono mx-auto mt-1 max-w-[180px] text-xs uppercase tracking-[0.14em]"
				style={{ color: "var(--hz-ink-mute)" }}
			>
				{desc}
			</div>
		</div>
	);
}

function FlowDiagram() {
	const { t } = useLandingLocale();

	const nodes = [
		{
			x: "8%",
			y: "42%",
			image: LANDING_IMAGES.flowOutletVenue,
			imageAlt: t.solution.outletAlt,
			imageFit: "cover" as const,
			label: t.solution.outletLabel,
			desc: t.solution.outletDesc,
			accent: "gold" as const,
		},
		{
			x: "50%",
			y: "42%",
			image: LANDING_IMAGES.flowAgencyPortrait,
			imageAlt: t.solution.agencyAlt,
			label: t.solution.agencyLabel,
			desc: t.solution.agencyDesc,
			accent: "violet" as const,
		},
		{
			x: "92%",
			y: "42%",
			image: LANDING_IMAGES.flowPrPortrait,
			imageAlt: t.solution.prAlt,
			label: t.solution.prLabel,
			desc: t.solution.prDesc,
			accent: "gold" as const,
		},
	] as const;

	return (
		<div
			className="relative mx-auto w-[96%] max-w-[1080px]"
			style={{ aspectRatio: "2.2 / 1" }}
		>
			<svg
				viewBox="0 0 1100 500"
				preserveAspectRatio="xMidYMid meet"
				className="absolute inset-0 h-full w-full"
				aria-hidden
			>
				<defs>
					<linearGradient id="rail" x1="0" x2="1">
						<stop offset="0%" stopColor="#f2c66b" stopOpacity="0" />
						<stop offset="12%" stopColor="#f2c66b" stopOpacity="0.6" />
						<stop offset="50%" stopColor="#b67cff" stopOpacity="0.8" />
						<stop offset="88%" stopColor="#f2c66b" stopOpacity="0.6" />
						<stop offset="100%" stopColor="#f2c66b" stopOpacity="0" />
					</linearGradient>
					<filter id="softblur">
						<feGaussianBlur stdDeviation="1.2" />
					</filter>
				</defs>
				<path
					d="M 170 250 C 350 120, 550 380, 750 250 S 1000 180, 1030 250"
					stroke="url(#rail)"
					strokeWidth="1.8"
					fill="none"
				/>
				<path
					d="M 170 250 C 350 120, 550 380, 750 250 S 1000 180, 1030 250"
					stroke="rgba(242,198,107,.18)"
					strokeWidth="0.5"
					fill="none"
					strokeDasharray="3 6"
				/>
				{Array.from({ length: 6 }).map((_, i) => (
					<circle key={i} r="4" fill="#f2c66b" filter="url(#softblur)">
						<animateMotion
							dur="4s"
							repeatCount="indefinite"
							begin={`${-i * 0.66}s`}
							path="M 170 250 C 350 120, 550 380, 750 250 S 1000 180, 1030 250"
						/>
						<animate
							attributeName="opacity"
							values="0;1;1;0"
							dur="4s"
							repeatCount="indefinite"
							begin={`${-i * 0.66}s`}
						/>
					</circle>
				))}
				{Array.from({ length: 6 }).map((_, i) => (
					<circle
						key={`v${i}`}
						r="2.5"
						fill="#b67cff"
						filter="url(#softblur)"
					>
						<animateMotion
							dur="4s"
							repeatCount="indefinite"
							begin={`${-i * 0.66 - 0.33}s`}
							path="M 170 250 C 350 120, 550 380, 750 250 S 1000 180, 1030 250"
						/>
						<animate
							attributeName="opacity"
							values="0;1;1;0"
							dur="4s"
							repeatCount="indefinite"
							begin={`${-i * 0.66 - 0.33}s`}
						/>
					</circle>
				))}
			</svg>
			{nodes.map((n, i) => (
				<FlowNode key={n.label} {...n} idx={i} />
			))}
			<div
				className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full border px-5 py-3 text-xs uppercase tracking-[0.14em] backdrop-blur-md"
				style={{
					borderColor: "var(--hz-line-strong)",
					background: "rgba(10,10,14,.72)",
					fontFamily: "var(--hz-font-mono)",
					color: "var(--hz-gold)",
				}}
			>
				<Sparkles size={14} className="shrink-0" />
				{t.solution.flowBadge}
			</div>
		</div>
	);
}

export function HandoffSolutionFlow() {
	const { t } = useLandingLocale();

	return (
		<section id="solution" className="hz-section">
			<div className="hz-wrap">
				<SectionHead
					eyebrow={t.solution.eyebrow}
					title={
						<SplitTitle
							prefix={t.solution.titlePrefix}
							highlight={t.solution.titleHighlight}
						/>
					}
					sub={t.solution.sub}
					center
				/>
				<FlowDiagram />
			</div>
		</section>
	);
}
