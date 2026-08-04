import { TitleWithIcon } from "@agency-portal/components/iz/TitleWithIcon";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@agency-portal/components/ui/popover";
import type { TrafficLevel } from "@agency-portal/lib/traffic-status";
import { cn } from "@agency-portal/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
	AlertCircle,
	AlertTriangle,
	Award,
	CheckCircle2,
	Clock,
	Crown,
	Medal,
	Star,
	X,
} from "lucide-react";
import {
	type ReactNode,
	type SelectHTMLAttributes,
	useEffect,
	useRef,
	useState,
} from "react";

/** Normalize HH:MM (or H:MM) for native `type="time"` inputs */
export function normalizeTimeValue(v: string): string {
	const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
	if (!m) return "00:00";
	const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
	const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
	return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function IzCard({
	children,
	className,
	glow,
	flat,
}: {
	children: ReactNode;
	className?: string;
	glow?: boolean;
	flat?: boolean;
}) {
	return (
		<div
			className={cn(
				"iz-card",
				flat && "iz-card-flat",
				glow && "iz-card-glow",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function IzPill({
	children,
	variant = "ink",
	className,
}: {
	children: ReactNode;
	variant?: "violet" | "green" | "red" | "amber" | "gold" | "ink";
	className?: string;
}) {
	const v = {
		violet: "iz-pill-violet",
		green: "iz-pill-green",
		red: "iz-pill-red",
		amber: "iz-pill-amber",
		gold: "iz-pill-gold",
		ink: "iz-pill-ink",
	}[variant];
	return <span className={cn("iz-pill", v, className)}>{children}</span>;
}

const TRAFFIC_ICON: Record<TrafficLevel, typeof AlertTriangle> = {
	red: AlertTriangle,
	yellow: AlertCircle,
	green: CheckCircle2,
};

/** Target-vs-actual status pill. Pass `level` directly, or derive it with trafficLevelForRatio(). */
export function TrafficPill({
	level,
	children,
	className,
	hideIcon,
}: {
	level: TrafficLevel;
	children: ReactNode;
	className?: string;
	hideIcon?: boolean;
}) {
	const Icon = TRAFFIC_ICON[level];
	return (
		<span
			className={cn(
				"iz-pill iz-pill-traffic",
				`iz-pill-traffic--${level}`,
				className,
			)}
		>
			{hideIcon ? (
				<span className="iz-traffic-dot" />
			) : (
				<Icon className="h-3 w-3 shrink-0" />
			)}
			{children}
		</span>
	);
}

const TIER_ICON = [Star, Medal, Award, Award, Crown] as const;

/** Parses "Tier I".."Tier V" into a 1-5 rank; falls back to 1 for unknown/missing values. */
function tierRank(tier: string): number {
	const roman = tier.trim().split(" ")[1]?.toUpperCase();
	const ranks: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
	return ranks[roman ?? ""] ?? 1;
}

/** Visually distinct PR tier badge — color + icon scale from Tier I (base) to Tier V (top). */
export function TierBadge({
	tier,
	className,
}: {
	tier: string;
	className?: string;
}) {
	const rank = tierRank(tier);
	const Icon = TIER_ICON[rank - 1];
	return (
		<span className={cn("iz-tier-badge", `iz-tier-badge--${rank}`, className)}>
			<Icon />
			{tier}
		</span>
	);
}

export function IzSectionLabel({
	children,
	className,
	icon,
	hideIcon,
}: {
	children: ReactNode;
	className?: string;
	icon?: LucideIcon | null;
	hideIcon?: boolean;
}) {
	return (
		<div className={cn("iz-sect-label", className)}>
			<TitleWithIcon icon={icon} hideIcon={hideIcon}>
				{children}
			</TitleWithIcon>
		</div>
	);
}

export function IzCardTitle({
	children,
	className,
	icon,
	hideIcon,
}: {
	children: ReactNode;
	className?: string;
	icon?: LucideIcon | null;
	hideIcon?: boolean;
}) {
	return (
		<div className={cn("iz-cardttl", className)}>
			<TitleWithIcon
				icon={icon}
				hideIcon={hideIcon}
				iconClassName="iz-title-icon--card"
			>
				{children}
			</TitleWithIcon>
		</div>
	);
}

export function IzPageTitle({
	children,
	level = 2,
	size = "lg",
	className,
	icon,
}: {
	children: ReactNode;
	level?: 1 | 2 | 3;
	size?: "lg" | "xl";
	className?: string;
	icon?: LucideIcon | null;
}) {
	const Tag = `h${level}` as "h1" | "h2" | "h3";
	const sizeClass =
		size === "xl"
			? "text-[22px] tracking-tight"
			: level === 3
				? "text-lg"
				: "text-lg leading-snug";
	return (
		<Tag
			className={cn(
				"font-sora font-extrabold text-[var(--iz-txt)]",
				sizeClass,
				className,
			)}
		>
			<TitleWithIcon icon={icon}>{children}</TitleWithIcon>
		</Tag>
	);
}

/** KPI / stat tile label — icon + words inside `.l` styling. */
export function IzKpiLabel({
	children,
	className,
	icon,
}: {
	children: ReactNode;
	className?: string;
	icon?: LucideIcon | null;
}) {
	return (
		<div className={cn("l", className)}>
			<TitleWithIcon icon={icon} iconClassName="iz-title-icon--kpi">
				{children}
			</TitleWithIcon>
		</div>
	);
}

export function formatRM(n: number) {
	return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function IzSelect({
	className,
	block,
	children,
	...props
}: SelectHTMLAttributes<HTMLSelectElement> & { block?: boolean }) {
	return (
		<select
			className={cn("iz-select", block && "iz-select-block", className)}
			{...props}
		>
			{children}
		</select>
	);
}

export function formatTimeLabel(hhmm: string): string {
	const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
	if (!m) return hhmm;
	const h = parseInt(m[1], 10);
	const min = parseInt(m[2], 10);
	const period = h >= 12 ? "PM" : "AM";
	const hr = h % 12 || 12;
	return `${hr}:${String(min).padStart(2, "0")} ${period}`;
}

type TimePeriod = "AM" | "PM";

type Time12Parts = {
	hour12: number;
	minute: number;
	period: TimePeriod;
};

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS: TimePeriod[] = ["AM", "PM"];

function parseTime12(hhmm: string): Time12Parts {
	const normalized = normalizeTimeValue(hhmm);
	const [h24, minute] = normalized.split(":").map((x) => parseInt(x, 10));
	const period: TimePeriod = h24 >= 12 ? "PM" : "AM";
	const hour12 = h24 % 12 || 12;
	return { hour12, minute, period };
}

function formatTime24(parts: Time12Parts): string {
	let h24 = parts.hour12 % 12;
	if (parts.period === "PM") h24 += 12;
	return `${String(h24).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function TimePickerColumn<T extends string | number>({
	items,
	value,
	onChange,
	formatItem,
}: {
	items: readonly T[];
	value: T;
	onChange: (v: T) => void;
	formatItem: (v: T) => string;
}) {
	const colRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const selected = colRef.current?.querySelector('[data-selected="true"]');
		selected?.scrollIntoView({ block: "center" });
	}, [value]);

	return (
		<div ref={colRef} className="iz-time-picker-col">
			{items.map((item) => {
				const selected = item === value;
				return (
					<button
						key={String(item)}
						type="button"
						data-selected={selected ? "true" : undefined}
						className={cn("iz-time-picker-col-btn", selected && "is-selected")}
						onClick={() => onChange(item)}
					>
						{formatItem(item)}
					</button>
				);
			})}
		</div>
	);
}

/** Tap-to-open time picker — dark themed scroll columns */
export function IzTimeInput({
	value,
	onChange,
	className,
	showIcon = true,
	placeholder = "Tap to choose",
	disabledPlaceholder = "Pick date first",
	...props
}: {
	value: string;
	onChange: (value: string) => void;
	className?: string;
	showIcon?: boolean;
	placeholder?: string;
	disabledPlaceholder?: string;
	disabled?: boolean;
	"aria-label"?: string;
}) {
	const [open, setOpen] = useState(false);
	const hasValue = Boolean(value?.trim());
	const disabled = Boolean(props.disabled);
	const [draft, setDraft] = useState<Time12Parts>(() =>
		parseTime12(hasValue ? value : "12:00"),
	);

	useEffect(() => {
		if (open) {
			setDraft(parseTime12(hasValue ? value : "12:00"));
		}
	}, [open, value, hasValue]);

	const label = disabled
		? disabledPlaceholder
		: hasValue
			? formatTimeLabel(normalizeTimeValue(value))
			: placeholder;

	const applyDraft = (next: Time12Parts) => {
		setDraft(next);
		onChange(formatTime24(next));
	};

	return (
		<Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
			<div className={cn("iz-time-picker", className)}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className={cn(
							"iz-time-picker-btn",
							hasValue && "has-value",
							disabled && "is-disabled",
						)}
						disabled={disabled}
						aria-label={props["aria-label"] ?? "Choose time"}
					>
						{showIcon && (
							<Clock className="h-4 w-4 shrink-0 text-[var(--iz-muted2)]" />
						)}
						<span
							className={cn(
								"iz-time-picker-label",
								!hasValue && !disabled && "iz-muted2",
							)}
						>
							{label}
						</span>
					</button>
				</PopoverTrigger>
				{hasValue && !disabled && (
					<button
						type="button"
						className="iz-time-picker-clear"
						aria-label="Clear time"
						onClick={(e) => {
							e.stopPropagation();
							onChange("");
							setOpen(false);
						}}
					>
						<X className="h-3.5 w-3.5" />
					</button>
				)}
				<PopoverContent
					align="end"
					sideOffset={6}
					className="iz-time-picker-popover w-auto border-[var(--iz-line)] bg-[var(--iz-panel)] p-2 shadow-xl"
				>
					<div className="iz-time-picker-columns">
						<TimePickerColumn
							items={HOURS_12}
							value={draft.hour12}
							onChange={(hour12) => applyDraft({ ...draft, hour12 })}
							formatItem={(h) => String(h).padStart(2, "0")}
						/>
						<TimePickerColumn
							items={MINUTES}
							value={draft.minute}
							onChange={(minute) => applyDraft({ ...draft, minute })}
							formatItem={(m) => String(m).padStart(2, "0")}
						/>
						<TimePickerColumn
							items={PERIODS}
							value={draft.period}
							onChange={(period) => applyDraft({ ...draft, period })}
							formatItem={(p) => p}
						/>
					</div>
				</PopoverContent>
			</div>
		</Popover>
	);
}
