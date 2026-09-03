import { PhotoLightbox } from "@agency-portal/components/agency/ProofPhotoViewer";
import { IzPill } from "@agency-portal/components/iz/ui";
// import { OutletSealReview } from "@agency-portal/components/outlet/OutletSealReview";
import {
	OUTLET_OPEN_CUTLOST_EVENT,
	OutletCutLossActions,
} from "@agency-portal/components/outlet/OutletCutLossActions";
import { OutletShiftSalesPanel } from "@agency-portal/components/outlet/OutletLogSales";
import {
	OutletActionButton,
	OutletApplicantRow,
	OutletStatChip,
	OutletTargetActualCard,
} from "@agency-portal/components/outlet/outlet-portal-ui";
import { WorkspaceTierRatesEditor } from "@agency-portal/components/outlet/WorkspaceTierRatesEditor";
import { useOutletShiftActions } from "@agency-portal/hooks/use-outlet-shift-actions";
import { useOutletWorkspace } from "@agency-portal/hooks/use-outlet-workspace";
import type {
	AgencyManagedPR,
	AgencyRosterSlot,
} from "@agency-portal/lib/agency-demo";
import { resolveOutletShiftDateIso } from "@agency-portal/lib/agency-outlet-shifts";
import { getLiveTodayIso } from "@agency-portal/lib/demo-clock";
import {
	formatOutletPriceRm,
	formatOutletShiftMetricAmount,
	formatShiftDrinkPricingSummary,
	formatShiftEventTypeSummary,
	OUTLET_PR_TONIGHT_SECTION_ID,
	OUTLET_REDUCE_CUTLOST_SECTION_ID,
	OUTLET_SERVICE_ENTITLEMENT_SECTION_ID,
	outletShiftActivePrIds,
	outletShiftActualLaborCostForShift,
	outletShiftBestEffortSaveCredited,
	outletShiftCutLossAdjustmentsLabel,
	outletShiftCutLossForShift,
	outletShiftDemandSupplied,
	outletShiftTargetLaborCost,
	outletShiftTargetSalesForShift,
	resolveShiftTierRates,
	scrollToOutletLaborCostReport,
	scrollToOutletLiveSales,
	shiftDrinkMenuDetailLines,
} from "@agency-portal/lib/outlet-demo";
import { outletShiftDisplayLiveSales } from "@agency-portal/lib/outlet-financial-sync";
import { outletMatches } from "@agency-portal/lib/portal-sync";
import { shiftTierStaffingByPayTier } from "@agency-portal/lib/post-job-pay-tiers";
import { shiftEndInstant } from "@agency-portal/lib/shift-window";
import { specialServicesForOutlet } from "@agency-portal/lib/special-service-actions";
import { type ShiftRequest, useStore } from "@agency-portal/lib/store";
import { trafficLevelForRatio } from "@agency-portal/lib/traffic-status";
import { useOutletCan } from "@agency-portal/lib/use-portal-can";
import { cn } from "@agency-portal/lib/utils";
import { Link } from "@tanstack/react-router";
import {
	Check,
	CheckCircle2,
	Clock,
	Lock,
	PlayCircle,
	ZoomIn,
} from "lucide-react";
import { useMemo, useState } from "react";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { dressCodeLabel } from "@/lib/portal-i18n/language-label";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/* Resolvers, not strings — module scope runs before any hook. The record
 * KEYS are `shift.status`, the stored enum, and are untouched. */
const STATUS_META = {
	sealed: {
		tone: "iz-pill-ink",
		icon: Lock,
		label: (t: PortalTranslations) => t.today.statusSealed,
	},
	confirmed: {
		tone: "iz-pill-green",
		icon: CheckCircle2,
		label: (t: PortalTranslations) => t.calendar.legendLive,
	},
	open: {
		tone: "iz-pill-amber",
		icon: PlayCircle,
		label: (t: PortalTranslations) => t.calendar.legendOpen,
	},
	draft: {
		tone: "iz-pill-violet",
		icon: Clock,
		label: (t: PortalTranslations) => t.calendar.legendDraft,
	},
} as const;

/** A confirmed shift reads as expired once its slot has finished, by the clock. */
const EXPIRED_META = {
	tone: "iz-pill-ink",
	icon: Clock,
	label: (t: PortalTranslations) => t.calendar.legendExpired,
} as const;

/**
 * Has this shift's slot already finished?
 *
 * `shift.status` says what was AGREED, not what time it is, so a 10:00–11:00
 * shift still read "Live" at 11:42 (owner, 3 Sep 2026: "the shift must follow
 * the actual time — if time is exceed then the live will show expired"). The
 * stored status is deliberately not touched: nothing about the booking changed
 * when the hour passed, and only the badge was claiming otherwise.
 *
 * `shiftEndInstant` is the shared parser, so an overnight 22:00–04:00 expires
 * at 4am the NEXT day rather than the moment it starts. A slot that is not a
 * time range returns null and the shift keeps its stored badge — unknown is not
 * expired.
 */
function shiftHasExpired(shift: ShiftRequest): boolean {
	if (shift.status !== "confirmed") return false;
	const endsAt = shiftEndInstant(
		resolveOutletShiftDateIso(shift.date, shift.dateIso, getLiveTodayIso()),
		shift.shift,
	);
	return !!endsAt && endsAt.getTime() <= Date.now();
}

export function OutletShiftStatusBadge({ shift }: { shift: ShiftRequest }) {
	const { t } = usePortalLocale();
	const meta = shiftHasExpired(shift)
		? EXPIRED_META
		: (STATUS_META[shift.status] ?? STATUS_META.draft);
	const StatusIcon = meta.icon;
	return (
		<span className={cn("iz-pill shrink-0 !py-0.5 !text-[9px]", meta.tone)}>
			<StatusIcon className="mr-0.5 inline h-2.5 w-2.5" />
			{meta.label(t)}
		</span>
	);
}

export function OutletShiftDetailPanel({
	shift,
	variant = "future",
	hideLogSales = false,
	hideCutlost = false,
	staffingAgency,
	roster: rosterOverride,
	agencyPrs: agencyPrsOverride,
}: {
	shift: ShiftRequest;
	variant?: "home" | "future";
	hideLogSales?: boolean;
	/** Home page renders cutlost at page bottom — hide inline block here. */
	hideCutlost?: boolean;
	/** When set, show linked agency instead of destination labels. */
	staffingAgency?: string;
	/**
	 * Backend roster slots + PR records for a real outlet session; `shift.prs` is
	 * resolved against them, so they travel together. Omitted on demo sessions.
	 */
	roster?: AgencyRosterSlot[];
	agencyPrs?: AgencyManagedPR[];
}) {
	const { t } = usePortalLocale();
	// THE VENUE'S REAL RATE CARD, not the demo store's.
	//
	// The store slice is blank-to-placeholder on a real outlet session, and its
	// placeholder ladder (RM 50/55/65/80, drink 0/1/2/3/4) is what this table showed
	// for every tier the shift did not name — beside the shift's own Tier I at
	// RM 500 / 10% / 15%, which made the card look half-broken rather than wrong.
	// Post Job already picks the backed copy this way; the two screens must agree
	// about what the venue charges.
	const storeWorkspace = useStore((s) => s.outletWorkspace);
	const backedWorkspace = useOutletWorkspace();
	const outletWorkspace =
		backedWorkspace.backed && backedWorkspace.workspace
			? backedWorkspace.workspace
			: storeWorkspace;
	const storeAgencyPRs = useStore((s) => s.agencyPRs);
	const storeRoster = useStore((s) => s.agencyRoster);
	const agencyPRs = agencyPrsOverride ?? storeAgencyPRs;
	const agencyRoster = rosterOverride ?? storeRoster;
	const prReceiptScans = useStore((s) => s.prReceiptScans);
	const specialServiceOrders = useStore((s) => s.specialServiceOrders);
	const {
		confirmShift: confirmShiftDemo,
		/* sealShift, */ shiftApplicants,
		respondToApplicant,
	} = useStore();
	// On a real outlet session the confirm persists to the backend; a demo
	// session keeps the local store. `backed` decides which path runs.
	const {
		backed,
		confirmShift: confirmShiftBackend,
		isConfirming,
	} = useOutletShiftActions();
	const confirmShift = (shiftId: string) => {
		if (backed) {
			confirmShiftBackend(shiftId).catch(() => {});
		} else {
			confirmShiftDemo(shiftId);
		}
	};

	const can = useOutletCan();
	const canLogSales = can("logSales");
	const canConfirm = can("confirmShift");
	// const canSeal = can("sealShift");
	const canStaff = can("manageShiftStaffing");

	// const [sealOpen, setSealOpen] = useState(false);

	const showApplicantActions = variant !== "future";
	const todayIso = getLiveTodayIso();
	const shiftDateIso = resolveOutletShiftDateIso(
		shift.date,
		shift.dateIso,
		todayIso,
	);
	const showCutlost = variant === "home" || shiftDateIso === todayIso;
	const applicants = shiftApplicants.filter(
		(a) => a.shiftId === shift.id && a.status === "pending",
	);
	const outletRequests = applicants.filter(
		(a) => a.source === "outlet_request",
	);
	const selfApplicants = applicants.filter(
		(a) => a.source !== "outlet_request",
	);
	const visibleApplicants = showApplicantActions
		? selfApplicants
		: outletRequests;

	const drinkLines = shiftDrinkMenuDetailLines(
		shift,
		outletWorkspace.drinkMenu ?? [],
	);
	const eventTypeLabel = formatShiftEventTypeSummary(
		shift.eventKind ?? "normal",
		t,
		shift.specialEventType,
		shift.customSpecialEventName,
	);
	// The event picture (owner's ask, 19 Aug): a shift posted from a template
	// shows that card's cover. It arrives ON the shift payload (joined
	// server-side, 0128) — an agency may not read another org's template
	// list, so a lookup would blank exactly the cross-org surfaces that need it.
	const eventCover = apiAssetUrl(shift.templateCoverImage);
	const [coverZoom, setCoverZoom] = useState(false);
	const drinkPricingLabel = formatShiftDrinkPricingSummary(
		shift,
		outletWorkspace.drinkMenu ?? [],
		t,
	);
	const tierRates = resolveShiftTierRates(shift, outletWorkspace);
	const prTierById = Object.fromEntries(
		agencyPRs.map((pr) => [pr.id, pr.trainingLevel]),
	);
	const targetSales = outletShiftTargetSalesForShift(shift, tierRates);
	const targetCost = outletShiftTargetLaborCost(shift, tierRates, prTierById);
	const actualCost = outletShiftActualLaborCostForShift(
		shift,
		tierRates,
		prTierById,
	);
	const rosterTonight = useMemo(
		() =>
			agencyRoster.filter(
				(slot) =>
					outletMatches(slot.outlet, shift.outletName) &&
					slot.dateIso === shiftDateIso &&
					(shift.prs ?? []).includes(slot.prId),
			),
		[agencyRoster, shift.outletName, shiftDateIso, shift.prs],
	);
	const tonightSpecialServiceRm = useMemo(
		() =>
			specialServicesForOutlet(specialServiceOrders, shift.outletName)
				.filter(
					(r) =>
						r.dateIso === shiftDateIso &&
						r.status !== "declined" &&
						r.status !== "rejected",
				)
				.reduce((sum, r) => sum + r.amountIn, 0),
		[specialServiceOrders, shift.outletName, shiftDateIso],
	);
	const displaySales = useMemo(
		() =>
			outletShiftDisplayLiveSales(
				shift,
				hideCutlost
					? {
							outletName: shift.outletName,
							drinkMenu: outletWorkspace.drinkMenu ?? [],
							rosterSlots: rosterTonight,
							receiptScans: prReceiptScans,
							specialServiceRm: tonightSpecialServiceRm,
						}
					: undefined,
			),
		[
			shift,
			hideCutlost,
			outletWorkspace.drinkMenu,
			rosterTonight,
			prReceiptScans,
			tonightSpecialServiceRm,
		],
	);
	const cutLoss = outletShiftCutLossForShift(shift, tierRates, prTierById);
	const bestEffortSaved = outletShiftBestEffortSaveCredited(
		shift,
		tierRates,
		prTierById,
	);
	const { demand: staffingDemand, supplied } = outletShiftDemandSupplied(shift);
	const adjustmentsLabel = outletShiftCutLossAdjustmentsLabel(shift, t);
	const tierStaffingByPayTier = useMemo(
		() =>
			shiftTierStaffingByPayTier({
				payTierRows: shift.payTierRows,
				quantity: shift.quantity,
				demandCut: shift.demandCut,
				releasedEarlyPrIds: shift.releasedEarlyPrIds,
				tierRates,
				bookedPrIds: outletShiftActivePrIds({
					prs: shift.prs,
					releasedEarlyPrIds: shift.releasedEarlyPrIds,
				}),
				agencyPRs,
				suppliedByTierBucket: shift.suppliedByTierBucket,
			}),
		[
			shift.suppliedByTierBucket,
			shift.payTierRows,
			shift.quantity,
			shift.demandCut,
			shift.releasedEarlyPrIds,
			shift.prs,
			tierRates,
			agencyPRs,
		],
	);
	const demandLevel = trafficLevelForRatio(supplied, staffingDemand);
	const demandTone =
		demandLevel === "green"
			? "green"
			: demandLevel === "yellow"
				? "warn"
				: "violet";
	const cutlostSectionId = hideCutlost
		? OUTLET_REDUCE_CUTLOST_SECTION_ID
		: `${OUTLET_REDUCE_CUTLOST_SECTION_ID}-${shift.id}`;
	const scrollToCutlost = () => {
		window.dispatchEvent(
			new CustomEvent(OUTLET_OPEN_CUTLOST_EVENT, {
				detail: { sectionId: cutlostSectionId },
			}),
		);
		document
			.getElementById(cutlostSectionId)
			?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	return (
		<>
			<div className="px-3.5 pb-3.5 pt-2">
				{/* The raw window used to print here whenever no agency was named —
				    unreachable in practice, because the name always fell back to a
				    demo literal. Now that an unnameable agency correctly renders
				    nothing, this fired on real sessions and repeated the sheet
				    header's own "10pm – 4am" as an unformatted "22:00 — 04:00"
				    directly beneath it. The header already states the window, and a
				    second copy in a different format reads as two different facts. */}
				{eventCover && (
					<button
						type="button"
						className="iz-event-cover-zoom w-full"
						onClick={(e) => {
							e.preventDefault();
							setCoverZoom(true);
						}}
					>
						<img
							className="iz-shift-event-cover"
							src={eventCover}
							alt=""
							loading="lazy"
						/>
						<span className="iz-zoom-badge" aria-hidden>
							<ZoomIn className="h-3 w-3" />
						</span>
					</button>
				)}
				{coverZoom && eventCover && (
					<PhotoLightbox
						photo={eventCover}
						alt={shift.event}
						onClose={() => setCoverZoom(false)}
					/>
				)}
				<div className="space-y-0.5">
					<p className="iz-tiny iz-muted2">
						<span className="text-[var(--iz-muted)]">
							{t.today.eventTypePrefix}{" "}
						</span>
						{eventTypeLabel}
					</p>
					<p className="iz-tiny iz-muted2">
						<Link
							to="/outlet/workspace"
							hash={OUTLET_SERVICE_ENTITLEMENT_SECTION_ID}
							className="text-[var(--iz-muted)] underline-offset-2 transition-colors hover:text-[var(--iz-txt)] hover:underline"
						>
							{t.today.serviceEntitlement}
						</Link>
						<span className="text-[var(--iz-muted)]"> · </span>
						{drinkPricingLabel}
					</p>
					{shift.eventKind === "special" && drinkLines.length > 0 && (
						<p className="iz-tiny iz-muted2 leading-relaxed">
							{drinkLines.map((d, i) => (
								<span key={d.name}>
									{i > 0 ? " · " : null}
									<span
										className={d.changed ? "text-[var(--iz-gold)]" : undefined}
									>
										{d.name} RM {formatOutletPriceRm(d.priceRm)}
									</span>
								</span>
							))}
						</p>
					)}
				</div>
				{/*
					The venue's own asks, read back off the shift. This row existed
					before the data did: `dressCode` had no column behind it (0132), so
					on a real session it was always undefined and the line never drew —
					the code looked finished and the screen showed nothing. Languages
					joins it here because the two are one thought ("who am I asking for,
					and how should they turn up"), and because this panel is where the
					venue checks what it actually posted.
				*/}
				{(shift.dressCode || shift.languages || staffingAgency) && (
					<p className="iz-tiny iz-muted2 mt-0.5">
						{shift.dressCode && (
							<>
								<span className="text-[var(--iz-muted)]">
									{t.today.dressCodeLabel}{" "}
								</span>
								{dressCodeLabel(shift.dressCode, t)}
							</>
						)}
						{shift.dressCode && shift.languages ? " · " : null}
						{shift.languages && (
							<>
								<span className="text-[var(--iz-muted)]">
									{t.today.languagesLabel}{" "}
								</span>
								{shift.languages}
							</>
						)}
						{(shift.dressCode || shift.languages) && staffingAgency
							? " · "
							: null}
						{staffingAgency}
					</p>
				)}

				<div className="mt-3">
					<div className="iz-outlet-shift-kpi-row">
						<OutletStatChip
							label={t.calendar.demandSupplied}
							value={`${staffingDemand} / ${supplied}`}
							tone={demandTone}
							onClick={() => {
								document
									.getElementById(OUTLET_PR_TONIGHT_SECTION_ID)
									?.scrollIntoView({ behavior: "smooth", block: "start" });
							}}
						/>
						<OutletTargetActualCard
							label={t.today.sales}
							target={targetSales}
							actual={displaySales}
							onClick={hideCutlost ? scrollToOutletLiveSales : undefined}
						/>
						<OutletTargetActualCard
							label={t.today.laborCost}
							target={targetCost}
							actual={actualCost}
							lowerIsBetter
							onClick={hideCutlost ? scrollToOutletLaborCostReport : undefined}
						/>
						<OutletStatChip
							label={t.today.cutlost}
							value={formatOutletShiftMetricAmount(cutLoss)}
							tone={cutLoss > 0 ? "danger" : "neutral"}
							onClick={scrollToCutlost}
						/>
					</div>
				</div>

				{(adjustmentsLabel || bestEffortSaved > 0) && (
					<p className="iz-tiny iz-muted2 mt-2 text-center">
						Posted {shift.quantity}
						{adjustmentsLabel ? ` · ${adjustmentsLabel}` : ""}
						{bestEffortSaved > 0
							? fill(t.today.savedAmount, {
									amount: formatOutletShiftMetricAmount(bestEffortSaved),
								})
							: ""}
					</p>
				)}

				{canStaff &&
					shift.status === "confirmed" &&
					showCutlost &&
					!hideCutlost && (
						<OutletCutLossActions shift={shift} sectionId={cutlostSectionId} />
					)}

				<div className="mt-2.5">
					<WorkspaceTierRatesEditor
						tierRates={tierRates}
						commissionOnlyRates={outletWorkspace.commissionOnlyRates}
						onPatchTier={() => {}}
						onPatchCommissionOnly={() => {}}
						readOnly
						tierStaffingByPayTier={tierStaffingByPayTier}
					/>
				</div>

				{canStaff &&
					visibleApplicants.length > 0 &&
					shift.status !== "sealed" && (
						<div className="mt-3 space-y-2">
							<div className="flex items-center justify-between gap-2">
								<p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--iz-muted2)]">
									{showApplicantActions
										? t.today.applicants
										: t.today.requestedPrs}
								</p>
								<IzPill variant="amber" className="!py-0.5 !text-[9px]">
									{visibleApplicants.length} waiting
								</IzPill>
							</div>
							{!showApplicantActions && (
								<p className="text-[10px] leading-snug text-[var(--iz-muted2)]">
									{t.today.agencyApproves}
								</p>
							)}
							{visibleApplicants.map((a) =>
								showApplicantActions ? (
									<OutletApplicantRow
										key={a.id}
										name={a.prName}
										meta={
											// A score only when there is one — `rating: 0` is "never
											// rated", not one star.
											a.rating > 0 ? (
												<IzPill variant="gold" className="!py-0.5 !text-[9px]">
													{a.rating}★
												</IzPill>
											) : undefined
										}
										onAccept={() => respondToApplicant(a.id, true)}
										onDecline={() => respondToApplicant(a.id, false)}
									/>
								) : (
									<div
										key={a.id}
										className="flex items-center justify-between gap-2 rounded-xl border border-[var(--iz-line2)] bg-white/[0.02] px-3 py-2"
									>
										<span className="text-xs">
											{a.prName}
											{a.rating > 0 ? ` · ${a.rating}★` : ""}
										</span>
										<IzPill variant="amber" className="!py-0.5 !text-[9px]">
											{t.today.pendingAgency}
										</IzPill>
									</div>
								),
							)}
						</div>
					)}

				{canLogSales && shift.status === "confirmed" && !hideLogSales && (
					<div className="mt-3">
						<OutletShiftSalesPanel
							shiftId={shift.id}
							label={t.today.logSales}
							collapsible
						/>
					</div>
				)}
				{canLogSales && shift.status === "sealed" && (
					<p className="iz-tiny iz-muted mt-2">{t.today.salesLocked}</p>
				)}

				<div className="mt-3 space-y-2">
					{canConfirm &&
						showApplicantActions &&
						shift.status !== "confirmed" &&
						shift.status !== "sealed" && (
							<OutletActionButton
								icon={Check}
								title={t.today.confirmStaffing}
								hint={t.today.confirmStaffingHint}
								tone="green"
								disabled={isConfirming}
								onClick={() => confirmShift(shift.id)}
							/>
						)}
					{/* Seal shift — disabled until agency payroll link is wired
          {canSeal && shift.status === "confirmed" && (
            <OutletActionButton
              icon={Lock}
              title={t.today.sealShift}
              hint={t.today.sealShiftHint}
              tone="gold"
              onClick={() => setSealOpen(true)}
            />
          )}
          */}
					{shift.status === "sealed" && (
						<div className="flex justify-center py-1">
							<IzPill variant="green">{t.today.payrollSent}</IzPill>
						</div>
					)}
				</div>
			</div>

			{/* <OutletSealReview
        shift={shift}
        open={sealOpen}
        onClose={() => setSealOpen(false)}
        onConfirm={() => {
          sealShift(shift.id);
          setSealOpen(false);
        }}
      /> */}
		</>
	);
}
