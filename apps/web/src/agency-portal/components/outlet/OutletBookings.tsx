import { IzPill } from "@agency-portal/components/iz/ui";
import { OutletCutLossActions } from "@agency-portal/components/outlet/OutletCutLossActions";
import { OutletLaborCostReport } from "@agency-portal/components/outlet/OutletLaborCostReport";
import {
	OutletShiftDetailPanel,
	OutletShiftStatusBadge,
} from "@agency-portal/components/outlet/OutletShiftDetailPanel";
import { OutletTodayOperationPanel } from "@agency-portal/components/outlet/OutletTodayOperationPanel";
import { OutletEmptyState } from "@agency-portal/components/outlet/outlet-portal-ui";
import type {
	AgencyManagedPR,
	AgencyRosterSlot,
} from "@agency-portal/lib/agency-demo";
import {
	formatTierSalesTargets,
	formatTierWageRange,
} from "@agency-portal/lib/agency-demo";
import {
	outletHomeShiftRequests,
	resolveOutletShiftDateIso,
} from "@agency-portal/lib/agency-outlet-shifts";
import { getLiveTodayIso } from "@agency-portal/lib/demo-clock";
import {
	outletShiftDemandSupplied,
	resolveShiftTierRates,
	shiftSpecialEventLabel,
} from "@agency-portal/lib/outlet-demo";
import { outletShiftDisplayLiveSales } from "@agency-portal/lib/outlet-financial-sync";
import { pickLiveShift } from "@agency-portal/lib/outlet-live-shift";
import { outletMatches } from "@agency-portal/lib/portal-sync";
import { PR_AGENCY_TIED_OFFERS } from "@agency-portal/lib/pr-features";
import { parseSlotRange } from "@agency-portal/lib/shift-window";
import { specialServicesForOutlet } from "@agency-portal/lib/special-service-actions";
import { type ShiftRequest, useStore } from "@agency-portal/lib/store";
import { ChevronDown } from "lucide-react";
import { useMemo } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

export function OutletBookings({
	variant = "home",
	shifts: shiftsOverride,
	roster: rosterOverride,
	agencyPrs,
}: {
	variant?: "home" | "future";
	/**
	 * Backend-backed shifts + roster for a real outlet session (see
	 * useOutletToday). They travel together: a card's `prs` are resolved against
	 * the roster slots, so overriding one without the other renders a shift with
	 * nobody on it. Omitted on demo sessions, which read the store.
	 */
	shifts?: ShiftRequest[];
	roster?: AgencyRosterSlot[];
	agencyPrs?: AgencyManagedPR[];
}) {
	const { t } = usePortalLocale();
	const outletWorkspace = useStore((s) => s.outletWorkspace);
	const outletCommissionRules = useStore((s) => s.outletCommissionRules);
	const storeRoster = useStore((s) => s.agencyRoster);
	const prReceiptScans = useStore((s) => s.prReceiptScans);
	const specialServiceOrders = useStore((s) => s.specialServiceOrders);
	const storeShifts = useStore((s) => s.shifts);
	const shifts = shiftsOverride ?? storeShifts;
	const agencyRoster = rosterOverride ?? storeRoster;

	const visibleShifts = useMemo(
		() =>
			outletHomeShiftRequests({
				shifts,
				outletName: outletWorkspace.outletName,
				roster: agencyRoster,
				tiedOffers: PR_AGENCY_TIED_OFFERS,
				commissionRules: outletCommissionRules,
				outletWorkspace,
			}),
		[shifts, outletWorkspace, agencyRoster, outletCommissionRules],
	);
	// TODAY MEANS TODAY, and the RUNNING shift is the live one — the ranking and
	// every reason behind it live in `pickLiveShift`, which is unit-tested because
	// this rule has now been wrong three times and each wrong answer looked
	// perfectly plausible on screen.
	const liveShift = useMemo(
		() =>
			pickLiveShift({
				shifts: visibleShifts,
				roster: agencyRoster,
				todayIso: getLiveTodayIso(),
				now: new Date(),
			}),
		[visibleShifts, agencyRoster],
	);

	const futureShifts = liveShift
		? visibleShifts.filter((s) => s.id !== liveShift.id)
		: visibleShifts;

	/**
	 * TODAY'S OTHER SHIFTS — everything running today that is not the live one.
	 *
	 * Today rendered `liveShift` and nothing else, so a venue working two shifts
	 * in a night could see only one of them, and the PRs on the other were
	 * invisible on the page that exists to say who is working (owner, 3 Sep
	 * 2026: "the outlet cannot track that shift, where is the other shift").
	 * Emhub had exactly that: a 10:00–11:00 shift with nobody on it, and an
	 * 11:00–12:00 "tt" whose PR had already checked in and out — Today showed
	 * the first and reported "No PRs assigned for tonight yet".
	 *
	 * `pickLiveShift` is deliberately NOT touched. It answers "which shift is
	 * RUNNING", it is unit-tested, and its own comment records three past wrong
	 * answers; the page was wrong to show only its winner, not wrong about the
	 * winner. So the others are ADDED beneath, collapsed, rather than the pick
	 * being widened.
	 *
	 * Scoped to today by the shift's own resolved date — `futureShifts` spans
	 * the fortnight the hook fetches, and next Tuesday's booking is the
	 * Calendar's business, not tonight's.
	 */
	const alsoTodayShifts = useMemo(() => {
		const todayIso = getLiveTodayIso();
		return (
			futureShifts
				.filter(
					(s) =>
						resolveOutletShiftDateIso(s.date, s.dateIso, todayIso) === todayIso,
				)
				/*
				 * EARLIEST FIRST (owner, 3 Sep 2026: "arrange the posted shift time
				 * from earlier to later"). The hook returns shifts in the order the
				 * API sends them, which is not the order a night runs in.
				 *
				 * `parseSlotRange` is the shared parser the clash checks use, so an
				 * overnight 22:00–04:00 sorts by when it STARTS rather than wrapping
				 * to the front. A slot that is not a time range at all returns null;
				 * those sink to the end rather than sorting as midnight, since
				 * "unknown" is not "earliest".
				 */
				.sort((a, b) => {
					const aStart =
						parseSlotRange(a.shift)?.startMin ?? Number.MAX_SAFE_INTEGER;
					const bStart =
						parseSlotRange(b.shift)?.startMin ?? Number.MAX_SAFE_INTEGER;
					return aStart - bStart;
				})
		);
	}, [futureShifts]);

	const defaultOpenId = variant === "future" ? futureShifts[0]?.id : undefined;

	if (variant === "home" && !liveShift) {
		return (
			<OutletEmptyState>{t.outletPanels.noLiveShiftTonight}</OutletEmptyState>
		);
	}

	if (variant === "future" && futureShifts.length === 0) {
		return <OutletEmptyState>{t.calendar.noUpcomingShifts}</OutletEmptyState>;
	}

	if (visibleShifts.length === 0) {
		return <OutletEmptyState>{t.outletPanels.noShiftsYet}</OutletEmptyState>;
	}

	const renderShiftCard = (
		s: (typeof visibleShifts)[number],
		hideLogSales = false,
	) => {
		const tierRates = resolveShiftTierRates(s, outletWorkspace);
		const targetPay = formatTierWageRange(tierRates);
		const salesTargets = formatTierSalesTargets(tierRates);
		const todayIso = getLiveTodayIso();
		const shiftDateIso = resolveOutletShiftDateIso(s.date, s.dateIso, todayIso);
		const rosterTonight = agencyRoster.filter(
			(slot) =>
				outletMatches(slot.outlet, s.outletName) &&
				slot.dateIso === shiftDateIso &&
				(s.prs ?? []).includes(slot.prId),
		);
		const tonightSpecialServiceRm = specialServicesForOutlet(
			specialServiceOrders,
			s.outletName,
		)
			.filter(
				(r) =>
					r.dateIso === shiftDateIso &&
					r.status !== "declined" &&
					r.status !== "rejected",
			)
			.reduce((sum, r) => sum + r.amountIn, 0);
		const displaySales = outletShiftDisplayLiveSales(s, {
			outletName: s.outletName,
			drinkMenu: outletWorkspace.drinkMenu ?? [],
			rosterSlots: rosterTonight,
			receiptScans: prReceiptScans,
			specialServiceRm: tonightSpecialServiceRm,
		});
		const { demand, supplied } = outletShiftDemandSupplied(s);

		return (
			<details
				key={s.id}
				className="iz-outlet-booking-card group"
				open={s.id === defaultOpenId}
			>
				<summary className="flex items-center gap-2">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<span className="truncate text-sm font-semibold">{s.event}</span>
							{s.eventKind === "special" && (
								<IzPill variant="gold" className="shrink-0 !py-0.5 !text-[9px]">
									{shiftSpecialEventLabel(
										s.specialEventType,
										t,
										s.customSpecialEventName,
									)}
								</IzPill>
							)}
							<OutletShiftStatusBadge shift={s} />
						</div>
						{/*
						 * The TIME, not just the day-label. `s.date` is a friendly string
						 * ("Tonight", "Tomorrow"), so a card whose shift ran 11:00–12:00 read
						 * simply "Tonight · 1/5 PRs" and the venue could not tell from its own
						 * home page WHEN the shift was — the one fact this line exists to give.
						 * `s.shift` has carried the window all along; it was only ever shown
						 * once the card had been expanded.
						 */}
						<p className="iz-tiny iz-muted mt-0.5 truncate group-open:hidden">
							{s.date}
							{s.shift ? ` · ${s.shift}` : ""} ·{" "}
							{fill(t.outletPanels.suppliedOfDemandPrs, { supplied, demand })} ·{" "}
							{targetPay}
							{salesTargets ? ` · ${salesTargets}` : ""} ·{" "}
							{fill(t.outletPanels.salesAmount, {
								amount: `RM ${displaySales.toLocaleString()}`,
							})}
						</p>
					</div>
					<ChevronDown className="h-4 w-4 shrink-0 text-[var(--iz-muted)] transition-transform group-open:rotate-180" />
				</summary>

				<OutletShiftDetailPanel
					shift={s}
					variant={variant}
					hideLogSales={hideLogSales}
					hideCutlost={variant === "home"}
					roster={rosterOverride}
					agencyPrs={agencyPrs}
				/>
			</details>
		);
	};

	return (
		<div className="space-y-2">
			{variant === "home" && liveShift && renderShiftCard(liveShift, true)}
			{variant === "home" && liveShift && (
				<OutletTodayOperationPanel
					shift={liveShift}
					outletName={outletWorkspace.outletName}
					roster={rosterOverride}
					agencyPrs={agencyPrs}
				/>
			)}
			{variant === "home" && liveShift && (
				<OutletLaborCostReport shift={liveShift} />
			)}
			{variant === "home" && liveShift && liveShift.status === "confirmed" && (
				<OutletCutLossActions shift={liveShift} />
			)}
			{/*
			 * The rest of tonight, BELOW the live shift's own panels rather than
			 * between them: PR tonight, live sales and labour cost all describe the
			 * live shift, and a second card wedged in above them would read as
			 * theirs. Each opens to the same detail panel, so the venue can see who
			 * is on the 11:00 shift without leaving Today for the Calendar.
			 */}
			{variant === "home" && alsoTodayShifts.length > 0 && (
				<>
					<p className="iz-tiny iz-muted2 mt-3">
						{fill(
							alsoTodayShifts.length === 1
								? t.outletPanels.alsoTodayOne
								: t.outletPanels.alsoTodayMany,
							{ n: alsoTodayShifts.length },
						)}
					</p>
					{alsoTodayShifts.map((s) => renderShiftCard(s, true))}
				</>
			)}
			{variant === "future" && futureShifts.map((s) => renderShiftCard(s))}
		</div>
	);
}
