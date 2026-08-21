import { TitleWithIcon } from "@agency-portal/components/iz/TitleWithIcon";
import { TrafficPill } from "@agency-portal/components/iz/ui";
import { JobPostingMicroLabel } from "@agency-portal/components/special-service/job-posting-ui";
import { iconForNav } from "@agency-portal/lib/lucide-label-icons";
import { formatOutletShiftMetricAmount } from "@agency-portal/lib/outlet-demo";
import {
	type TrafficLevel,
	trafficLevelForRatio,
} from "@agency-portal/lib/traffic-status";
import { cn } from "@agency-portal/lib/utils";
import {
	Award,
	Check,
	Crown,
	Lock,
	type LucideIcon,
	Medal,
	Pencil,
	Star,
	X,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

const TIER_ICONS = [Star, Medal, Award, Award, Crown] as const;

export function outletTierRank(tier: string): number {
	const roman = tier.trim().split(" ").pop()?.toUpperCase();
	const ranks: Record<string, number> = {
		I: 1,
		II: 2,
		III: 3,
		IV: 4,
		V: 5,
		"1": 1,
		"2": 2,
		"3": 3,
		"4": 4,
		"5": 5,
	};
	return ranks[roman ?? ""] ?? 1;
}

export function OutletTierIcon({
	tier,
	className,
}: {
	tier: string;
	className?: string;
}) {
	const rank = Math.min(5, Math.max(1, outletTierRank(tier)));
	const Icon = TIER_ICONS[rank - 1];
	return (
		<span
			className={cn(
				"iz-outlet-tier-icon",
				`iz-outlet-tier-icon--${rank}`,
				className,
			)}
			aria-hidden
		>
			<Icon className="h-3.5 w-3.5" />
		</span>
	);
}

function performanceLevel(
	actual: number,
	target: number,
	lowerIsBetter = false,
): TrafficLevel {
	if (target <= 0) return actual > 0 ? "green" : "yellow";
	const ratio = actual / target;
	if (lowerIsBetter) {
		if (ratio <= 1) return "green";
		if (ratio <= 1.12) return "yellow";
		return "red";
	}
	return trafficLevelForRatio(actual, target);
}

export function OutletPage({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("iz-screen iz-outlet-page", className)}>{children}</div>
	);
}

export function OutletPageHeader({
	eyebrow,
	title,
	iconKey,
	hint,
	trailing,
}: {
	eyebrow?: string;
	title: string;
	/**
	 * The ENGLISH title to resolve the page icon from, when `title` is
	 * translated. `iconForNav` matches on the text, so a localised title alone
	 * silently drops the icon. Mirrors the same prop on `OutletSection`.
	 */
	iconKey?: string;
	hint?: string;
	trailing?: ReactNode;
}) {
	return (
		<header className="iz-outlet-page-header">
			<div className="min-w-0 flex-1">
				{eyebrow && (
					<p className="iz-outlet-page-eyebrow">
						<TitleWithIcon
							icon={iconForNav(eyebrow)}
							iconClassName="iz-title-icon--eyebrow"
						>
							{eyebrow}
						</TitleWithIcon>
					</p>
				)}
				<h2 className="font-sora text-lg font-extrabold leading-snug text-[var(--iz-txt)]">
					<TitleWithIcon icon={iconForNav(iconKey ?? title)}>
						{title}
					</TitleWithIcon>
				</h2>
				{hint && <p className="iz-outlet-page-hint">{hint}</p>}
			</div>
			{trailing}
		</header>
	);
}

export function OutletFormCard({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("iz-job-posting-form-card", className)}>{children}</div>
	);
}

export function OutletField({
	label,
	children,
	className,
	htmlFor,
}: {
	label: string;
	children: ReactNode;
	className?: string;
	/** Id of the control this field wraps. Nested inputs are associated
	 *  implicitly; pass this when the control is rendered elsewhere. */
	htmlFor?: string;
}) {
	return (
		<label
			htmlFor={htmlFor}
			className={cn(
				"iz-outlet-field flex w-full min-w-0 flex-col gap-1",
				className,
			)}
		>
			<JobPostingMicroLabel>{label}</JobPostingMicroLabel>
			{children}
		</label>
	);
}

export function OutletTargetActualCard({
	label,
	target,
	actual,
	lowerIsBetter = false,
	onClick,
}: {
	label: string;
	target: number;
	actual: number;
	lowerIsBetter?: boolean;
	onClick?: () => void;
}) {
	const { t } = usePortalLocale();
	const level = performanceLevel(actual, target, lowerIsBetter);
	const gap = actual - target;
	const gapLabel =
		gap === 0
			? t.today.onTarget
			: lowerIsBetter
				? gap < 0
					? fill(t.today.amountUnder, {
							amount: formatOutletShiftMetricAmount(Math.abs(gap)),
						})
					: fill(t.today.amountOver, {
							amount: formatOutletShiftMetricAmount(gap),
						})
				: gap > 0
					? fill(t.today.amountAbove, {
							amount: formatOutletShiftMetricAmount(gap),
						})
					: fill(t.today.amountBelow, {
							amount: formatOutletShiftMetricAmount(Math.abs(gap)),
						});

	const className = cn(
		"iz-outlet-ta-card",
		onClick && "iz-outlet-ta-card--interactive",
	);
	const body = (
		<>
			<div className="iz-outlet-ta-card__head">
				<span className="iz-outlet-ta-card__label">{label}</span>
				<TrafficPill level={level} hideIcon className="!py-0.5 !text-[9px]">
					{level === "green"
						? t.today.onTrack
						: level === "yellow"
							? t.today.watch
							: t.today.attention}
				</TrafficPill>
			</div>
			<div className="iz-outlet-ta-card__rows">
				<div className="iz-outlet-ta-card__row">
					<span className="iz-outlet-ta-card__kind iz-outlet-ta-card__kind--target">
						{t.today.target}
					</span>
					<span className="iz-outlet-ta-card__value iz-outlet-ta-card__value--target">
						{formatOutletShiftMetricAmount(target)}
					</span>
				</div>
				<div className="iz-outlet-ta-card__row">
					<span className="iz-outlet-ta-card__kind">{t.today.actual}</span>
					<span
						className={cn(
							"iz-outlet-ta-card__value",
							`iz-outlet-ta-card__value--${level}`,
						)}
					>
						{formatOutletShiftMetricAmount(actual)}
					</span>
				</div>
			</div>
			<p
				className={cn(
					"iz-outlet-ta-card__gap",
					`iz-outlet-ta-card__gap--${level}`,
				)}
			>
				{gapLabel}
			</p>
		</>
	);

	if (onClick) {
		return (
			<button type="button" onClick={onClick} className={className}>
				{body}
			</button>
		);
	}

	return <div className={className}>{body}</div>;
}

export function OutletStatChip({
	label,
	value,
	tone = "neutral",
	onClick,
}: {
	label: string;
	value: string;
	tone?: "neutral" | "violet" | "warn" | "danger" | "green";
	onClick?: () => void;
}) {
	const className = cn(
		"iz-outlet-stat-chip",
		`iz-outlet-stat-chip--${tone}`,
		onClick && "iz-outlet-stat-chip--interactive",
	);

	if (onClick) {
		return (
			<button type="button" onClick={onClick} className={className}>
				<span className="iz-outlet-stat-chip__label">{label}</span>
				<span className="iz-outlet-stat-chip__value">{value}</span>
			</button>
		);
	}

	return (
		<div className={className}>
			<span className="iz-outlet-stat-chip__label">{label}</span>
			<span className="iz-outlet-stat-chip__value">{value}</span>
		</div>
	);
}

type ActionTone = "green" | "gold" | "violet" | "danger" | "soft";

export function OutletActionButton({
	icon: Icon,
	title,
	hint,
	tone = "soft",
	onClick,
	disabled,
	className,
}: {
	icon: LucideIcon;
	title: string;
	hint?: string;
	tone?: ActionTone;
	onClick?: () => void;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"iz-outlet-action-btn",
				`iz-outlet-action-btn--${tone}`,
				className,
			)}
		>
			<span className="iz-outlet-action-btn__icon" aria-hidden>
				<Icon className="h-4 w-4" />
			</span>
			<span className="min-w-0 flex-1 text-left">
				<span className="iz-outlet-action-btn__title">{title}</span>
				{hint && <span className="iz-outlet-action-btn__hint">{hint}</span>}
			</span>
		</button>
	);
}

export function OutletApplicantRow({
	name,
	meta,
	onAccept,
	onDecline,
}: {
	name: string;
	meta: ReactNode;
	onAccept: () => void;
	onDecline: () => void;
}) {
	const { t } = usePortalLocale();
	return (
		<div className="iz-outlet-applicant-row">
			<div className="min-w-0 flex-1">
				<p className="text-sm font-semibold text-[var(--iz-txt)]">{name}</p>
				<div className="mt-0.5 flex flex-wrap items-center gap-1">{meta}</div>
			</div>
			<div className="flex shrink-0 flex-col items-end gap-1">
				<span className="iz-outlet-applicant-row__label">
					{t.today.tapToRespond}
				</span>
				<div className="flex gap-1.5">
					<button
						type="button"
						onClick={onAccept}
						className="iz-outlet-applicant-btn iz-outlet-applicant-btn--accept"
						aria-label={fill(t.today.acceptNamed, { name })}
						title={t.today.acceptHint}
					>
						<Check className="h-4 w-4" strokeWidth={2.5} />
					</button>
					<button
						type="button"
						onClick={onDecline}
						className="iz-outlet-applicant-btn iz-outlet-applicant-btn--decline"
						aria-label={fill(t.today.declineNamed, { name })}
						title={t.today.declineHint}
					>
						<X className="h-4 w-4" strokeWidth={2.5} />
					</button>
				</div>
			</div>
		</div>
	);
}

export function OutletEmptyState({ children }: { children: ReactNode }) {
	return (
		<p className="iz-outlet-empty rounded-2xl border border-dashed border-[var(--iz-line)] px-4 py-8 text-center">
			{children}
		</p>
	);
}

export function OutletCardHeader({
	icon: Icon,
	title,
	badge,
	trailing,
}: {
	icon?: ComponentType<{ className?: string }>;
	title: string;
	badge?: ReactNode;
	trailing?: ReactNode;
}) {
	return (
		<div className="iz-outlet-card-head">
			<div className="flex min-w-0 items-center gap-2">
				{Icon && (
					<span className="iz-outlet-card-head__icon" aria-hidden>
						<Icon className="h-4 w-4" />
					</span>
				)}
				<span className="font-sora text-sm font-extrabold text-[var(--iz-txt)]">
					{title}
				</span>
				{badge}
			</div>
			{trailing}
		</div>
	);
}

export function OutletLockedRow({ children }: { children: ReactNode }) {
	const { t } = usePortalLocale();
	return (
		<div className="iz-job-posting-control">
			<div className="iz-post-job-locked-row w-full">
				<span className="min-w-0 flex-1 text-sm font-semibold text-[var(--iz-txt)]">
					{children}
				</span>
				<span className="iz-post-job-locked-badge">
					<Lock className="h-3 w-3" aria-hidden />
					{t.today.lockedRow}
				</span>
			</div>
		</div>
	);
}

export function OutletEditableShell({
	children,
	icon: Icon = Pencil,
}: {
	children: ReactNode;
	icon?: LucideIcon;
}) {
	return (
		<div className="iz-job-posting-control iz-post-job-editable-shell">
			<div className="min-w-0 flex-1">{children}</div>
			<Icon
				className="h-3.5 w-3.5 shrink-0 text-[var(--iz-violet)]"
				aria-hidden
			/>
		</div>
	);
}
