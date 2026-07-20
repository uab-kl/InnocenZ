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
import { outletMatches } from "@agency-portal/lib/portal-sync";
import { PR_AGENCY_TIED_OFFERS } from "@agency-portal/lib/pr-features";
import { specialServicesForOutlet } from "@agency-portal/lib/special-service-actions";
import { type ShiftRequest, useStore } from "@agency-portal/lib/store";
import { ChevronDown } from "lucide-react";
import { useMemo } from "react";

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

	const liveShift =
		visibleShifts.find(
			(s) => s.status === "confirmed" && s.date === "Tonight",
		) ?? visibleShifts.find((s) => s.status === "confirmed");
	const futureShifts = liveShift
		? visibleShifts.filter((s) => s.id !== liveShift.id)
		: visibleShifts;

	const defaultOpenId = variant === "future" ? futureShifts[0]?.id : undefined;

	if (variant === "home" && !liveShift) {
		return (
			<OutletEmptyState>
				No live shift tonight — check Calendar page for upcoming events.
			</OutletEmptyState>
		);
	}

	if (variant === "future" && futureShifts.length === 0) {
		return (
			<OutletEmptyState>
				No upcoming shifts — use Post Job to create one.
			</OutletEmptyState>
		);
	}

	if (visibleShifts.length === 0) {
		return (
			<OutletEmptyState>
				No shifts yet — use Post Job to create one.
			</OutletEmptyState>
		);
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
										s.customSpecialEventName,
									)}
								</IzPill>
							)}
							<OutletShiftStatusBadge shift={s} />
						</div>
						<p className="iz-tiny iz-muted mt-0.5 truncate group-open:hidden">
							{s.date} · {supplied}/{demand} PRs · {targetPay}
							{salesTargets ? ` · ${salesTargets}` : ""} · RM{" "}
							{displaySales.toLocaleString()} sales
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
			{variant === "future" && futureShifts.map((s) => renderShiftCard(s))}
		</div>
	);
}
