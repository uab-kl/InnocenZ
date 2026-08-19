import { formatRM } from "@agency-portal/components/iz/ui";
import { ShiftMetricIconLabel } from "@agency-portal/components/outlet/outlet-history-metrics";
import { ShiftHistoryMoneyBreakdownView } from "@agency-portal/components/outlet/ShiftHistoryMoneyBreakdownView";
import {
	type AgencyManagedPR,
	findAgencyManagedPr,
	resolveAgencyPrPhoto,
} from "@agency-portal/lib/agency-demo";
import { publicAssetPath } from "@agency-portal/lib/public-asset";
import { shiftHistorySubline } from "@agency-portal/lib/shift-history";
import {
	resolveShiftHistoryBreakdown,
	type ShiftHistoryMoneyBreakdown,
	shiftHistoryTotalReceived,
} from "@agency-portal/lib/shift-history-amounts";
import type {
	ShiftHistoryPrRollup,
	ShiftHistoryRow,
} from "@agency-portal/lib/shift-history-utils";
import { useStore } from "@agency-portal/lib/store";
import { cn } from "@agency-portal/lib/utils";
import { format, parseISO } from "date-fns";
import { Crown, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

const AVATAR_COLORS = [
	{ bg: "rgba(167, 139, 250, 0.35)", text: "#c4b5fd" },
	{ bg: "rgba(96, 165, 250, 0.35)", text: "#93c5fd" },
	{ bg: "rgba(74, 222, 128, 0.35)", text: "#86efac" },
	{ bg: "rgba(244, 183, 64, 0.35)", text: "#fcd34d" },
];

const RATED_STAR_SLOTS = 5;

export type OutletPrRating = {
	id: string;
	pr: string;
	stars: number;
	note: string;
	date: string;
	tags?: string[];
};

function avatarStyle(name: string) {
	let h = 0;
	for (let i = 0; i < name.length; i++)
		h = (h + name.charCodeAt(i)) % AVATAR_COLORS.length;
	return AVATAR_COLORS[h]!;
}

function formatLatestLabel(
	dateIso: string,
	dateDisplay: string,
	t: PortalTranslations,
) {
	if (/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
		try {
			const d = parseISO(dateIso);
			return fill(t.history.latestOn, {
				day: format(d, "EEE"),
				date: format(d, "d MMM"),
			});
		} catch {
			/* use fallback */
		}
	}
	return fill(t.history.latestPlain, { date: dateDisplay });
}

function OutletPrAvatar({
	prId,
	prName,
	agencyPRs: agencyPRsProp,
}: {
	prId: string;
	prName: string;
	/** Prefer caller roster (e.g. backend History) over the demo store. */
	agencyPRs?: AgencyManagedPR[];
}) {
	const storePRs = useStore((s) => s.agencyPRs);
	const agencyPRs = agencyPRsProp ?? storePRs;
	const agencyPr = findAgencyManagedPr(agencyPRs, prId, prName);
	// Profile photo first, then dedicated comcard, then a portfolio still.
	const photoSrc = agencyPr ? resolveAgencyPrPhoto(agencyPr) : null;
	const [failedSrc, setFailedSrc] = useState<string | null>(null);
	const photoFailed = Boolean(photoSrc && failedSrc === photoSrc);
	const initial = prName.trim().charAt(0).toUpperCase() || "?";
	const avatar = avatarStyle(prName);

	if (photoSrc && !photoFailed) {
		return (
			<div
				className="iz-outlet-hist-avatar iz-outlet-hist-avatar--photo"
				aria-hidden
			>
				<img
					src={publicAssetPath(photoSrc)}
					alt=""
					onError={() => setFailedSrc(photoSrc)}
				/>
			</div>
		);
	}

	return (
		<div
			className="iz-outlet-hist-avatar"
			style={{ background: avatar.bg, color: avatar.text }}
			aria-hidden
		>
			{initial}
		</div>
	);
}

/** Compact RM for outlet history cards — drops .00 when whole ringgit. */
export function formatOutletHistRm(value: number) {
	const whole = Math.abs(value - Math.round(value)) < 0.005;
	return `RM ${value.toLocaleString("en-MY", {
		minimumFractionDigits: whole ? 0 : 2,
		maximumFractionDigits: 2,
	})}`;
}

function ratingNameKey(name: string) {
	return name.trim().toLowerCase();
}

export function findOutletRatingForPr(
	prName: string,
	ratings: OutletPrRating[],
): OutletPrRating | undefined {
	const key = ratingNameKey(prName);
	return ratings.find((r) => ratingNameKey(r.pr) === key);
}

/** Five star slots — each position has its own fill / empty placeholder style. */
function RatedStarRow({
	stars,
	size = "md",
	className,
}: {
	stars: number;
	size?: "sm" | "md";
	className?: string;
}) {
	const { t } = usePortalLocale();
	const filled = Math.max(0, Math.min(RATED_STAR_SLOTS, Math.round(stars)));
	const iconSize = size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5";

	return (
		<span
			className={cn(
				"iz-rated-stars",
				size === "sm" && "iz-rated-stars--sm",
				className,
			)}
			aria-label={fill(t.history.starsOutOf, {
				filled,
				total: RATED_STAR_SLOTS,
			})}
		>
			{Array.from({ length: RATED_STAR_SLOTS }).map((_, index) => {
				const slot = index + 1;
				const isFilled = index < filled;
				return (
					<Star
						key={slot}
						className={cn(
							iconSize,
							"iz-rated-star",
							isFilled ? "iz-rated-star--filled" : "iz-rated-star--empty",
							`iz-rated-star--slot-${slot}`,
						)}
						strokeWidth={isFilled ? 0 : 1.6}
						aria-hidden
					/>
				);
			})}
		</span>
	);
}

function OutletStarPill({ stars }: { stars: number }) {
	if (stars <= 0) return null;
	return (
		<RatedStarRow stars={stars} size="sm" className="iz-outlet-hist-stars" />
	);
}

export function OutletShiftLogRatingBlock({
	rating,
}: {
	rating: OutletPrRating;
}) {
	const { t } = usePortalLocale();
	return (
		<section className="iz-outlet-shift-log-rating">
			<div className="iz-outlet-shift-log-rating__head">
				<span className="iz-outlet-shift-log-rating__label">
					{t.history.rating}
				</span>
				{rating.date && (
					<span className="iz-outlet-shift-log-rating__date">
						{rating.date}
					</span>
				)}
			</div>
			<div className="iz-outlet-shift-log-rating__body">
				<RatedStarRow
					stars={rating.stars}
					className="iz-outlet-shift-log-rating__stars"
				/>
				{rating.note && (
					<p className="iz-outlet-shift-log-rating__quote">
						&ldquo;{rating.note}&rdquo;
					</p>
				)}
			</div>
		</section>
	);
}

export function OutletShiftLogShiftCard({ row }: { row: ShiftHistoryRow }) {
	const { t } = usePortalLocale();
	const [openKind, setOpenKind] = useState<"received" | "payout" | null>(null);
	const outletCommissionRules = useStore((s) => s.outletCommissionRules);
	const agencyPRs = useStore((s) => s.agencyPRs);
	const perDrinkRm = useStore((s) => s.outletWorkspace.perDrinkRm);
	const prTier = agencyPRs.find((p) => p.id === row.prId)?.trainingLevel;

	const breakdown = useMemo(
		() =>
			resolveShiftHistoryBreakdown(row, {
				rules: outletCommissionRules,
				prTier,
				perDrinkRm,
			}),
		[row, outletCommissionRules, prTier, perDrinkRm],
	);

	const toggle = (kind: "received" | "payout") => {
		setOpenKind((prev) => (prev === kind ? null : kind));
	};

	return (
		<article className="iz-outlet-shift-log-card">
			<div className="iz-outlet-shift-log-card__head">
				<div>
					<p className="iz-outlet-shift-log-card__date">{row.dateDisplay}</p>
					<p className="iz-outlet-shift-log-card__sub">
						{shiftHistorySubline(row, "outlet")}
					</p>
				</div>
				<div className="iz-outlet-shift-log-card__total-wrap">
					<p className="iz-outlet-shift-log-card__total">
						{formatRM(breakdown.totalPayout)}
					</p>
					<p className="iz-outlet-shift-log-card__hours">
						{row.durationHours}h shift
					</p>
				</div>
			</div>
			<div className="iz-outlet-shift-log-card__metrics iz-outlet-shift-log-card__metrics--pair">
				<button
					type="button"
					className={cn(
						"iz-outlet-shift-log-card__metric iz-outlet-shift-log-card__metric--btn",
						"iz-outlet-shift-log-card__metric--received",
						openKind === "received" && "is-open",
					)}
					onClick={() => toggle("received")}
					aria-expanded={openKind === "received"}
				>
					<span className="iz-outlet-shift-log-card__metric-label">
						{t.history.metricTotalReceived}
					</span>
					<span className="iz-outlet-shift-log-card__metric-value">
						{formatOutletHistRm(breakdown.totalReceived)}
					</span>
				</button>
				<button
					type="button"
					className={cn(
						"iz-outlet-shift-log-card__metric iz-outlet-shift-log-card__metric--btn",
						"iz-outlet-shift-log-card__metric--payout",
						openKind === "payout" && "is-open",
					)}
					onClick={() => toggle("payout")}
					aria-expanded={openKind === "payout"}
				>
					<span className="iz-outlet-shift-log-card__metric-label">
						{t.history.metricTotalPayout}
					</span>
					<span className="iz-outlet-shift-log-card__metric-value">
						{formatOutletHistRm(breakdown.totalPayout)}
					</span>
				</button>
			</div>
			{openKind ? (
				<ShiftHistoryMoneyBreakdownView breakdown={breakdown} kind={openKind} />
			) : null}
		</article>
	);
}

export function OutletShiftLogSummaryCard({
	shiftCount,
	outletName,
	prName,
	agencyLabel,
	totalPayout,
	totalReceived,
	totalDrinks,
	totalTips,
	drinkSalesRm,
	breakdown,
}: {
	shiftCount: number;
	outletName: string;
	prName: string;
	agencyLabel?: string;
	totalPayout: number;
	totalReceived?: number;
	/** @deprecated Prefer totalReceived */
	totalDrinks?: number;
	totalTips?: number;
	drinkSalesRm?: number;
	breakdown?: ShiftHistoryMoneyBreakdown;
}) {
	const { t } = usePortalLocale();
	const [openKind, setOpenKind] = useState<"received" | "payout" | null>(null);
	const received =
		breakdown?.totalReceived ??
		totalReceived ??
		shiftHistoryTotalReceived({
			drinkSalesRm,
			totalDrinks: totalDrinks ?? 0,
			totalTips: totalTips ?? 0,
		});
	const payout = breakdown?.totalPayout ?? totalPayout;

	const toggle = (kind: "received" | "payout") => {
		if (!breakdown) return;
		setOpenKind((prev) => (prev === kind ? null : kind));
	};

	return (
		<article className="iz-outlet-shift-log-summary">
			<p className="iz-outlet-shift-log-summary__hint">
				{shiftCount} shift{shiftCount !== 1 ? "s" : ""} at {outletName} ·{" "}
				{prName}
				{agencyLabel ? ` · ${agencyLabel}` : ""}
			</p>
			<div className="iz-outlet-shift-log-summary__metrics iz-outlet-shift-log-summary__metrics--pair">
				<button
					type="button"
					className={cn(
						"iz-outlet-shift-log-summary__metric iz-outlet-shift-log-summary__metric--btn",
						"iz-outlet-shift-log-summary__metric--received",
						openKind === "received" && "is-open",
					)}
					onClick={() => toggle("received")}
					aria-expanded={openKind === "received"}
					disabled={!breakdown}
				>
					<span className="iz-outlet-shift-log-summary__metric-label">
						{t.history.metricTotalReceived}
					</span>
					<span className="iz-outlet-shift-log-summary__metric-value">
						{formatOutletHistRm(received)}
					</span>
				</button>
				<button
					type="button"
					className={cn(
						"iz-outlet-shift-log-summary__metric iz-outlet-shift-log-summary__metric--btn",
						"iz-outlet-shift-log-summary__metric--payout",
						openKind === "payout" && "is-open",
					)}
					onClick={() => toggle("payout")}
					aria-expanded={openKind === "payout"}
					disabled={!breakdown}
				>
					<span className="iz-outlet-shift-log-summary__metric-label">
						{t.history.metricTotalPayout}
					</span>
					<span className="iz-outlet-shift-log-summary__metric-value">
						{formatOutletHistRm(payout)}
					</span>
				</button>
			</div>
			{breakdown && openKind ? (
				<ShiftHistoryMoneyBreakdownView breakdown={breakdown} kind={openKind} />
			) : null}
		</article>
	);
}

export function OutletPrHistoryCard({
	rollup,
	rank,
	topPayout,
	rating,
	onTap,
	portal = "outlet",
	agencyPRs,
}: {
	rollup: ShiftHistoryPrRollup;
	rank: number;
	topPayout: number;
	rating?: OutletPrRating;
	onTap?: () => void;
	portal?: "agency" | "outlet";
	agencyPRs?: AgencyManagedPR[];
}) {
	const { t } = usePortalLocale();
	const venueKind = portal === "agency" ? "outlet" : "agency";
	const subtitle =
		rollup.venues.length === 1
			? rollup.venues[0]
			: rollup.venues.length > 1
				? fill(
						venueKind === "outlet"
							? t.history.outletCountMany
							: t.history.agencyCountMany,
						{ n: rollup.venues.length },
					)
				: "—";
	const pct =
		topPayout > 0 ? Math.round((rollup.totalPayout / topPayout) * 100) : 0;
	const pctLabel = fill(t.reports.pctOfTopEarner, {
		pct: rank === 1 ? 100 : pct,
	});

	const content = (
		<article className="iz-outlet-hist-card">
			<div className="iz-outlet-hist-card__head">
				<div className="iz-outlet-hist-card__identity">
					<div className="iz-outlet-hist-avatar-wrap">
						{rank === 1 ? (
							<span
								className="iz-outlet-hist-crown"
								aria-label={t.history.topEarner}
							>
								<Crown className="h-2.5 w-2.5" strokeWidth={2.5} />
							</span>
						) : rank > 1 ? (
							<span
								className="iz-outlet-hist-rank-badge"
								aria-label={fill(t.reports.rankLabel, { rank })}
							>
								{rank}
							</span>
						) : null}
						<OutletPrAvatar
							prId={rollup.prId}
							prName={rollup.prName}
							agencyPRs={agencyPRs}
						/>
					</div>
					<div className="iz-outlet-hist-card__names">
						<div className="iz-outlet-hist-card__name-row">
							<p className="iz-outlet-hist-card__name">{rollup.prName}</p>
							{rating && rating.stars > 0 && (
								<OutletStarPill stars={rating.stars} />
							)}
						</div>
						<p className="iz-outlet-hist-card__agency">{subtitle}</p>
					</div>
				</div>
				<div className="iz-outlet-hist-card__shifts">
					<p className="iz-outlet-hist-card__shift-count">
						{fill(
							rollup.shiftCount === 1
								? t.rosterGrid.shiftCountOne
								: t.rosterGrid.shiftCountMany,
							{ n: rollup.shiftCount },
						)}
					</p>
					<p className="iz-outlet-hist-card__latest">
						{formatLatestLabel(
							rollup.latestDateIso,
							rollup.latestDateDisplay,
							t,
						)}
					</p>
				</div>
			</div>

			<div className="iz-outlet-hist-metrics iz-outlet-hist-metrics--pair">
				<div className="iz-outlet-hist-metric iz-outlet-hist-metric--received">
					<span className="iz-outlet-hist-metric__label">
						<ShiftMetricIconLabel kind="received" total size="lg" />
					</span>
					<span className="iz-outlet-hist-metric__value">
						{formatRM(rollup.totalReceived)}
					</span>
				</div>
				<div className="iz-outlet-hist-metric iz-outlet-hist-metric--payout">
					<span className="iz-outlet-hist-metric__label">
						<ShiftMetricIconLabel kind="payout" total size="lg" />
					</span>
					<span className="iz-outlet-hist-metric__value">
						{formatRM(rollup.totalPayout)}
					</span>
				</div>
			</div>

			<div className="iz-outlet-hist-bar">
				<div className="iz-outlet-hist-bar__track">
					<div
						className={cn(
							"iz-outlet-hist-bar__fill",
							rank === 1 && "iz-outlet-hist-bar__fill--top",
						)}
						style={{ width: `${Math.max(pct, rank === 1 ? 100 : 4)}%` }}
					/>
				</div>
				<span className="iz-outlet-hist-bar__label">{pctLabel}</span>
			</div>
		</article>
	);

	if (onTap) {
		return (
			<button type="button" className="iz-outlet-hist-card-btn" onClick={onTap}>
				{content}
			</button>
		);
	}

	return content;
}
