import {
	Brain,
	Globe,
	Lock,
	Quote,
	Shield,
	SignalHigh,
	Smartphone,
	TrendingUp,
	Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { LANDING_IMAGES } from "@/lib/landing-assets";
import { useLandingLocale } from "@/lib/landing-i18n";
import { SectionHead, SplitTitle, Tag } from "./primitives";

const logos: {
	name: string;
	italic?: boolean;
	mono?: boolean;
	mark: ReactNode;
}[] = [
	{
		name: "NOVA",
		mark: (
			<svg viewBox="0 0 40 40" className="h-full w-full">
				<circle
					cx="20"
					cy="20"
					r="14"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
				/>
				<path
					d="M12 26 L12 14 L18 26 L18 14 M22 14 L28 14 M25 14 L25 26 M22 26 L28 26"
					stroke="currentColor"
					strokeWidth="1.5"
					fill="none"
					strokeLinecap="round"
				/>
			</svg>
		),
	},
	{
		name: "MAISON",
		italic: true,
		mark: (
			<svg viewBox="0 0 40 40" className="h-full w-full">
				<path
					d="M8 30 L20 10 L32 30 M14 22 L26 22"
					stroke="currentColor"
					strokeWidth="1.5"
					fill="none"
					strokeLinecap="round"
				/>
			</svg>
		),
	},
	{
		name: "LUME",
		mark: (
			<svg viewBox="0 0 40 40" className="h-full w-full">
				<rect
					x="10"
					y="10"
					width="20"
					height="20"
					rx="10"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
				/>
				<circle cx="20" cy="20" r="4" fill="currentColor" />
			</svg>
		),
	},
	{
		name: "ATRIA",
		mono: true,
		mark: (
			<svg viewBox="0 0 40 40" className="h-full w-full">
				<path
					d="M8 30 L20 8 L32 30 Z"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinejoin="round"
				/>
				<circle cx="20" cy="22" r="2" fill="currentColor" />
			</svg>
		),
	},
	{
		name: "ORBIT",
		mark: (
			<svg viewBox="0 0 40 40" className="h-full w-full">
				<ellipse
					cx="20"
					cy="20"
					rx="14"
					ry="6"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.2"
					transform="rotate(-25 20 20)"
				/>
				<circle cx="20" cy="20" r="3.5" fill="currentColor" />
			</svg>
		),
	},
	{
		name: "HAUS",
		mark: (
			<svg viewBox="0 0 40 40" className="h-full w-full">
				<path
					d="M10 30 L10 18 L20 10 L30 18 L30 30 Z"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinejoin="round"
				/>
				<path
					d="M17 30 L17 22 L23 22 L23 30"
					stroke="currentColor"
					strokeWidth="1.3"
					fill="none"
				/>
			</svg>
		),
	},
	{
		name: "ECHO",
		italic: true,
		mark: (
			<svg viewBox="0 0 40 40" className="h-full w-full">
				<path
					d="M28 12 A10 10 0 1 0 28 28"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
				/>
				<path
					d="M24 15 A6 6 0 1 0 24 25"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.2"
					strokeLinecap="round"
				/>
			</svg>
		),
	},
	{
		name: "AXIS",
		mono: true,
		mark: (
			<svg viewBox="0 0 40 40" className="h-full w-full">
				<path
					d="M8 8 L32 32 M32 8 L8 32"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
				/>
				<circle
					cx="20"
					cy="20"
					r="5"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
				/>
			</svg>
		),
	},
	{
		name: "VELVET",
		italic: true,
		mark: (
			<svg viewBox="0 0 40 40" className="h-full w-full">
				<path
					d="M8 12 L20 30 L32 12"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<path
					d="M14 12 L20 22 L26 12"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.2"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		),
	},
];

function AgencyLogoWall() {
	const { t } = useLandingLocale();
	return (
		<div
			className="relative h-[260px] shrink-0 overflow-hidden border-b"
			style={{
				borderColor: "var(--hz-line)",
				background:
					"linear-gradient(135deg, rgba(182,124,255,.10), rgba(242,198,107,.06), transparent 70%)",
			}}
		>
			<div
				className="absolute rounded-full"
				style={{
					top: -40,
					right: -40,
					width: 220,
					height: 220,
					background:
						"radial-gradient(circle, rgba(182,124,255,.35), transparent 65%)",
				}}
			/>
			<div
				className="absolute rounded-full"
				style={{
					bottom: -60,
					left: -30,
					width: 200,
					height: 200,
					background:
						"radial-gradient(circle, rgba(242,198,107,.22), transparent 65%)",
				}}
			/>
			<div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-2.5 p-[18px]">
				{logos.map((L, i) => (
					<div
						key={L.name}
						className="flex items-center justify-center gap-2 rounded-xl border px-2.5 py-2"
						style={{
							background: "rgba(10,10,14,.72)",
							borderColor: "rgba(255,255,255,.06)",
							color:
								i % 3 === 0
									? "var(--hz-gold)"
									: i % 3 === 1
										? "var(--hz-violet)"
										: "rgba(246,239,225,.85)",
							animation: `hz-logo-float ${5 + (i % 3)}s ease-in-out infinite ${i * 0.35}s`,
						}}
					>
						<div className="h-[22px] w-[22px] shrink-0">{L.mark}</div>
						<div
							style={{
								fontFamily: L.italic
									? "var(--hz-font-display)"
									: L.mono
										? "var(--hz-font-mono)"
										: "var(--hz-font-sans)",
								fontStyle: L.italic ? "italic" : "normal",
								fontSize: L.mono ? 10 : 12,
								fontWeight: L.mono ? 500 : 600,
								letterSpacing: L.mono ? "0.18em" : "0.02em",
								textTransform: L.mono ? "uppercase" : "none",
								whiteSpace: "nowrap",
							}}
						>
							{L.name}
						</div>
					</div>
				))}
			</div>
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						"linear-gradient(180deg, transparent 55%, rgba(7,7,10,.95))",
				}}
			/>
			<div
				className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]"
				style={{
					background: "rgba(10,10,14,.88)",
					borderColor: "rgba(182,124,255,.28)",
					fontFamily: "var(--hz-font-mono)",
					color: "var(--hz-violet)",
				}}
			>
				<span
					className="rounded-full"
					style={{
						width: 5,
						height: 5,
						background: "var(--hz-violet)",
						boxShadow: "0 0 8px var(--hz-violet)",
					}}
				/>
				{t.benefits.connectedAgencies}
			</div>
		</div>
	);
}

export function HandoffBenefits() {
	const { t } = useLandingLocale();

	const benefitsCols = [
		{
			role: t.benefits.outletOwners,
			img: LANDING_IMAGES.outletVenue,
			imgPosition: "center",
			wins: t.benefits.outletWins,
		},
		{
			role: t.benefits.prAgencies,
			logos: true as const,
			wins: t.benefits.agencyWins,
		},
		{
			role: t.benefits.prProfessionals,
			img: LANDING_IMAGES.prGroup,
			imgPosition: "center 15%",
			wins: t.benefits.prWins,
		},
	];

	return (
		<section id="benefits" className="hz-section">
			<div className="hz-wrap">
				<SectionHead
					eyebrow={t.benefits.eyebrow}
					title={
						<SplitTitle
							highlight={t.benefits.titleHighlight}
							suffix={t.benefits.titleSuffix}
						/>
					}
					sub={t.benefits.sub}
				/>
				<div className="grid items-stretch gap-5 md:grid-cols-3">
					{benefitsCols.map((c) => (
						<div
							key={c.role}
							className="hz-glass flex h-full flex-col overflow-hidden p-0"
						>
							{"logos" in c && c.logos ? (
								<AgencyLogoWall />
							) : (
								<div className="relative h-[260px] shrink-0 overflow-hidden">
									<img
										src={"img" in c ? c.img : ""}
										alt=""
										loading="lazy"
										decoding="async"
										className="h-full w-full object-cover"
										style={{
											objectPosition:
												"imgPosition" in c ? c.imgPosition : "center",
										}}
									/>
									<div
										className="absolute inset-0"
										style={{
											background:
												"linear-gradient(180deg, transparent 55%, rgba(7,7,10,.95))",
										}}
									/>
								</div>
							)}
							<div className="flex flex-1 flex-col gap-4 px-[26px] pt-[22px] pb-7">
								<div
									className="hz-display text-2xl"
									style={{ letterSpacing: "-0.02em" }}
								>
									{c.role}
								</div>
								<div className="flex flex-col gap-3.5">
									{c.wins.map((w, i) => (
										<div
											key={w.label}
											className="flex items-baseline gap-3.5"
											style={{
												borderTop:
													i > 0 ? "1px solid var(--hz-line)" : undefined,
												paddingTop: i > 0 ? 14 : 0,
											}}
										>
											<div
												className="hz-display hz-gold-text min-w-20 text-[28px]"
												style={{ letterSpacing: "-0.02em" }}
											>
												{w.kpi}
											</div>
											<div
												className="flex-1 text-[13px]"
												style={{ color: "var(--hz-ink-dim)" }}
											>
												{w.label}
											</div>
										</div>
									))}
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

const advantageIcons = [Globe, SignalHigh, Wallet, Brain, Lock, Smartphone, TrendingUp, Shield];

export function HandoffWhyInnocenz() {
	const { t } = useLandingLocale();

	return (
		<section id="why" className="hz-section">
			<div className="hz-wrap">
				<SectionHead
					eyebrow={t.why.eyebrow}
					title={
						<SplitTitle
							prefix={t.why.titlePrefix}
							highlight={t.why.titleHighlight}
						/>
					}
					sub={t.why.sub}
				/>
				<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
					{t.why.advantages.map((a, i) => {
						const Icon = advantageIcons[i];
						const violet = i % 2 === 1;
						return (
							<div
								key={a.title}
								className="hz-glass flex min-h-[180px] flex-col gap-3 p-6"
							>
								<div className="flex items-center gap-3">
									<div
										className="grid h-9 w-9 place-items-center rounded-[10px]"
										style={{
											background: violet
												? "linear-gradient(135deg, rgba(182,124,255,.22), transparent)"
												: "linear-gradient(135deg, rgba(242,198,107,.22), transparent)",
											border: `1px solid ${violet ? "rgba(182,124,255,.32)" : "rgba(242,198,107,.32)"}`,
											color: violet ? "var(--hz-violet)" : "var(--hz-gold)",
										}}
									>
										<Icon size={16} />
									</div>
									<div
										className="hz-mono text-[11px] uppercase tracking-[0.18em]"
										style={{ color: "var(--hz-ink-mute)" }}
									>
										0{i + 1}
									</div>
								</div>
								<div
									className="hz-display text-lg"
									style={{ letterSpacing: "-0.02em" }}
								>
									{a.title}
								</div>
								<div className="text-[13px]" style={{ color: "var(--hz-ink-dim)" }}>
									{a.desc}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</section>
	);
}

export function HandoffTestimonials() {
	const { t } = useLandingLocale();
	const roleColors = ["gold", "violet", "gold"] as const;

	return (
		<section id="testimonials" className="hz-section">
			<div className="hz-wrap">
				<SectionHead
					eyebrow={t.testimonials.eyebrow}
					title={
						<SplitTitle
							prefix={t.testimonials.titlePrefix}
							highlight={t.testimonials.titleHighlight}
						/>
					}
					center
				/>
				<div className="grid gap-5 md:grid-cols-3">
					{t.testimonials.quotes.map((q, i) => (
						<div
							key={q.n}
							className="hz-glass flex flex-col gap-5 p-8"
						>
							<Quote size={28} className="hz-gold-text" />
							<div
								className="hz-display text-xl leading-snug"
								style={{ letterSpacing: "-0.015em" }}
							>
								&ldquo;{q.q}&rdquo;
							</div>
							<div
								className="mt-auto flex items-center justify-between border-t pt-4"
								style={{ borderColor: "var(--hz-line)" }}
							>
								<div>
									<div className="text-sm font-semibold">{q.n}</div>
									<div className="text-xs" style={{ color: "var(--hz-ink-mute)" }}>
										{q.t}
									</div>
								</div>
								<Tag color={roleColors[i] === "violet" ? "violet" : "gold"}>
									{q.role}
								</Tag>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
