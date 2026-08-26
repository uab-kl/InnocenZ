import { AgencyCommissionRulesPanel } from "@agency-portal/components/agency/AgencyCommissionRulesPanel";
import { OutletLogoTile } from "@agency-portal/components/agency/OutletLogoTile";
import { PhotoLightbox } from "@agency-portal/components/agency/ProofPhotoViewer";
import { IzPill } from "@agency-portal/components/iz/ui";
import { formatOutletHistRm } from "@agency-portal/components/outlet/outlet-history-ui";
import { WorkspaceTierRatesEditor } from "@agency-portal/components/outlet/WorkspaceTierRatesEditor";
import { useAgencyOutletWorkspace } from "@agency-portal/hooks/use-agency-outlet-workspace";
import { useAgencyOutlets } from "@agency-portal/hooks/use-agency-outlets";
import {
	formatTierSalesTargets,
	formatTierWageRange,
} from "@agency-portal/lib/agency-demo";
import {
	type AgencyOutletAvailableShift,
	type AgencyOutletDayDemand,
	type AgencyOutletSummary,
	groupOutletShiftsTodayFuture,
	outletShiftEventTypeLabel,
	outletShiftIsSpecialEvent,
	outletShiftSourceLabel,
	summarizeOutletDemandTodayFuture,
} from "@agency-portal/lib/agency-outlet-shifts";
import { outletShiftActivePrIds } from "@agency-portal/lib/outlet-demo";
import {
	formatPayTierRowsCompact,
	resolveShiftPayTierRows,
	shiftTierStaffingByPayTier,
} from "@agency-portal/lib/post-job-pay-tiers";
import { fmtDateLabelFromIso } from "@agency-portal/lib/pr-demo";
import { prPhotoSrc } from "@agency-portal/lib/public-asset";
import { DEFAULT_ROSTER_DATE_ISO } from "@agency-portal/lib/roster-availability";
import { useStore } from "@agency-portal/lib/store";
import {
	ArrowLeft,
	Briefcase,
	Calendar,
	ChevronDown,
	Clock,
	MapPin,
	Star,
	ZoomIn,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/** "2026-08-20" reads like a database row — show "Thu · 20 Aug 2026", the same
    friendly form the PR app uses. Demo labels ("Tonight") pass through. */
function prettyShiftDate(date: string): string {
	return /^\d{4}-\d{2}-\d{2}$/.test(date) ? fmtDateLabelFromIso(date) : date;
}

/**
 * Display label for a shift group's day.
 *
 * `groupOutletShiftsTodayFuture` builds `dateLabel` in
 * `agency-outlet-shifts.ts`, where there is no locale to read: it emits the
 * three English sentinels below, or a date already formatted by the shared date
 * helper. Resolving them here keeps that module free of the dictionary, and
 * anything unrecognised — a formatted date, a demo label like "Tonight" —
 * passes straight through rather than blanking the header.
 */
function outletGroupDayLabel(label: string, t: PortalTranslations): string {
	if (label === "Today") return t.outletDetail.today;
	if (label === "Tomorrow") return t.postJob.tomorrow;
	if (label === "Future") return t.outletDetail.future;
	return label;
}

type AgencyOutletDetailViewProps = {
	summary: AgencyOutletSummary;
	shifts: AgencyOutletAvailableShift[];
	dayDemand: AgencyOutletDayDemand[];
	onBack: () => void;
	/**
	 * The venue's `logo_image`, from the same lookup the grid cards use — so the
	 * mark does not vanish the moment you open the outlet you recognised by it.
	 */
	logo?: string | null;
};

export function AgencyOutletDetailView({
	summary,
	shifts,
	dayDemand,
	onBack,
	logo,
}: AgencyOutletDetailViewProps) {
	const { t } = usePortalLocale();
	// The venue's mark, full size on tap (owner: the agency must be able to
	// zoom the logo too, not just the event picture).
	const logoSrc = prPhotoSrc(logo);
	const [logoZoom, setLogoZoom] = useState(false);
	const shiftGroups = useMemo(
		() => groupOutletShiftsTodayFuture(shifts, DEFAULT_ROSTER_DATE_ISO),
		[shifts],
	);
	const demandOverview = useMemo(
		() => summarizeOutletDemandTodayFuture(dayDemand, DEFAULT_ROSTER_DATE_ISO),
		[dayDemand],
	);
	const todayOverview = demandOverview.find(
		(day) =>
			day.dateIso === DEFAULT_ROSTER_DATE_ISO || day.dateLabel === "Today",
	);
	const futureOverview = demandOverview.find((day) => day.dateIso === "future");
	// Same query as the rate table below (react-query dedupes it), so the
	// subtitle can't quote demo money while the table shows the outlet's real
	// rates — `summary.rule` is a demo fixture on a backed session.
	const backendWorkspace = useAgencyOutletWorkspace(summary.outlet).workspace;
	// The venue's real address, from the agency's own outlet registry — the
	// same directory the workspace lookup resolves through.
	const { outlets: registryOutlets } = useAgencyOutlets();
	const registryRow = registryOutlets.find((o) => o.name === summary.outlet);
	const outletAddress = [
		registryRow?.addressLine1,
		registryRow?.addressLine2,
		[registryRow?.postcode, registryRow?.city, registryRow?.state]
			.map((x) => x?.trim())
			.filter(Boolean)
			.join(" "),
	]
		.map((x) => x?.trim())
		.filter(Boolean)
		.join(", ");
	const headWage = backendWorkspace?.basePayPerHour ?? summary.rule.wagePerHour;
	const headDrinkPct = backendWorkspace?.drinkPct ?? summary.rule.drinkPct;
	const headTipPct = backendWorkspace?.tipPct ?? summary.rule.tipPct;

	return (
		<div className="iz-screen iz-outlet-detail-page">
			{/*
			 * The same back control the rest of the app uses, not a second one.
			 *
			 * This was a full-width 44px bar with centred text — a button shaped
			 * like a section header, sitting where every other screen puts a small
			 * pill in the corner. `iz-topbar-back` is that pill; the local class is
			 * kept for placement only.
			 */}
			<button
				type="button"
				className="iz-topbar-back iz-topbar-back--lg iz-outlet-detail-back"
				onClick={onBack}
			>
				<ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2.2} />
				<span className="iz-topbar-back-label">
					{t.outletDetail.returnLabel}
				</span>
			</button>

			<header className="iz-outlet-detail-head">
				{logoSrc ? (
					<button
						type="button"
						className="iz-outlet-detail-head__logo-zoom"
						onClick={() => setLogoZoom(true)}
						aria-label={t.postJob.tapToZoom}
					>
						<OutletLogoTile
							logo={logo}
							className="iz-outlet-detail-head__icon"
						/>
						<span className="iz-zoom-badge" aria-hidden>
							<ZoomIn className="h-3 w-3" />
						</span>
					</button>
				) : (
					<OutletLogoTile logo={logo} className="iz-outlet-detail-head__icon" />
				)}
				{logoZoom && logoSrc && (
					<PhotoLightbox
						photo={logoSrc}
						alt={summary.outlet}
						onClose={() => setLogoZoom(false)}
					/>
				)}
				<div className="min-w-0">
					<h1 className="iz-outlet-detail-head__title">{summary.outlet}</h1>
					<p className="iz-outlet-detail-head__meta">
						{fill(t.outletDetail.headMeta, {
							wage: headWage.toLocaleString("en-MY"),
							drinks: headDrinkPct,
							tips: headTipPct,
						})}
					</p>
					{outletAddress ? (
						<p className="iz-outlet-detail-head__addr">
							<MapPin className="h-3.5 w-3.5" aria-hidden />
							{outletAddress}
						</p>
					) : null}
				</div>
			</header>

			<div className="iz-outlet-detail-kpi-row">
				<OutletDetailKpiCard
					label={t.outletDetail.events}
					value={String(shifts.length)}
					tone="events"
				/>
				<OutletDetailKpiCard
					label={t.outletDetail.today}
					demand={todayOverview?.demand}
					supplied={todayOverview?.supplied}
					sub={
						todayOverview
							? fill(
									todayOverview.eventCount === 1
										? t.outletDetail.eventCountOne
										: t.outletDetail.eventCountMany,
									{ n: todayOverview.eventCount },
								) +
								(todayOverview.openSlots > 0
									? fill(t.outletDetail.openSuffix, {
											n: todayOverview.openSlots,
										})
									: "")
							: undefined
					}
					tone="today"
				/>
				<OutletDetailKpiCard
					label={t.outletDetail.future}
					demand={futureOverview?.demand}
					supplied={futureOverview?.supplied}
					sub={
						futureOverview
							? fill(
									futureOverview.eventCount === 1
										? t.outletDetail.eventCountOne
										: t.outletDetail.eventCountMany,
									{ n: futureOverview.eventCount },
								) +
								(futureOverview.openSlots > 0
									? fill(t.outletDetail.openSuffix, {
											n: futureOverview.openSlots,
										})
									: "")
							: undefined
					}
					tone="future"
				/>
			</div>

			<section className="iz-outlet-detail-section">
				<div className="iz-outlet-detail-section__head">
					<h2 className="iz-outlet-detail-section__title">
						<Star className="h-4 w-4" aria-hidden />
						{t.outletDetail.ratesByPrTier}
					</h2>
					<span className="iz-outlet-detail-section__badge">
						{t.outletDetail.readOnlyOnAgency}
					</span>
				</div>
				<AgencyCommissionRulesPanel outlet={summary.outlet} tableOnly />
			</section>

			<section className="iz-outlet-detail-section">
				<div className="iz-outlet-detail-section__head">
					<h2 className="iz-outlet-detail-section__title">
						<Briefcase className="h-4 w-4" aria-hidden />
						{t.outletDetail.availableShifts}
					</h2>
				</div>
				<p className="iz-outlet-detail-section__hint">
					{fill(t.outletDetail.todayAndFuture, {
						listings: fill(
							shifts.length === 1
								? t.outletDetail.listingCountOne
								: t.outletDetail.listingCountMany,
							{ n: shifts.length },
						),
					})}
				</p>

				{shifts.length === 0 ? (
					<div className="iz-outlet-detail-empty">
						{t.outletDetail.noOpenShiftsMatch}
					</div>
				) : (
					<div className="iz-outlet-detail-shift-groups">
						{shiftGroups.map((group) => (
							<div key={group.dateIso} className="iz-outlet-detail-shift-group">
								<div className="iz-outlet-detail-group-head">
									<span className="iz-outlet-detail-group-head__label">
										{outletGroupDayLabel(group.dateLabel, t)}
									</span>
									<div className="iz-outlet-detail-group-head__stats">
										<span className="iz-outlet-detail-group-head__stats-label">
											{t.outletDetail.demandSupplied}
										</span>
										<span className="iz-outlet-detail-group-head__stats-value">
											{group.demand}
											<span className="iz-outlet-detail-group-head__stats-sep">
												/
											</span>
											<span className="iz-outlet-detail-group-head__stats-supplied">
												{group.supplied}
											</span>
											{group.openSlots > 0 ? (
												<span className="iz-outlet-detail-group-head__stats-open">
													{fill(t.outletDetail.openSuffix, {
														n: group.openSlots,
													})}
												</span>
											) : (
												group.demand > 0 && (
													<span className="iz-outlet-detail-group-head__stats-filled">
														· {t.outletDetail.fullyStaffed}
													</span>
												)
											)}
										</span>
									</div>
								</div>

								<div className="iz-outlet-detail-shift-list">
									{group.shifts.map((shift) =>
										group.dateIso === "future" ? (
											<OutletDetailFutureShiftCard
												key={shift.id}
												shift={shift}
											/>
										) : (
											<OutletDetailTodayShiftCard
												key={shift.id}
												shift={shift}
											/>
										),
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</section>
		</div>
	);
}

function OutletDetailKpiCard({
	label,
	value,
	demand,
	supplied,
	sub,
	tone,
}: {
	label: string;
	value?: string;
	demand?: number;
	supplied?: number;
	sub?: string;
	tone: "events" | "today" | "future";
}) {
	const hasRatio =
		demand != null && supplied != null && (demand > 0 || supplied > 0);

	return (
		<article className={`iz-outlet-detail-kpi iz-outlet-detail-kpi--${tone}`}>
			<p className="iz-outlet-detail-kpi__label">{label}</p>
			{value != null ? (
				<p className="iz-outlet-detail-kpi__value iz-outlet-detail-kpi__value--solo">
					{value}
				</p>
			) : hasRatio ? (
				<p className="iz-outlet-detail-kpi__value">
					{demand}
					<span className="iz-outlet-detail-kpi__sep">/</span>
					<span className="iz-outlet-detail-kpi__supplied">{supplied}</span>
				</p>
			) : (
				<p className="iz-outlet-detail-kpi__value iz-outlet-detail-kpi__value--solo">
					—
				</p>
			)}
			{sub && <p className="iz-outlet-detail-kpi__sub">{sub}</p>}
		</article>
	);
}

function OutletShiftMetric({
	label,
	tone,
	title,
	children,
}: {
	label: string;
	tone: "gold" | "violet" | "ink" | "demand";
	title?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={`iz-outlet-detail-metric iz-outlet-detail-metric--${tone}`}
			title={title}
		>
			<span className="iz-outlet-detail-metric__label">{label}</span>
			<div className="iz-outlet-detail-metric__value">{children}</div>
		</div>
	);
}

function OutletDemandSuppliedStat({
	demand,
	supplied,
	openSlots,
}: {
	demand: number;
	supplied: number;
	openSlots?: number;
}) {
	const { t } = usePortalLocale();
	return (
		<div className="iz-outlet-detail-metric iz-outlet-detail-metric--demand">
			<span className="iz-outlet-detail-metric__label">
				{t.outletDetail.demandSupplied}
			</span>
			<span className="iz-outlet-detail-metric__nums">
				<span>{demand}</span>
				<span className="iz-outlet-detail-metric__sep">/</span>
				<span className="iz-outlet-detail-metric__supplied">{supplied}</span>
			</span>
			{/* A met demand says so out loud. This card used to show the open-slot
			    line only while slots WERE open, so a fully staffed shift and a shift
			    nobody had looked at yet differed by an absent line — and the shift
			    was dropped from the list entirely anyway. "Fully staffed" is the
			    answer to the question this screen is actually asked: did we fill it? */}
			{openSlots != null && openSlots > 0 ? (
				<span className="iz-outlet-detail-metric__open">
					{fill(
						openSlots === 1
							? t.rosterGrid.slotCountOne
							: t.rosterGrid.slotCountMany,
						{ n: openSlots },
					)}
				</span>
			) : (
				demand > 0 && (
					<span className="iz-outlet-detail-metric__filled">
						{t.outletDetail.fullyStaffed}
					</span>
				)
			)}
		</div>
	);
}

function OutletShiftTierRequestTable({
	shift,
}: {
	shift: AgencyOutletAvailableShift;
}) {
	const { t } = usePortalLocale();
	const shifts = useStore((s) => s.shifts);
	const agencyPRs = useStore((s) => s.agencyPRs);
	const outletWorkspace = useStore((s) => s.outletWorkspace);

	const tierStaffingByPayTier = useMemo(() => {
		const postedShiftId =
			shift.source === "posted" && shift.id.startsWith("posted-")
				? shift.id.slice("posted-".length)
				: shift.linkedShiftId;
		// DEMO ONLY. On a real session this lookup finds nothing: `store.shifts` is
		// the demo slice, while a backed row's id is a backend uuid — which is why
		// `bookedPrIds` came back empty and the whole Supplied column read 0 with a
		// PR plainly on the shift. `demandCut` / `releasedEarlyPrIds` have no
		// backend column at all, so they are demo-only by nature.
		const postedShift = postedShiftId
			? shifts.find((s) => s.id === postedShiftId)
			: undefined;
		const bookedPrIds = postedShift ? outletShiftActivePrIds(postedShift) : [];
		return shiftTierStaffingByPayTier({
			payTierRows: shift.payTierRows,
			quantity: shift.quantity,
			demandCut: postedShift?.demandCut,
			releasedEarlyPrIds: postedShift?.releasedEarlyPrIds,
			tierRates: shift.tierRates,
			bookedPrIds,
			agencyPRs,
			// The real answer when there is one, and it WINS whole (see
			// shiftTierStaffingByPayTier) — the server counts seats per tier across
			// every agency on the shift, which no agency can do for itself: the PRs
			// another agency sent are invisible here, and their tier is a fact about
			// THAT agency's membership, not this one's.
			suppliedByTierBucket: shift.suppliedByTierBucket,
		});
	}, [
		shift.payTierRows,
		shift.quantity,
		shift.tierRates,
		shift.id,
		shift.source,
		shift.linkedShiftId,
		shift.suppliedByTierBucket,
		shifts,
		agencyPRs,
	]);

	const hasAnyDemand = Object.values(tierStaffingByPayTier).some(
		(row) => row.demand > 0,
	);
	if (!hasAnyDemand) return null;

	return (
		<div className="iz-outlet-detail-pay-tiers">
			<p className="iz-outlet-detail-pay-tiers__label">
				{t.agencyPanels.payAndTiers}
			</p>
			<WorkspaceTierRatesEditor
				tierRates={shift.tierRates}
				commissionOnlyRates={outletWorkspace.commissionOnlyRates}
				onPatchTier={() => {}}
				onPatchCommissionOnly={() => {}}
				readOnly
				tierStaffingByPayTier={tierStaffingByPayTier}
			/>
		</div>
	);
}

function ShiftSourceBadge({ shift }: { shift: AgencyOutletAvailableShift }) {
	const { t } = usePortalLocale();
	if (shift.source === "tied-offer") {
		return (
			<IzPill variant="violet" className="iz-outlet-detail-shift-badge">
				{t.outletDetail.agencyOffer}
			</IzPill>
		);
	}
	// Display-only status tag — no chevron: this never opens anything, and the
	// arrow made it read as a dropdown (owner, 20 Aug).
	return (
		<IzPill variant="ink" className="iz-outlet-detail-shift-badge">
			{outletShiftSourceLabel(shift.source, t)}
		</IzPill>
	);
}

function OutletShiftCardDetails({
	shift,
	showBriefingInSummary = false,
}: {
	shift: AgencyOutletAvailableShift;
	showBriefingInSummary?: boolean;
}) {
	const { t } = usePortalLocale();
	const eventType = outletShiftEventTypeLabel(shift, t);
	const isSpecialEvent = outletShiftIsSpecialEvent(shift);
	const coverSrc = apiAssetUrl(shift.templateCoverImage);
	const [coverZoom, setCoverZoom] = useState(false);

	return (
		<>
			{/* The event picture leads (owner: "where is the event picture?") —
			    the kind badge rides on it, so the card stays simple. Tapping it
			    opens the FULL image (owner: "agency can zoom in to see"). */}
			{coverSrc && (
				<button
					type="button"
					className="iz-agency-shift-cover"
					aria-label={t.postJob.tapToZoom}
					onClick={(e) => {
						// The future cards render this inside a <summary> — a plain
						// click would also toggle the card open/shut.
						e.preventDefault();
						e.stopPropagation();
						setCoverZoom(true);
					}}
				>
					<img src={coverSrc} alt="" loading="lazy" />
					<span
						className={
							isSpecialEvent
								? "iz-agency-shift-cover__badge iz-agency-shift-cover__badge--special"
								: "iz-agency-shift-cover__badge"
						}
					>
						{eventType}
					</span>
					<span className="iz-zoom-badge" aria-hidden>
						<ZoomIn className="h-3 w-3" />
					</span>
				</button>
			)}
			{coverZoom && coverSrc && (
				<PhotoLightbox
					photo={coverSrc}
					alt={shift.event}
					onClose={() => setCoverZoom(false)}
				/>
			)}
			<div className="iz-outlet-detail-shift-card__metrics">
				<OutletDemandSuppliedStat
					demand={shift.demandSlots}
					supplied={shift.suppliedSlots}
					openSlots={shift.openSlots}
				/>
				<OutletShiftMetric label={t.outletDetail.estPayout} tone="gold">
					{formatOutletHistRm(shift.payEstimate)}
				</OutletShiftMetric>
				{!shift.templateCoverImage && (
					<OutletShiftMetric
						label={t.outletDetail.eventType}
						tone={isSpecialEvent ? "gold" : "ink"}
						title={eventType}
					>
						{eventType}
					</OutletShiftMetric>
				)}
			</div>

			{showBriefingInSummary && shift.briefing && (
				<div className="iz-outlet-detail-shift-note iz-outlet-detail-shift-note--inline">
					{shift.briefing}
				</div>
			)}
		</>
	);
}

function OutletShiftTierPreview({
	shift,
}: {
	shift: AgencyOutletAvailableShift;
}) {
	const tierRequest = formatPayTierRowsCompact(
		resolveShiftPayTierRows({
			payTierRows: shift.payTierRows,
			quantity: shift.quantity,
			tierRates: shift.tierRates,
		}),
	);
	const targetPay = formatTierWageRange(shift.tierRates);
	const salesTargets = formatTierSalesTargets(shift.tierRates);
	const line = [tierRequest, targetPay, salesTargets]
		.filter(Boolean)
		.join(" · ");
	if (!line) return null;

	return (
		<p className="iz-outlet-detail-shift-card__preview group-open:hidden">
			{line}
		</p>
	);
}

function OutletDetailTodayShiftCard({
	shift,
}: {
	shift: AgencyOutletAvailableShift;
}) {
	const { t } = usePortalLocale();
	return (
		<details className="iz-outlet-detail-shift-card group">
			<summary>
				<div className="iz-outlet-detail-shift-card__main">
					<div className="iz-outlet-detail-shift-card__top">
						{/* No head thumbnail — the card's big cover below already
						    shows the SAME picture (owner: no duplicates). */}
						<div className="min-w-0 flex-1">
							<p className="iz-outlet-detail-shift-card__title">
								{shift.event}
							</p>
							<div className="iz-outlet-detail-shift-card__when">
								<span>
									<Calendar className="h-3.5 w-3.5" aria-hidden />
									{prettyShiftDate(shift.date)}
								</span>
								<span>
									<Clock className="h-3.5 w-3.5" aria-hidden />
									{shift.shift}
								</span>
							</div>
						</div>
						<ShiftSourceBadge shift={shift} />
					</div>

					<OutletShiftCardDetails shift={shift} showBriefingInSummary />
					<OutletShiftTierPreview shift={shift} />
				</div>
				<ChevronDown
					className="iz-outlet-detail-shift-card__chevron"
					aria-hidden
				/>
			</summary>

			<div className="iz-outlet-detail-shift-card__body">
				{/* The VALUE is the venue's own stored list — only the label moves. */}
				{shift.languages && (
					<p className="iz-outlet-detail-shift-meta">
						{fill(t.agencyPanels.languagesLine, { langs: shift.languages })}
					</p>
				)}
				<OutletShiftTierRequestTable shift={shift} />
			</div>
		</details>
	);
}

function OutletDetailFutureShiftCard({
	shift,
}: {
	shift: AgencyOutletAvailableShift;
}) {
	const { t } = usePortalLocale();
	return (
		<details className="iz-outlet-detail-shift-card iz-outlet-detail-shift-card--future group">
			<summary>
				<div className="iz-outlet-detail-shift-card__main">
					<div className="iz-outlet-detail-shift-future__head">
						<div className="min-w-0 flex-1">
							<p className="iz-outlet-detail-shift-card__title">
								{shift.event}
							</p>
							<p className="iz-outlet-detail-shift-future__sub">
								{prettyShiftDate(shift.date)} · {shift.shift} ·{" "}
								{shift.demandSlots}/{shift.suppliedSlots}
								{shift.openSlots > 0
									? fill(t.outletDetail.openSuffix, { n: shift.openSlots })
									: ""}
							</p>
						</div>
						<div className="iz-outlet-detail-shift-future__aside">
							<p className="iz-outlet-detail-shift-future__pay">
								{formatOutletHistRm(shift.payEstimate)}
							</p>
							<ShiftSourceBadge shift={shift} />
						</div>
					</div>

					<OutletShiftCardDetails shift={shift} showBriefingInSummary />
					<OutletShiftTierPreview shift={shift} />
				</div>
				<ChevronDown
					className="iz-outlet-detail-shift-card__chevron"
					aria-hidden
				/>
			</summary>

			<div className="iz-outlet-detail-shift-card__body">
				{/* The VALUE is the venue's own stored list — only the label moves. */}
				{shift.languages && (
					<p className="iz-outlet-detail-shift-meta">
						{fill(t.agencyPanels.languagesLine, { langs: shift.languages })}
					</p>
				)}
				<OutletShiftTierRequestTable shift={shift} />
			</div>
		</details>
	);
}
