import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { IzCardTitle, IzPill } from "@agency-portal/components/iz/ui";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import { useCutlostRequests } from "@agency-portal/hooks/use-cutlost-requests";
import { recommendBestEffortCutlost } from "@agency-portal/lib/outlet-cutlost-recommendations";
import { cutlostRequestTitle } from "@agency-portal/lib/outlet-cutlost-requests";
import {
	OUTLET_CUTLOSS_BEST_EFFORT_UNUSED_SHARE,
	OUTLET_REDUCE_CUTLOST_SECTION_ID,
	outletPlanningReleaseClock,
	outletShiftBestEffortSaveCredited,
	outletShiftCutLossAdjustmentsLabel,
	outletShiftCutLossForShift,
	outletShiftCutLossSavings,
	outletShiftDemandSupplied,
	outletShiftPlannedLaborPerSlot,
	outletShiftReleasedUnusedWagesTotal,
	resolveShiftTierRates,
} from "@agency-portal/lib/outlet-demo";
import type { ShiftRequest } from "@agency-portal/lib/store";
import { useStore } from "@agency-portal/lib/store";
import { useOutletCan } from "@agency-portal/lib/use-portal-can";
import { cn } from "@agency-portal/lib/utils";
import { Clock, Sparkles, TrendingDown, UserMinus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

function formatRm(amount: number): string {
	return `RM ${Math.round(amount).toLocaleString("en-MY")}`;
}

function formatCutLossSavings(
	savings: number,
	cutLoss: number,
	t: PortalTranslations,
): string | null {
	if (savings <= 0) return null;
	if (cutLoss > 0 && savings >= cutLoss - 1) return t.today.clearsCutlost;
	return `−${formatRm(savings)}`;
}

export const OUTLET_OPEN_CUTLOST_EVENT = "outlet:open-cutlost";

export function OutletCutLossActions({
	shift,
	className,
	sectionId = OUTLET_REDUCE_CUTLOST_SECTION_ID,
}: {
	shift: ShiftRequest;
	className?: string;
	/** DOM id for scroll targets — unique per shift when inline in a list. */
	sectionId?: string;
}) {
	const { t } = usePortalLocale();
	/*
	 * Cut-loss reduces booked slots on a live shift — a write, and the server
	 * refuses it for a view-only Director. This component had NO permission check
	 * of its own and neither render site applied one, so the button was visible to
	 * every outlet role; without this gate the backend guard turns it into a 403
	 * on click rather than an action that was never offered.
	 */
	const canRequestCutLoss = useOutletCan()("requestCutLoss");
	const outletWorkspace = useStore((s) => s.outletWorkspace);
	const agencyPRs = useStore((s) => s.agencyPRs);
	const pendingCutlostRequests = useStore((s) => s.pendingCutlostRequests);
	const requestOutletCutlostReduction = useStore(
		(s) => s.requestOutletCutlostReduction,
	);

	const tierRates = resolveShiftTierRates(shift, outletWorkspace);
	const prTierById = Object.fromEntries(
		agencyPRs.map((pr) => [pr.id, pr.trainingLevel]),
	);
	const cutLoss = outletShiftCutLossForShift(shift, tierRates, prTierById);
	const unusedWages = outletShiftReleasedUnusedWagesTotal(
		shift,
		tierRates,
		prTierById,
	);
	const savedCredited = outletShiftBestEffortSaveCredited(
		shift,
		tierRates,
		prTierById,
	);

	const [bestEffortOpen, setBestEffortOpen] = useState(false);
	const [open, setOpen] = useState(false);
	const { demand, supplied, openSlots } = outletShiftDemandSupplied(shift);
	const adjustments = outletShiftCutLossAdjustmentsLabel(shift, t);
	const perSlotLabor = outletShiftPlannedLaborPerSlot(
		shift,
		tierRates,
		prTierById,
	);
	const releaseAtClock = outletPlanningReleaseClock(shift.shift);

	useEffect(() => {
		const openFromChip = (event: Event) => {
			const targetId = (event as CustomEvent<{ sectionId?: string }>).detail
				?.sectionId;
			if (!targetId || targetId === sectionId) setOpen(true);
		};
		window.addEventListener(OUTLET_OPEN_CUTLOST_EVENT, openFromChip);
		return () =>
			window.removeEventListener(OUTLET_OPEN_CUTLOST_EVENT, openFromChip);
	}, [sectionId]);

	// Backed by the real endpoint when a session exists, the demo store otherwise
	// — the prototype logins still run on it. Scoped to THIS shift so the badge
	// below reflects this card, not any other request the venue has open.
	const cutlost = useCutlostRequests({ shiftId: shift.id });

	const pendingRequest = useMemo(() => {
		if (cutlost.backed) {
			const live = cutlost.requests.find((r) => r.status === "pending");
			if (!live) return undefined;
			// Adapted to the store's shape so the rendering below stays one code
			// path. `estimatedSavings` arrives as a numeric(12,2) string.
			return {
				id: live.id,
				shiftId: live.shiftId,
				kind: live.kind,
				status: live.status,
				estimatedSavings: Number(live.estimatedSavings),
				slotsCut: live.slotsCut ?? undefined,
				releasedPrNames: live.releasedAssignments.map(
					(a) => a.prName ?? "a PR",
				),
			} as unknown as (typeof pendingCutlostRequests)[number];
		}
		return pendingCutlostRequests.find(
			(r) => r.shiftId === shift.id && r.status === "pending",
		);
	}, [cutlost.backed, cutlost.requests, pendingCutlostRequests, shift.id]);

	const cutSlotsLabor = Math.round(perSlotLabor * openSlots);
	const cutAllSavings = outletShiftCutLossSavings(
		shift,
		tierRates,
		prTierById,
		{
			demandCut: (shift.demandCut ?? 0) + openSlots,
		},
	);

	const bestEffortPlan = useMemo(
		() =>
			recommendBestEffortCutlost({
				shift,
				tierRates,
				prTierById,
				agencyPRs,
				releaseAtClock,
			}),
		[shift, tierRates, prTierById, agencyPRs, releaseAtClock],
	);

	if (shift.status !== "confirmed") return null;

	const canCutUnfilled = openSlots > 0;
	const hasBestEffort = Boolean(
		bestEffortPlan && bestEffortPlan.estimatedSavings > 0,
	);
	const hasActions = canCutUnfilled || hasBestEffort;
	const actionsLocked = Boolean(pendingRequest);

	if (!hasActions && cutLoss <= 0 && savedCredited <= 0 && !pendingRequest)
		return null;

	// Both submits go to the backend on a real session and to the demo store
	// otherwise. Nothing is released here either way: this raises a REQUEST, and
	// only the agency's approval closes anyone's shift.
	const submitBestEffort = () => {
		if (!bestEffortPlan) return;
		if (cutlost.backed) {
			void cutlost.raise({
				shiftId: shift.id,
				kind: "best_effort",
				prIds: bestEffortPlan.prIds,
				slotsCut: bestEffortPlan.slotsCut,
				// The figure the outlet is looking at right now, sent so the agency
				// approves the SAME number — the rate card can move in between.
				estimatedSavings: bestEffortPlan.estimatedSavings,
				rationale: bestEffortPlan.rationale,
			});
		} else {
			requestOutletCutlostReduction(shift.id, {
				kind: "best_effort",
				prIds: bestEffortPlan.prIds,
				slotsCut: bestEffortPlan.slotsCut,
				rationale: bestEffortPlan.rationale,
			});
		}
		setBestEffortOpen(false);
	};

	const submitCutSlots = () => {
		if (cutlost.backed) {
			void cutlost.raise({
				shiftId: shift.id,
				kind: "cut_slots",
				slotsCut: openSlots,
				estimatedSavings: cutSlotsLabor,
			});
			return;
		}
		requestOutletCutlostReduction(shift.id, {
			kind: "cut_slots",
			slots: openSlots,
		});
	};

	const bestEffortPct = Math.round(
		OUTLET_CUTLOSS_BEST_EFFORT_UNUSED_SHARE * 100,
	);
	const cutlostHint =
		cutLoss > 0
			? fill(t.today.underfillCutlost, {
					amount: formatRm(cutLoss),
					open: openSlots,
					demand,
				})
			: savedCredited > 0
				? fill(t.today.noUnderfillLong, {
						amount: formatRm(savedCredited),
						pct: bestEffortPct,
						unused: formatRm(unusedWages),
					})
				: t.today.cutOrRelease;

	// Hidden outright rather than disabled: the whole section exists to perform
	// one action, so a role that cannot perform it has nothing to read here.
	if (!canRequestCutLoss) return null;

	return (
		<>
			<OutletSection
				id={sectionId}
				title={t.outletHome.reduceCutlost}
				iconKey={t.today.reduceCutlost}
				hint={cutlostHint}
				collapsible
				open={open}
				onOpenChange={setOpen}
				className={cn("iz-outlet-cutlost-section !mt-2.5", className)}
				trailing={
					<span className="flex items-center gap-1.5">
						{cutLoss > 0 && (
							<IzPill variant="red" className="shrink-0 !py-0.5 !text-[11px]">
								{formatRm(cutLoss)}
							</IzPill>
						)}
						{savedCredited > 0 && (
							<IzPill variant="green" className="shrink-0 !py-0.5 !text-[11px]">
								{fill(t.outletPanels.savedPill, {
									amount: formatRm(savedCredited),
								})}
							</IzPill>
						)}
						{pendingRequest && (
							<IzPill variant="amber" className="shrink-0 !py-0.5 !text-[11px]">
								{t.today.pendingAgency}
							</IzPill>
						)}
					</span>
				}
			>
				<p className="text-xs leading-snug text-[var(--iz-muted2)]">
					{fill(t.today.cutlostExplainer, { pct: bestEffortPct })}
				</p>

				{pendingRequest && (
					<p className="mt-2 flex items-center gap-1.5 rounded-lg border border-[rgba(244,183,64,.28)] bg-[rgba(244,183,64,.08)] px-2.5 py-2 text-xs text-[var(--iz-amber)]">
						<Clock className="h-3.5 w-3.5 shrink-0" />
						{fill(t.outletPanels.awaitingAgencyRequest, {
							title: cutlostRequestTitle(pendingRequest),
							amount: formatRm(pendingRequest.estimatedSavings),
						})}
					</p>
				)}

				{adjustments && (
					<p className="mt-1 text-xs text-[var(--iz-muted2)]">
						{fill(t.outletPanels.alreadyApplied, { detail: adjustments })}
					</p>
				)}

				<div className="mt-1.5 space-y-1">
					{canCutUnfilled && (
						<ActionRow
							icon={TrendingDown}
							title={
								openSlots === 1
									? t.today.cutOneSlot
									: fill(t.today.cutNSlots, { n: openSlots })
							}
							detail={fill(t.today.cutSlotsHint, {
								amount: formatRm(cutSlotsLabor),
								open: openSlots,
								demand,
							})}
							savingsLabel={formatCutLossSavings(cutAllSavings, cutLoss, t)}
							disabled={actionsLocked}
							onClick={submitCutSlots}
						/>
					)}

					<ModelRow
						icon={Sparkles}
						title={t.today.bestEffortCutLost}
						detail={
							supplied > 0
								? fill(t.today.bestEffortLong, {
										pct: bestEffortPct,
										supplied,
									})
								: fill(t.today.bestEffortShort, { pct: bestEffortPct })
						}
						savingsLabel={
							bestEffortPlan
								? formatCutLossSavings(
										bestEffortPlan.estimatedSavings,
										cutLoss,
										t,
									)
								: null
						}
						active={bestEffortOpen}
						disabled={actionsLocked || !hasBestEffort}
						onClick={() => setBestEffortOpen(true)}
					/>
				</div>
			</OutletSection>

			<IzSheet open={bestEffortOpen} onClose={() => setBestEffortOpen(false)}>
				<IzCardTitle className="flex items-center gap-2">
					{t.today.bestEffortCutLost}
				</IzCardTitle>
				<p className="iz-tiny iz-muted mt-1">
					{fill(t.outletPanels.bestEffortIntro, {
						event: shift.event,
						clock: releaseAtClock,
						pct: bestEffortPct,
					})}
				</p>
				{bestEffortPlan ? (
					<>
						<p className="mt-4 font-sora text-2xl font-bold tabular-nums text-[var(--iz-green)]">
							{formatCutLossSavings(
								bestEffortPlan.estimatedSavings,
								cutLoss,
								t,
							) ?? formatRm(0)}
						</p>
						<p className="iz-tiny iz-muted2 mt-0.5">
							{fill(t.outletPanels.bestEffortSaveLine, {
								amount: formatRm(bestEffortPlan.estimatedSavings),
								pct: bestEffortPct,
								unused: formatRm(bestEffortPlan.unusedWages),
							})}
						</p>
						<div className="mt-4 space-y-2 rounded-xl border border-[var(--iz-line)] bg-white/[0.02] p-3">
							{bestEffortPlan.prNames.length > 0 && (
								<div className="flex items-start gap-2 text-sm">
									<UserMinus className="mt-0.5 h-4 w-4 shrink-0 text-[var(--iz-gold)]" />
									<span>
										{fill(t.outletPanels.releaseNamesEarly, {
											names: bestEffortPlan.prNames.join(", "),
										})}
									</span>
								</div>
							)}
						</div>
						<div className="mt-3 space-y-1.5">
							<p className="text-xs font-semibold uppercase tracking-wide text-[var(--iz-muted)]">
								{t.today.whyThisMix}
							</p>
							{bestEffortPlan.rationale.map((line) => (
								<p
									key={line}
									className="text-xs leading-snug text-[var(--iz-muted2)]"
								>
									· {line}
								</p>
							))}
						</div>
						<button
							type="button"
							className="iz-btn iz-btn-primary mt-4 w-full"
							disabled={actionsLocked}
							onClick={submitBestEffort}
						>
							{t.today.requestAgencyApproval}
						</button>
					</>
				) : (
					<p className="iz-tiny iz-muted mt-4 text-center leading-snug">
						{t.today.noSavingsPlan}
					</p>
				)}
				<button
					type="button"
					className="iz-btn iz-btn-soft mt-2 w-full"
					onClick={() => setBestEffortOpen(false)}
				>
					{t.common.cancel}
				</button>
			</IzSheet>
		</>
	);
}

function ModelRow({
	icon: Icon,
	title,
	detail,
	savingsLabel,
	active,
	disabled,
	onClick,
}: {
	icon: typeof Sparkles;
	title: string;
	detail: string;
	savingsLabel?: string | null;
	active?: boolean;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
				active
					? "border-[var(--iz-gold-d)] bg-[var(--iz-gold)]/8"
					: "border-[var(--iz-line)] bg-[var(--iz-bg)]",
				disabled
					? "cursor-not-allowed opacity-50"
					: "hover:border-[var(--iz-gold-d)]",
			)}
		>
			<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
				<Icon className="h-4 w-4 text-[var(--iz-gold)]" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block text-sm font-semibold leading-tight">
					{title}
				</span>
				<span className="mt-0.5 block text-xs leading-snug text-[var(--iz-muted2)]">
					{detail}
				</span>
			</span>
			{savingsLabel && (
				<span className="shrink-0 text-xs font-semibold leading-tight text-[var(--iz-green)]">
					{savingsLabel}
				</span>
			)}
		</button>
	);
}

function ActionRow({
	icon: Icon,
	title,
	detail,
	savingsLabel,
	disabled,
	onClick,
}: {
	icon: typeof UserMinus;
	title: string;
	detail: string;
	savingsLabel?: string | null;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"flex w-full items-center gap-2.5 rounded-lg border border-[var(--iz-line)] bg-[var(--iz-bg)] px-2.5 py-1.5 text-left transition-colors",
				disabled
					? "cursor-not-allowed opacity-50"
					: "hover:border-[var(--iz-gold-d)]",
			)}
		>
			<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
				<Icon className="h-4 w-4 text-[var(--iz-gold)]" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block text-sm font-semibold leading-tight">
					{title}
				</span>
				<span className="mt-0.5 block text-xs leading-snug text-[var(--iz-muted2)]">
					{detail}
				</span>
			</span>
			{savingsLabel && (
				<span className="shrink-0 text-xs font-semibold leading-tight text-[var(--iz-green)]">
					{savingsLabel}
				</span>
			)}
		</button>
	);
}
