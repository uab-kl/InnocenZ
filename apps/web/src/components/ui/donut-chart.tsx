import { usePortalLocale } from "@/lib/portal-i18n/context";
import { cn, formatNumber } from "@/lib/utils";

export type DonutSlice = {
	key: string;
	label: string;
	value: number;
	/** Any CSS color — pass a token like "var(--signal-live)". */
	color: string;
};

type DonutChartProps = {
	slices: DonutSlice[];
	/** Big number shown in the centre. Defaults to the summed total. */
	centerValue?: number;
	centerLabel?: string;
	size?: number;
	thickness?: number;
	className?: string;
	/** "bar" draws the same slices as one stacked bar (a share reads best left
	 *  to right) with the total above it; the legend is identical. */
	variant?: "donut" | "bar";
};

/**
 * Dependency-free SVG donut with a count + percentage legend.
 * Mirrors the "Member Overview" breakdown donuts on the reference admin,
 * styled entirely with the app's design tokens so it tracks light/dark.
 */
export function DonutChart({
	slices,
	centerValue,
	centerLabel,
	size = 168,
	thickness = 18,
	className,
	variant = "donut",
}: DonutChartProps) {
	const { t } = usePortalLocale();
	const total = slices.reduce((sum, s) => sum + s.value, 0);
	const center = size / 2;
	const radius = center - thickness / 2;
	const circumference = 2 * Math.PI * radius;
	const displayTotal = centerValue ?? total;

	let offsetFraction = 0;

	const ariaLabel =
		total === 0
			? t.webUi.chartNoData
			: slices
					.filter((s) => s.value > 0)
					.map((s) => `${s.label}: ${s.value}`)
					.join(", ");

	const legend = (
		<ul className="flex w-full min-w-0 flex-col gap-2">
			{slices.map((slice) => {
				const pct = total > 0 ? Math.round((slice.value / total) * 100) : 0;
				return (
					<li
						key={slice.key}
						// a part with nothing in it steps back, so the counts that
						// matter lead (owner: "dont be like too messy")
						className={cn(
							"flex items-center gap-2.5 text-[13px]",
							slice.value === 0 && "opacity-55",
						)}
					>
						<span
							className="h-2.5 w-2.5 shrink-0 rounded-sm"
							style={{ background: slice.color }}
							aria-hidden
						/>
						<span className="min-w-0 flex-1 truncate text-muted-foreground">
							{slice.label}
						</span>
						<span className="font-semibold text-foreground tabular-nums">
							{formatNumber(slice.value)}
						</span>
						<span className="w-9 shrink-0 text-right text-[11.5px] text-muted-foreground tabular-nums">
							{pct}%
						</span>
					</li>
				);
			})}
		</ul>
	);

	if (variant === "bar") {
		return (
			<div className={cn("flex w-full flex-col gap-4", className)}>
				<p className="m-0 flex items-baseline gap-2">
					<span className="font-display text-3xl leading-none text-foreground tabular-nums">
						{formatNumber(displayTotal)}
					</span>
					{centerLabel && (
						<span className="text-muted-foreground">{centerLabel}</span>
					)}
				</p>
				{/* A slim bar (owner, 20 Nov 2026: the 24px slabs were "ugly"): 8px,
				    a 2px gap between parts, each part a soft glow of its own colour —
				    the chart is where the night look may be colourful. */}
				<div
					role="img"
					aria-label={ariaLabel}
					className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-border/60"
				>
					{total > 0 &&
						slices
							.filter((s) => s.value > 0)
							.map((s) => (
								<span
									key={s.key}
									className="h-full rounded-full"
									style={{
										flexGrow: s.value,
										background: s.color,
										boxShadow: `0 0 10px -2px ${s.color}`,
									}}
								/>
							))}
				</div>
				{legend}
			</div>
		);
	}

	return (
		<div
			className={cn(
				"flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6",
				className,
			)}
		>
			<div className="relative shrink-0" style={{ width: size, height: size }}>
				<svg
					width={size}
					height={size}
					viewBox={`0 0 ${size} ${size}`}
					role="img"
					aria-label={ariaLabel}
				>
					<g transform={`rotate(-90 ${center} ${center})`}>
						{/* Track */}
						<circle
							cx={center}
							cy={center}
							r={radius}
							fill="none"
							stroke="var(--border)"
							strokeWidth={thickness}
							opacity={0.5}
						/>
						{total > 0 &&
							slices.map((slice) => {
								if (slice.value <= 0) return null;
								const fraction = slice.value / total;
								const dash = fraction * circumference;
								const dashOffset = -offsetFraction * circumference;
								offsetFraction += fraction;
								return (
									<circle
										key={slice.key}
										cx={center}
										cy={center}
										r={radius}
										fill="none"
										stroke={slice.color}
										strokeWidth={thickness}
										strokeDasharray={`${dash} ${circumference - dash}`}
										strokeDashoffset={dashOffset}
										strokeLinecap="butt"
									/>
								);
							})}
					</g>
				</svg>
				<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
					<span className="font-display text-3xl leading-none text-foreground">
						{formatNumber(displayTotal)}
					</span>
					{centerLabel && (
						<span className="mt-1 text-[11px] text-muted-foreground">
							{centerLabel}
						</span>
					)}
				</div>
			</div>

			{legend}
		</div>
	);
}
