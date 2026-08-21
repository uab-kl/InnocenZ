import { OutletTierIcon } from "@agency-portal/components/outlet/outlet-portal-ui";
import {
	formatTierSalesTargets,
	OUTLET_BASE_TIER,
	OUTLET_PR_TIERS,
	type OutletPrTier,
	type OutletTierRateSettings,
} from "@agency-portal/lib/agency-demo";
import { cn } from "@agency-portal/lib/utils";
import { usePortalLocale } from "@/lib/portal-i18n/context";

function formatTargetAmount(targetSalesRm: number): string {
	if (targetSalesRm >= 1000) {
		return `RM ${(targetSalesRm / 1000).toFixed(1)}k`;
	}
	return `RM ${targetSalesRm.toLocaleString("en-MY")}`;
}

export function TierSalesTargetChip({
	targetSalesRm,
	active,
	className,
	compact = true,
}: {
	targetSalesRm: number;
	active?: boolean;
	className?: string;
	compact?: boolean;
}) {
	const { t } = usePortalLocale();
	if (targetSalesRm <= 0) return null;
	return (
		<div
			className={cn(
				"flex w-full flex-col items-center justify-center gap-0.5 text-center leading-none",
				compact
					? "min-h-[30px] rounded border px-1 py-1.5"
					: "rounded-md border px-1.5 py-1",
				active
					? "border-[rgba(62,207,142,.45)] bg-[rgba(62,207,142,.18)]"
					: "border-[rgba(62,207,142,.3)] bg-[rgba(62,207,142,.12)]",
				className,
			)}
		>
			<span
				className={cn(
					"font-bold uppercase text-[var(--iz-green)] leading-none",
					compact
						? "text-[8px] tracking-[0.05em]"
						: "text-[8px] tracking-[0.12em]",
				)}
			>
				{compact ? t.today.target : t.today.salesTarget}
			</span>
			<span
				className={cn(
					"font-sora font-extrabold tabular-nums text-[var(--iz-green)] leading-none",
					compact ? "text-[10px]" : "text-[11px]",
				)}
			>
				≥ {formatTargetAmount(targetSalesRm)}
			</span>
		</div>
	);
}

export function TierRatePill({
	tier,
	wage,
	salesTarget,
	active,
	accent: _accent,
	multiplier,
	onClick,
}: {
	tier: OutletPrTier;
	wage: number;
	salesTarget?: number;
	active?: boolean;
	accent?: boolean;
	multiplier?: number;
	onClick?: () => void;
}) {
	const { t } = usePortalLocale();
	const roman = tier.replace("Tier ", "");
	const isBase = tier === OUTLET_BASE_TIER;
	const hasTarget = (salesTarget ?? 0) > 0;
	const showMultiplier = multiplier != null;
	const Tag = onClick ? "button" : "div";
	const selected = active === true;

	return (
		<Tag
			type={onClick ? "button" : undefined}
			onClick={onClick}
			className={cn(
				"flex h-full w-full min-w-0 flex-col items-center rounded-lg border px-1 py-1.5 text-center",
				selected
					? "border-[var(--iz-gold)] bg-[rgba(232,194,122,.12)]"
					: "border-[var(--iz-line)] bg-white/[0.02]",
				onClick &&
					!selected &&
					"transition-colors hover:border-[var(--iz-muted)]",
			)}
		>
			<div className="flex h-[18px] shrink-0 flex-col items-center justify-start leading-none">
				<OutletTierIcon tier={tier} className="!h-[18px] !w-[18px]" />
				<span
					className={cn(
						"mt-0.5 text-[8px] font-bold leading-none",
						selected ? "text-[var(--iz-gold-l)]" : "text-[var(--iz-txt)]",
					)}
				>
					{roman}
				</span>
				<span
					className={cn(
						"text-[7px] font-medium leading-tight",
						isBase ? "text-[var(--iz-muted)]" : "invisible",
					)}
				>
					base
				</span>
			</div>
			<span className="mt-0.5 shrink-0 text-[8px] font-semibold uppercase tracking-wide text-[var(--iz-muted)]">
				{t.today.payPerShift}
			</span>
			<span
				className={cn(
					"shrink-0 font-sora text-[11px] font-extrabold tabular-nums leading-tight",
					selected ? "text-[var(--iz-gold-l)]" : "text-[var(--iz-txt)]",
				)}
			>
				RM{wage}
			</span>
			{showMultiplier && (
				<span className="shrink-0 text-[9px] font-semibold tabular-nums leading-none text-[var(--iz-muted)]">
					{multiplier}×
				</span>
			)}
			<div className="mt-px w-full">
				{hasTarget ? (
					<TierSalesTargetChip targetSalesRm={salesTarget!} active={selected} />
				) : null}
			</div>
		</Tag>
	);
}

export function ShiftTierWagesStrip({
	tierRates,
	tiers,
	compact = true,
}: {
	tierRates: Record<OutletPrTier, OutletTierRateSettings>;
	tiers?: OutletPrTier[];
	compact?: boolean;
}) {
	const { t } = usePortalLocale();
	const visibleTiers = tiers?.length ? tiers : OUTLET_PR_TIERS;
	const hasSalesTargets = visibleTiers.some(
		(t) => (tierRates[t].targetSalesRm ?? 0) > 0,
	);

	return (
		<div className={compact ? "mt-1.5" : "mt-2"}>
			<p
				className={cn(
					"font-semibold uppercase tracking-wide text-[var(--iz-muted)]",
					compact ? "mb-1 text-[9px]" : "mb-1.5 text-[10px]",
				)}
			>
				{hasSalesTargets
					? t.today.targetPayAndSales
					: t.today.payPerShiftByTier}
			</p>
			<div
				className={cn("grid items-stretch gap-px", compact ? "" : "gap-0.5")}
				style={{
					gridTemplateColumns: `repeat(${visibleTiers.length}, minmax(0, 1fr))`,
				}}
			>
				{visibleTiers.map((tier) => (
					<TierRatePill
						key={tier}
						tier={tier}
						wage={tierRates[tier].wagePerHour}
						salesTarget={tierRates[tier].targetSalesRm}
					/>
				))}
			</div>
			{formatTierSalesTargets(tierRates) && (
				<p className="mt-1.5 text-[10px] font-medium text-[var(--iz-muted)]">
					Week range · {formatTierSalesTargets(tierRates)}
				</p>
			)}
		</div>
	);
}
