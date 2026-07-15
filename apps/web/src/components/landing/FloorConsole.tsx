import { motion, useReducedMotion } from "motion/react";

/**
 * Lead-with-the-product hero surface: a compact, inspectable view of a live
 * nightlife floor — tonight's shifts, check-in states, and running money.
 * Static demo data; dimensions are fixed so it never shifts on hover/resize.
 */

type ShiftStatus = "live" | "enroute" | "idle";

const shifts: {
	initials: string;
	name: string;
	venue: string;
	tier: string;
	status: ShiftStatus;
	at: string;
}[] = [
	{
		initials: "AL",
		name: "Aisha L.",
		venue: "Skybar KL",
		tier: "T1",
		status: "live",
		at: "21:04",
	},
	{
		initials: "MR",
		name: "Marcus R.",
		venue: "Zouk",
		tier: "T2",
		status: "live",
		at: "21:12",
	},
	{
		initials: "JT",
		name: "Jia T.",
		venue: "Marini's",
		tier: "T1",
		status: "enroute",
		at: "ETA 6m",
	},
	{
		initials: "DK",
		name: "Danish K.",
		venue: "Skybar KL",
		tier: "T3",
		status: "idle",
		at: "—",
	},
];

const statusMeta: Record<
	ShiftStatus,
	{ label: string; className: string; dot: string }
> = {
	live: {
		label: "Live",
		className: "bg-signal-live-soft text-signal-live",
		dot: "bg-signal-live",
	},
	enroute: {
		label: "En route",
		className: "bg-signal-warn-soft text-signal-warn",
		dot: "bg-signal-warn",
	},
	idle: {
		label: "Idle",
		className: "bg-foreground/8 text-foreground/50",
		dot: "bg-foreground/30",
	},
};

const kpis = [
	{ label: "On shift", value: "34", unit: "/ 38" },
	{ label: "Checked in", value: "31", unit: "GPS" },
	{ label: "Sales", value: "18.4", unit: "k RM" },
	{ label: "Variance", value: "+6.2", unit: "%", live: true },
];

export function FloorConsole({ variant = "default" }: { variant?: "default" | "hero" }) {
	const reduceMotion = useReducedMotion();
	const isHero = variant === "hero";

	return (
		<motion.div
			initial={
				reduceMotion ? { opacity: 0 } : { opacity: 0, y: 32, scale: 0.97 }
			}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
			className={`w-full rounded-[1.25rem] border border-console-line bg-console-bg shadow-2xl shadow-black/40 ${
				isHero ? "max-w-none hero-console-panel" : "max-w-lg"
			}`}
		>
			{/* Console header */}
			<div className={`flex items-center justify-between border-b border-console-line ${isHero ? "px-7 py-5" : "px-5 py-4"}`}>
				<div className="flex items-center gap-2.5">
					<span className="relative flex h-2.5 w-2.5">
						<span className="absolute inline-flex h-full w-full animate-glow-pulse rounded-full bg-signal-live" />
						<span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal-live" />
					</span>
					<span className={`font-semibold tracking-wide text-foreground ${isHero ? "text-[1.375rem]" : "text-sm"}`}>
						Live floor
					</span>
					<span className={`text-foreground/45 ${isHero ? "text-[1.125rem]" : "text-xs"}`}>· Fri, 21:16</span>
				</div>
				<span className={`rounded-md bg-gold/12 font-semibold uppercase tracking-wider text-gold-bright ${isHero ? "px-3.5 py-1.5 text-[1.0625rem]" : "px-2.5 py-1 text-xs"}`}>
					3 venues
				</span>
			</div>

			{/* KPI strip */}
			<div className="grid grid-cols-4 gap-px border-b border-console-line bg-console-line">
				{kpis.map((k) => (
					<div key={k.label} className={`bg-console-bg ${isHero ? "px-4 py-4.5" : "px-3 py-3.5"}`}>
						<div className={`uppercase tracking-wider text-foreground/45 ${isHero ? "text-[1.0625rem]" : "text-xs"}`}>
							{k.label}
						</div>
						<div className="mt-1.5 flex items-baseline gap-1">
							<span
								className={`font-display leading-none ${
									isHero ? "text-[2.9375rem]" : "text-3xl"
								} ${k.live ? "text-signal-live" : "text-foreground"}`}
							>
								{k.value}
							</span>
							<span className={`text-foreground/40 ${isHero ? "text-[1.0625rem]" : "text-xs"}`}>{k.unit}</span>
						</div>
					</div>
				))}
			</div>

			{/* Shift rows */}
			<div className="divide-y divide-console-line">
				{shifts.map((s) => {
					const meta = statusMeta[s.status];
					return (
						<div
							key={s.initials}
							className={`flex items-center gap-3.5 transition-colors hover:bg-console-elevated ${isHero ? "h-[4.75rem] px-7" : "h-16 px-5"}`}
						>
							<div className={`flex shrink-0 items-center justify-center rounded-full bg-gold/12 font-bold text-gold-bright ${isHero ? "h-12 w-12 text-lg" : "h-10 w-10 text-sm"}`}>
								{s.initials}
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<span className={`truncate font-medium text-foreground ${isHero ? "text-[1.5625rem]" : "text-base"}`}>
										{s.name}
									</span>
									<span className={`shrink-0 rounded bg-foreground/8 font-semibold text-foreground/55 ${isHero ? "px-2 py-0.5 text-xs" : "px-1.5 py-0.5 text-[10px]"}`}>
										{s.tier}
									</span>
								</div>
								<div className={`truncate text-foreground/45 ${isHero ? "text-[1.125rem]" : "text-xs"}`}>
									{s.venue}
								</div>
							</div>
							<div className="flex shrink-0 flex-col items-end gap-1">
								<span
									className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${isHero ? "px-3 py-1 text-[1.0625rem]" : "px-2.5 py-0.5 text-xs"} ${meta.className}`}
								>
									<span className={`rounded-full ${meta.dot} ${isHero ? "h-2 w-2" : "h-1.5 w-1.5"}`} />
									{meta.label}
								</span>
								<span className={`tabular-nums text-foreground/40 ${isHero ? "text-[1.0625rem]" : "text-xs"}`}>
									{s.at}
								</span>
							</div>
						</div>
					);
				})}
			</div>

			{/* Footer reconciliation bar */}
			<div className={`flex items-center justify-between border-t border-console-line ${isHero ? "px-7 py-4.5 text-[1.125rem]" : "px-5 py-3.5 text-xs"}`}>
				<span className="text-foreground/45">
					Cycle reconciliation
				</span>
				<span className="font-semibold text-signal-live">
					On track · settles Sun
				</span>
			</div>
		</motion.div>
	);
}
