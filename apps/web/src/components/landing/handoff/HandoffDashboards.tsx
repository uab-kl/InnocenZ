import { Briefcase, Check, MapPin, ScanLine, SignalHigh } from "lucide-react";
import { useLandingLocale } from "@/lib/landing-i18n";
import { SectionHead, SplitTitle, useTick } from "./primitives";

function Spark({
	data,
	color = "#f2c66b",
	height = 40,
}: {
	data: number[];
	color?: string;
	height?: number;
}) {
	const w = 120;
	const h = height;
	const max = Math.max(...data);
	const min = Math.min(...data);
	const pts = data.map((v, i) => [
		i * (w / (data.length - 1)),
		h - ((v - min) / (max - min || 1)) * (h - 6) - 3,
	]);
	const d = `M ${pts.map((p) => p.join(",")).join(" L ")}`;
	const area = `${d} L ${w},${h} L 0,${h} Z`;
	const gradId = `sp-${color.replace("#", "")}`;

	return (
		<svg
			width="100%"
			viewBox={`0 0 ${w} ${h}`}
			preserveAspectRatio="none"
			className="block"
			aria-hidden="true"
			focusable="false"
		>
			<defs>
				<linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor={color} stopOpacity="0.4" />
					<stop offset="100%" stopColor={color} stopOpacity="0" />
				</linearGradient>
			</defs>
			<path d={area} fill={`url(#${gradId})`} />
			<path
				d={d}
				stroke={color}
				strokeWidth="1.5"
				fill="none"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function Kpi({
	label,
	val,
	tone,
}: {
	label: string;
	val: React.ReactNode;
	tone: "gold" | "violet";
}) {
	const color = tone === "violet" ? "var(--hz-violet)" : "var(--hz-gold)";
	return (
		<div
			className="rounded-xl border px-3.5 py-3"
			style={{
				background: "rgba(255,255,255,.02)",
				borderColor: "rgba(255,255,255,.05)",
			}}
		>
			<div
				className="hz-mono text-[9px] uppercase tracking-[0.18em]"
				style={{ color: "var(--hz-ink-mute)" }}
			>
				{label}
			</div>
			<div
				className="hz-display mt-0.5 text-[22px]"
				style={{ color, letterSpacing: "-0.02em" }}
			>
				{val}
			</div>
		</div>
	);
}

function StatusPill({ s }: { s: "live" | "route" | "idle" }) {
	const { t } = useLandingLocale();
	const map = {
		live: { c: "#4ade80", l: t.dashboards.statusLive },
		route: { c: "#f2c66b", l: t.dashboards.statusRoute },
		idle: { c: "#6b6558", l: t.dashboards.statusIdle },
	};
	const { c, l } = map[s];
	return (
		<div
			className="hz-mono flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] uppercase tracking-wider"
			style={{
				background: `${c}12`,
				border: `1px solid ${c}33`,
				color: c,
			}}
		>
			<span
				className="rounded-full"
				style={{
					width: 5,
					height: 5,
					background: c,
					boxShadow: s !== "idle" ? `0 0 6px ${c}` : undefined,
				}}
			/>
			{l}
		</div>
	);
}

function OutletDashboard() {
	const { t } = useLandingLocale();
	const tick = useTick(2200);
	const sales = 18420 + ((tick * 137) % 2400);
	const variance = (tick % 7) - 3 + 6.2;
	const roster = [
		{ n: "Aisha L.", v: "Skybar KL", s: "live" as const, code: "AL" },
		{ n: "Marcus R.", v: "Zouk", s: "live" as const, code: "MR" },
		{ n: "Jia T.", v: "Marini's", s: "route" as const, code: "JT" },
		{ n: "Danish K.", v: "Skybar KL", s: "idle" as const, code: "DK" },
	];

	return (
		<div className="hz-glass flex h-full min-h-[520px] flex-col gap-4 p-[22px]">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2.5">
					<span
						className="rounded-full"
						style={{
							width: 6,
							height: 6,
							background: "#4ade80",
							boxShadow: "0 0 10px #4ade80",
							animation: "hz-pulse-dot 1.6s ease-in-out infinite",
						}}
					/>
					<div
						className="hz-mono text-[10px] uppercase tracking-[0.18em]"
						style={{ color: "var(--hz-ink-dim)" }}
					>
						{t.dashboards.liveFloor}
					</div>
				</div>
				<div
					className="hz-mono text-[10px]"
					style={{ color: "var(--hz-ink-mute)" }}
				>
					{t.dashboards.outlet}
				</div>
			</div>
			<div className="grid grid-cols-2 gap-2.5">
				<Kpi label={t.dashboards.onShift} val="34/38" tone="gold" />
				<Kpi
					label={t.dashboards.netSales}
					val={`RM ${(sales / 1000).toFixed(1)}k`}
					tone="gold"
				/>
				<Kpi
					label={t.dashboards.variance}
					val={`+${variance.toFixed(1)}%`}
					tone="violet"
				/>
				<Kpi label={t.dashboards.checkedIn} val="31·GPS" tone="violet" />
			</div>
			<div className="h-px" style={{ background: "var(--hz-line)" }} />
			<div>
				<div
					className="hz-mono mb-2.5 text-[10px] uppercase tracking-[0.18em]"
					style={{ color: "var(--hz-ink-mute)" }}
				>
					{t.dashboards.tonightsRoster}
				</div>
				<div className="flex flex-col gap-2">
					{roster.map((r) => (
						<div
							key={r.n}
							className="flex items-center gap-2.5 rounded-[10px] border px-2.5 py-2"
							style={{
								background: "rgba(255,255,255,.02)",
								borderColor: "rgba(255,255,255,.04)",
							}}
						>
							<div
								className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
								style={{
									background: "linear-gradient(135deg,#3a2a0e,#8a5a1e)",
								}}
							>
								{r.code}
							</div>
							<div className="min-w-0 flex-1">
								<div className="truncate text-[13px] font-medium">{r.n}</div>
								<div
									className="text-[11px]"
									style={{ color: "var(--hz-ink-mute)" }}
								>
									{r.v}
								</div>
							</div>
							<StatusPill s={r.s} />
						</div>
					))}
				</div>
			</div>
			<div>
				<div
					className="hz-mono mb-1.5 text-[10px] uppercase tracking-[0.18em]"
					style={{ color: "var(--hz-ink-mute)" }}
				>
					{t.dashboards.netSales4h}
				</div>
				<Spark
					data={[
						12,
						18,
						14,
						20,
						26,
						24,
						32,
						28,
						38,
						34,
						42,
						40 + ((tick * 3) % 10),
					]}
					color="#f2c66b"
					height={44}
				/>
			</div>
		</div>
	);
}

function AgencyDashboard() {
	const { t } = useLandingLocale();
	const tick = useTick(1900);
	const pending = 12 - (tick % 3);
	const bars = [64, 48, 82, 55, 71, 90 - (tick % 12), 68];
	const days = t.dashboards.days;
	const chartHeight = 200;

	return (
		<div className="hz-glass flex h-full min-h-[520px] flex-col gap-4 p-[22px]">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2.5">
					<Briefcase size={14} className="hz-violet-text" />
					<div
						className="hz-mono text-[10px] uppercase tracking-[0.18em]"
						style={{ color: "var(--hz-ink-dim)" }}
					>
						{t.dashboards.cycleSettles}
					</div>
				</div>
				<div
					className="hz-mono text-[10px]"
					style={{ color: "var(--hz-ink-mute)" }}
				>
					{t.dashboards.agency}
				</div>
			</div>
			<div className="grid grid-cols-2 gap-2.5">
				<Kpi label={t.dashboards.prsBooked} val="248" tone="violet" />
				<Kpi label={t.dashboards.pendingPvs} val={pending} tone="gold" />
				<Kpi label={t.dashboards.utilisation} val="87%" tone="violet" />
				<Kpi label={t.dashboards.payout} val="RM 84.2k" tone="gold" />
			</div>
			<div className="h-px" style={{ background: "var(--hz-line)" }} />
			<div className="flex flex-col">
				<div
					className="hz-mono mb-2.5 text-[10px] uppercase tracking-[0.18em]"
					style={{ color: "var(--hz-ink-mute)" }}
				>
					{t.dashboards.bookingsByOutlet}
				</div>
				<div className="flex items-end gap-2" style={{ height: chartHeight }}>
					{bars.map((b, i) => (
						<div
							key={days[i]}
							className="flex h-full flex-1 flex-col justify-end"
						>
							<div
								className="w-full rounded-t-sm transition-[height] duration-[800ms] ease-[cubic-bezier(.2,.7,.2,1)]"
								style={{
									height: Math.round((b / 100) * chartHeight),
									minHeight: 12,
									background: "linear-gradient(180deg, #b67cff, #7a3dff)",
									boxShadow: "0 0 12px rgba(182,124,255,.4)",
								}}
							/>
						</div>
					))}
				</div>
				<div
					className="mt-1.5 flex justify-between text-[10px]"
					style={{
						color: "var(--hz-ink-mute)",
						fontFamily: "var(--hz-font-mono)",
					}}
				>
					{days.map((d) => (
						<span key={d} className="flex-1 text-center">
							{d}
						</span>
					))}
				</div>
			</div>
			<div
				className="flex items-center gap-2 rounded-[10px] border px-3 py-2.5"
				style={{
					background: "rgba(74,222,128,.06)",
					borderColor: "rgba(74,222,128,.2)",
				}}
			>
				<Check size={14} style={{ color: "#4ade80" }} strokeWidth={2} />
				<div className="text-xs" style={{ color: "#a5e8bd" }}>
					{t.dashboards.pvsSigned}
				</div>
			</div>
		</div>
	);
}

function PRMobile() {
	const { t } = useLandingLocale();
	const tick = useTick(2400);
	return (
		<div
			className="hz-phone-frame relative mx-auto flex h-fit w-full max-w-[280px] flex-col gap-2 overflow-hidden rounded-[32px] border p-2.5"
			style={{
				background: "linear-gradient(180deg,#0a0a10,#141018)",
				borderColor: "var(--hz-line-strong)",
				boxShadow:
					"0 32px 64px -24px rgba(0,0,0,.9), 0 0 0 5px rgba(255,255,255,.02)",
			}}
		>
			<div
				className="absolute left-1/2 top-2.5 z-[2] h-[18px] w-[76px] -translate-x-1/2 rounded-full bg-black"
				aria-hidden
			/>
			<div
				className="flex shrink-0 items-center justify-between px-1.5 pt-3 text-[10px]"
				style={{ fontFamily: "var(--hz-font-mono)" }}
			>
				<span>21:16</span>
				<span className="flex items-center gap-1">
					<SignalHigh size={11} /> 5G
				</span>
			</div>
			<div className="flex flex-col gap-2 px-0.5">
				<div className="shrink-0">
					<div
						className="hz-mono text-[8px] uppercase tracking-[0.16em]"
						style={{ color: "var(--hz-ink-mute)" }}
					>
						{t.dashboards.tonight}
					</div>
					<div className="hz-display mt-0.5 text-[18px] leading-tight">
						Skybar KL · T1
					</div>
					<div
						className="text-[10px] leading-snug"
						style={{ color: "var(--hz-ink-dim)" }}
					>
						21:00 — 03:00 · Hennessy Launch
					</div>
				</div>
				<div className="hz-glass shrink-0 rounded-xl p-2.5">
					<div className="mb-1 flex items-center justify-between">
						<div
							className="hz-mono text-[8px] uppercase tracking-[0.16em]"
							style={{ color: "var(--hz-ink-mute)" }}
						>
							{t.dashboards.liveEarnings}
						</div>
						<span
							className="rounded-full"
							style={{
								width: 4,
								height: 4,
								background: "#4ade80",
								boxShadow: "0 0 6px #4ade80",
							}}
						/>
					</div>
					<div className="hz-display hz-gold-text text-[26px] leading-none">
						RM {(340 + ((tick * 7) % 180)).toFixed(0)}
					</div>
					<div
						className="hz-mono mt-1 text-[9px]"
						style={{ color: "var(--hz-ink-mute)" }}
					>
						{t.dashboards.earningsBreakdown}
					</div>
					<div className="mt-1.5">
						<Spark
							data={[10, 14, 12, 18, 22, 20, 26, 28 + ((tick * 2) % 6)]}
							color="#f2c66b"
							height={22}
						/>
					</div>
				</div>
				<div className="grid shrink-0 grid-cols-2 gap-1.5">
					<div className="hz-glass flex flex-col gap-0.5 rounded-lg p-2">
						<MapPin size={12} className="hz-gold-text" />
						<div className="text-[9px]" style={{ color: "var(--hz-ink-mute)" }}>
							{t.dashboards.gpsCheckIn}
						</div>
						<div className="text-[10px] font-semibold leading-tight">
							{t.dashboards.verified}
						</div>
					</div>
					<div className="hz-glass flex flex-col gap-0.5 rounded-lg p-2">
						<ScanLine size={12} className="hz-violet-text" />
						<div className="text-[9px]" style={{ color: "var(--hz-ink-mute)" }}>
							{t.dashboards.receipts}
						</div>
						<div className="text-[10px] font-semibold leading-tight">
							{7 + (tick % 3)} {t.dashboards.scanned}
						</div>
					</div>
				</div>
				<button
					type="button"
					className="w-full shrink-0 rounded-xl border-none px-2.5 py-2.5 text-[11px] font-semibold leading-tight"
					style={{
						background: "linear-gradient(180deg,#fbe1a4,#f2c66b 50%,#c9962e)",
						color: "#1a1207",
						boxShadow: "0 8px 24px -10px rgba(242,198,107,.6)",
					}}
				>
					{t.dashboards.signVoucher}
				</button>
			</div>
		</div>
	);
}

export function HandoffDashboards() {
	const { t } = useLandingLocale();

	return (
		<section id="dashboards" className="hz-section">
			<div className="hz-wrap">
				<SectionHead
					eyebrow={t.dashboards.eyebrow}
					title={
						<SplitTitle
							prefix={t.dashboards.titlePrefix}
							highlight={t.dashboards.titleHighlight}
						/>
					}
					sub={t.dashboards.sub}
				/>
				<div className="hz-dash-grid">
					<div className="min-h-[520px]">
						<OutletDashboard />
					</div>
					<div className="min-h-[520px]">
						<AgencyDashboard />
					</div>
					<div className="flex items-start justify-center">
						<PRMobile />
					</div>
				</div>
			</div>
		</section>
	);
}
