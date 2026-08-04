import { Play, Sparkles } from "lucide-react";
import { LANDING_IMAGES } from "@/lib/landing-assets";
import { useLandingLocale } from "@/lib/landing-i18n";
import { CountUp } from "./primitives";

const brands = [
	"Skybar KL",
	"Zouk",
	"Marini's",
	"Zion Club",
	"Havana",
	"Cielo",
	"The Roof",
	"Mansion",
	"Neon Room",
	"Element X",
];

function TrustedBy() {
	return (
		<div className="hz-ticker-wrap">
			<div className="hz-ticker-track">
				{[...brands, ...brands, ...brands].map((b, i) => (
					<div
						key={`${b}-${i}`}
						className="flex items-center gap-2.5"
						style={{
							fontFamily: "var(--hz-font-display)",
							fontSize: 22,
							letterSpacing: "0.02em",
							color: "rgba(246,239,225,0.42)",
							fontStyle: "italic",
						}}
					>
						<span
							style={{
								width: 6,
								height: 6,
								borderRadius: 999,
								background: "var(--hz-gold)",
								opacity: 0.4,
							}}
						/>
						{b}
					</div>
				))}
			</div>
		</div>
	);
}

// Triangle vertices sit on the orange orbit ring behind each role hexagon
const BADGE_ORBIT = { cx: 200, cy: 200, r: 125 } as const;

function orbitRolePoint(clockHour: number) {
	const rad = ((clockHour - 12) * 30 * Math.PI) / 180;
	return {
		x: +(BADGE_ORBIT.cx + BADGE_ORBIT.r * Math.sin(rad)).toFixed(1),
		y: +(BADGE_ORBIT.cy - BADGE_ORBIT.r * Math.cos(rad)).toFixed(1),
	};
}

const ROLE_TRIANGLE = (() => {
	const agency = orbitRolePoint(10);
	const outlet = orbitRolePoint(2);
	const personnel = orbitRolePoint(6);
	return `${agency.x},${agency.y} ${outlet.x},${outlet.y} ${personnel.x},${personnel.y}`;
})();

function OrbitBadge() {
	const { t } = useLandingLocale();

	return (
		<div
			className="relative mx-auto aspect-square w-full max-w-[560px]"
			style={{ width: "min(560px, 88vw)" }}
		>
			<div
				className="absolute"
				style={{
					inset: "-8%",
					background:
						"radial-gradient(circle, rgba(242,198,107,.28) 0%, transparent 55%)",
				}}
			/>
			<img
				src={LANDING_IMAGES.heroBadge}
				alt={t.hero.badgeAlt}
				width={1024}
				height={1024}
				fetchPriority="high"
				decoding="async"
				className="absolute inset-0 z-[1] h-full w-full rounded-full object-contain"
			/>
			<svg
				viewBox="0 0 400 400"
				className="pointer-events-none absolute inset-0 z-[2] h-full w-full"
				aria-hidden
			>
				<defs>
					<mask id="hz-tri-mask">
						<rect width="400" height="400" fill="white" />
						<circle cx="200" cy="200" r="70" fill="black" />
					</mask>
					<linearGradient id="hz-tri-grad" x1="0%" y1="0%" x2="100%" y2="100%">
						<stop offset="0%" stopColor="#f2c66b" stopOpacity="0.75" />
						<stop offset="50%" stopColor="#b67cff" stopOpacity="0.6" />
						<stop offset="100%" stopColor="#f2c66b" stopOpacity="0.75" />
					</linearGradient>
				</defs>
				<polygon
					points={ROLE_TRIANGLE}
					fill="none"
					stroke="url(#hz-tri-grad)"
					strokeWidth="2"
					strokeLinejoin="round"
					strokeDasharray="7 9"
					mask="url(#hz-tri-mask)"
					className="hz-tri-link"
				/>
			</svg>
			<svg
				viewBox="0 0 400 400"
				className="pointer-events-none absolute inset-0 z-[3] h-full w-full"
				style={{ animation: "hz-orbit 30s linear infinite" }}
				aria-hidden
			>
				<defs>
					<linearGradient id="ring1" x1="0" x2="1">
						<stop offset="0%" stopColor="#f2c66b" stopOpacity="0" />
						<stop offset="50%" stopColor="#f2c66b" stopOpacity="1" />
						<stop offset="100%" stopColor="#f2c66b" stopOpacity="0" />
					</linearGradient>
				</defs>
				<circle
					cx="200"
					cy="200"
					r="198"
					fill="none"
					stroke="url(#ring1)"
					strokeWidth="1"
				/>
				<circle cx="200" cy="2" r="3" fill="#f2c66b" />
			</svg>
			<svg
				viewBox="0 0 400 400"
				className="pointer-events-none absolute inset-0 z-[3] h-full w-full"
				style={{ animation: "hz-orbit-rev 40s linear infinite" }}
				aria-hidden
			>
				<circle
					cx="200"
					cy="200"
					r="192"
					fill="none"
					stroke="rgba(182,124,255,.35)"
					strokeWidth="0.8"
					strokeDasharray="2 6"
				/>
				<circle cx="200" cy="8" r="2" fill="#b67cff" />
			</svg>
			<div
				className="hz-orbit-pill absolute z-[4] flex items-center rounded-full border uppercase"
				style={{
					top: "50%",
					left: "20%",
					transform: "translate(-100%, -50%)",
					borderColor: "var(--hz-line-strong)",
					background: "rgba(10,10,14,.85)",
					fontFamily: "var(--hz-font-mono)",
				}}
			>
				<span
					className="hz-orbit-pill__dot rounded-full"
					style={{
						background: "#4ade80",
						boxShadow: "0 0 8px #4ade80",
					}}
				/>
				{t.hero.liveOnShift}
			</div>
			<div
				className="hz-orbit-pill absolute z-[4] flex items-center rounded-full border uppercase"
				style={{
					left: "79%",
					top: "84%",
					transform: "translate(0%, 10%)",
					borderColor: "var(--hz-line-strong)",
					background: "rgba(10,10,14,.85)",
					fontFamily: "var(--hz-font-mono)",
					color: "var(--hz-gold)",
				}}
			>
				<Sparkles className="hz-orbit-pill__icon" strokeWidth={2} />{" "}
				{t.hero.aiMatched}
			</div>
		</div>
	);
}

function Stat({ kpi, label }: { kpi: React.ReactNode; label: string }) {
	return (
		<div style={{ minWidth: 150 }}>
			<div className="hz-display hz-gold-text hz-stat-kpi">{kpi}</div>
			<div className="hz-stat-label">{label}</div>
		</div>
	);
}

export function HandoffHero() {
	const { t } = useLandingLocale();

	return (
		<section id="top" className="hz-hero hz-section">
			<div className="hz-wrap hz-hero-grid">
				<div>
					<span className="hz-eyebrow">{t.hero.eyebrow}</span>
					<h1 className="hz-display hz-hero-h1">
						{t.hero.titleLine1}
						<br />
						<em className="hz-gold-text not-italic" style={{ fontStyle: "italic" }}>
							{t.hero.titleLine2}
						</em>
					</h1>
					<p className="hz-hero-sub">{t.hero.subtitle}</p>
					<div className="flex flex-wrap gap-3.5">
						<a href="/login" className="hz-btn hz-btn-gold">
							{t.nav.login} <span className="hz-arrow">→</span>
						</a>
						<a href="#dashboards" className="hz-btn hz-btn-ghost">
							<Play size={14} /> {t.hero.watchPlatform}
						</a>
					</div>
					<div className="mt-14 flex flex-wrap gap-8">
						<Stat
							kpi={
								<>
									<CountUp to={80} suffix="%" />
								</>
							}
							label={t.hero.stat1}
						/>
						<Stat
							kpi={
								<>
									<CountUp to={100} suffix="%" />
								</>
							}
							label={t.hero.stat2}
						/>
						<Stat
							kpi={
								<>
									<CountUp to={0} />
								</>
							}
							label={t.hero.stat3}
						/>
					</div>
				</div>
				<div>
					<OrbitBadge />
				</div>
			</div>

			<div className="hz-wrap" style={{ marginTop: 100 }}>
				<div
					className="mb-[18px] flex items-center gap-[18px] text-[11px] uppercase tracking-[0.22em]"
					style={{
						fontFamily: "var(--hz-font-mono)",
						color: "var(--hz-ink-mute)",
					}}
				>
					<span className="shrink-0">{t.hero.trustedBy}</span>
					<span
						className="h-px flex-1"
						style={{ background: "var(--hz-line)" }}
					/>
				</div>
				<TrustedBy />
			</div>
		</section>
	);
}
