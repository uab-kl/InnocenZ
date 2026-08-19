import {
	comcardPreviewFromSlot,
	PrComcardIdentity,
} from "@agency-portal/components/agency/PrComcardIdentity";
import { RosterAmountButton } from "@agency-portal/components/agency/RosterAmountButton";
import {
	type RosterEarningsSheetKind,
	RosterShiftEarningsSheets,
} from "@agency-portal/components/agency/RosterShiftEarningsSheets";
import { formatRM, IzCard, IzPill } from "@agency-portal/components/iz/ui";
import {
	type AgencyManagedPR,
	type AgencyRosterSlot,
	agencyPortalLabel,
	type OutletCommissionRule,
	type OutletPrTier,
	type OutletTierRateSettings,
	type RosterSlotStatus,
	resolveRosterPrName,
	rosterPageDisplayStatus,
	rosterSlotAgencyName,
} from "@agency-portal/lib/agency-demo";
import { formatPayeeLabel } from "@agency-portal/lib/agency-payroll";
import { formatAttendanceStamp } from "@agency-portal/lib/attendance-stamp";
import {
	findOutletShiftForRosterSlot,
	type OutletDrinkPrice,
} from "@agency-portal/lib/outlet-demo";
import {
	type OutletPrLiveSales,
	type RosterShiftEarningsContext,
	rosterSlotBreakdownTotal,
	rosterSlotHasReceiptFloorSales,
	rosterSlotLiveFloorSales,
	rosterSlotPayoutFromFloorSales,
} from "@agency-portal/lib/outlet-financial-sync";
import { estimateRosterSlotPayout } from "@agency-portal/lib/portal-sync";
import type { CommissionOnlyRateSettings } from "@agency-portal/lib/post-job-pay-tiers";
import type { PrReceiptScan } from "@agency-portal/lib/pr-demo";
import {
	activePrSwapForRosterSlot,
	type PrSwapRequest,
} from "@agency-portal/lib/pr-features";
import { formatRosterShiftTime } from "@agency-portal/lib/pr-session";
import { cn } from "@agency-portal/lib/utils";
import { Link } from "@tanstack/react-router";
import { ArrowLeftRight, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

type OutletShiftTierRef = {
	outletName: string;
	shift: string;
	date?: string;
	dateIso?: string;
	status?: string;
	tierRates?: Record<OutletPrTier, OutletTierRateSettings>;
	perDrinkRm?: number;
	eventDrinkMenu?: OutletDrinkPrice[];
	payPerHour?: number;
};

function resolveRosterSlotFloorSales(
	slot: AgencyRosterSlot,
	outletShifts: OutletShiftTierRef[] | undefined,
	drinkMenu: OutletDrinkPrice[],
	receiptScans: PrReceiptScan[] | undefined,
): OutletPrLiveSales {
	return rosterSlotLiveFloorSales({
		slot,
		outletShifts: outletShifts ?? [],
		drinkMenu,
		receiptScans,
	});
}

function formatRosterSlotDrinks(floor: OutletPrLiveSales): string {
	return floor.drinkSalesRm > 0 ? formatRM(floor.drinkSalesRm) : "—";
}

function formatRosterSlotTips(floor: OutletPrLiveSales): string {
	return floor.tipRm > 0 ? formatRM(floor.tipRm) : "—";
}

export function rosterSlotDisplayPayout(
	slot: AgencyRosterSlot,
	profile: AgencyManagedPR | undefined,
	outletCommissionRules: OutletCommissionRule[],
	perDrinkRm: number,
	outletShifts: OutletShiftTierRef[] | undefined,
	drinkMenu: OutletDrinkPrice[],
	receiptScans: PrReceiptScan[] | undefined,
	earningsContext?: RosterShiftEarningsContext | null,
): number {
	const floor = resolveRosterSlotFloorSales(
		slot,
		outletShifts,
		drinkMenu,
		receiptScans,
	);
	const outletShift = outletShifts
		? findOutletShiftForRosterSlot(outletShifts, slot)
		: undefined;
	if (rosterSlotHasReceiptFloorSales(floor)) {
		if (earningsContext) {
			const breakdownTotal = rosterSlotBreakdownTotal(slot, earningsContext);
			if (breakdownTotal != null) return breakdownTotal;
		}
		return rosterSlotPayoutFromFloorSales(slot, floor, {
			trainingLevel: profile?.trainingLevel,
			rules: outletCommissionRules,
			shiftTierRates: outletShift?.tierRates,
		});
	}
	if (!slot.checkedInAt) {
		return estimateRosterSlotPayout(
			{ ...slot, floorDrinks: 0, floorTips: 0 },
			{
				trainingLevel: profile?.trainingLevel,
				rules: outletCommissionRules,
				perDrinkRm,
				shiftTierRates: outletShift?.tierRates,
			},
		);
	}
	return estimateRosterSlotPayout(slot, {
		trainingLevel: profile?.trainingLevel,
		rules: outletCommissionRules,
		perDrinkRm,
		shiftTierRates: outletShift?.tierRates,
	});
}

/**
 * How the roster names a PR: "(Vicky) Victoria Tan Mei Lin".
 *
 * The canonical record wins, through the ONE payee formatter — the roster used
 * to print `resolveRosterPrName(...)`, which returns `AgencyManagedPR.name`,
 * and that field holds the NICKNAME. So the same person read "Vicky" here and
 * "(Vicky) Victoria Tan Mei Lin" on her voucher and her dispute row.
 *
 * `resolveRosterPrName` stays as the fallback: it carries a demo-fixture quirk
 * and is the only answer for a slot with no PR record behind it.
 */
function rosterPrLabel(
	slot: AgencyRosterSlot,
	profile: AgencyManagedPR | undefined,
	agencyPRs: AgencyManagedPR[] | undefined,
): string {
	const canonical = profile ?? agencyPRs?.find((p) => p.id === slot.prId);
	if (canonical) return formatPayeeLabel(canonical.name, canonical.icName);
	return resolveRosterPrName(slot.prId, slot.prName, agencyPRs ?? []);
}

function RosterPrNameCell({
	slot,
	profile,
	prSwap,
	agencyPRs,
	viewingAgencyId,
}: {
	slot: AgencyRosterSlot;
	profile?: AgencyManagedPR;
	prSwap?: PrSwapRequest;
	agencyPRs?: AgencyManagedPR[];
	viewingAgencyId?: string;
}) {
	const { t } = usePortalLocale();
	const displayName = rosterPrLabel(slot, profile, agencyPRs);
	const agencyLabel = viewingAgencyId
		? agencyPortalLabel(viewingAgencyId)
		: rosterSlotAgencyName(slot);
	return (
		<>
			<div className="iz-portal-table-pr">
				{/* The comcard preview keeps the slot's own floor name: it is what the
				    artwork's name plate prints, and a plate reading "(VICKY) VICT" is
				    not a comcard. The person is identified by the label beside it. */}
				<PrComcardIdentity
					pr={comcardPreviewFromSlot(slot, profile)}
					profile={profile}
					agencyName={agencyLabel}
				/>
				<div className="iz-portal-table-pr-meta">
					<RosterPrNameLink prId={slot.prId} label={displayName} />
					{profile?.trainingLevel && (
						<span className="iz-roster-tier-tag">{profile.trainingLevel}</span>
					)}
				</div>
			</div>
			{prSwap && (
				<p className="iz-roster-swap-note mt-1">
					{t.rosterGrid.swapArrow} → {prSwap.targetOutlet}
				</p>
			)}
		</>
	);
}

/**
 * The PR's name on the roster opens THAT PR on Manage PR.
 *
 * `/agency/prs` already parses `?pr=<id>` and opens the matching record, and
 * `slot.prId` is that record's id (agency_pr.user_id), so this needs no new
 * lookup — it was simply never linked, and the roster's only route to a PR was
 * the "Manage PR" button at the top of the page, which lands on the full list.
 */
function RosterPrNameLink({
	prId,
	label,
	className,
}: {
	prId: string;
	label: string;
	className?: string;
}) {
	const { t } = usePortalLocale();
	return (
		<Link
			to="/agency/prs"
			search={{ pr: prId }}
			className={cn(
				"iz-portal-table-name iz-portal-table-name--link",
				className,
			)}
			// The row itself has no click action, but the comcard thumb beside this
			// does — keep a tap on the name from reaching anything else.
			onClick={(e) => e.stopPropagation()}
			title={`${t.rosterGrid.openInManagePrPrefix} ${label} ${t.rosterGrid.openInManagePrSuffix}`.trim()}
		>
			{label}
		</Link>
	);
}

/**
 * RESOLVERS, not strings and not dictionary keys.
 *
 * This map spans two dictionary sections, and a key is itself a `string` — so
 * rendering the map value directly type-checks and ships the key name to the
 * screen, which is exactly how "statusSent" reached the payroll filter chips.
 * A function cannot be rendered by accident.
 *
 * Record keys stay the API's slot-status values.
 */
const STATUS_LABEL: Record<
	RosterSlotStatus,
	{
		label: (t: PortalTranslations) => string;
		variant: "green" | "amber" | "red" | "violet" | "ink";
	}
> = {
	"on-duty": { label: (t) => t.roster.onDuty, variant: "green" },
	"en-route": { label: (t) => t.roster.scheduled, variant: "ink" },
	scheduled: { label: (t) => t.roster.scheduled, variant: "ink" },
	unavailable: { label: (t) => t.roster.unavailable, variant: "red" },
	"swap-pending": { label: (t) => t.rosterGrid.swapPending, variant: "violet" },
	"assignment-pending": {
		label: (t) => t.rosterGrid.awaitingPr,
		variant: "amber",
	},
	"outlet-request-pending": {
		label: (t) => t.rosterGrid.outletRequest,
		variant: "amber",
	},
	"outlet-pending": {
		label: (t) => t.rosterGrid.awaitingOutlet,
		variant: "amber",
	},
};

export function RosterShiftTable({
	slots,
	agencyPRs,
	viewingAgencyId,
	prSwapRequests = [],
	outletCommissionRules,
	perDrinkRm,
	outletShifts,
	drinkMenu = [],
	receiptScans = [],
	rosterScopeSlots,
	happyHourStart = "20:00",
	happyHourEnd = "22:00",
	workspaceTierRates,
	commissionOnlyRates,
	canAssign,
	onEdit,
	onFlagLate,
	onFlagNoShow,
	onCancelPrSwap,
}: {
	slots: AgencyRosterSlot[];
	agencyPRs: AgencyManagedPR[];
	/** Active agency portal — agency column uses this label (dual-tied PRs included). */
	viewingAgencyId?: string;
	prSwapRequests?: PrSwapRequest[];
	outletCommissionRules: OutletCommissionRule[];
	perDrinkRm: number;
	outletShifts?: OutletShiftTierRef[];
	drinkMenu?: OutletDrinkPrice[];
	receiptScans?: PrReceiptScan[];
	rosterScopeSlots?: AgencyRosterSlot[];
	happyHourStart?: string;
	happyHourEnd?: string;
	workspaceTierRates?: Record<OutletPrTier, OutletTierRateSettings>;
	commissionOnlyRates?: CommissionOnlyRateSettings;
	canAssign: boolean;
	onEdit: (id: string) => void;
	onFlagLate: (id: string) => void;
	onFlagNoShow: (id: string) => void;
	onCancelPrSwap: (swapId: string) => void;
}) {
	const { t } = usePortalLocale();
	const [earningsSheet, setEarningsSheet] = useState<{
		kind: RosterEarningsSheetKind;
		slot: AgencyRosterSlot;
	} | null>(null);

	const earningsContext = useMemo((): RosterShiftEarningsContext | null => {
		if (!workspaceTierRates) return null;
		return {
			rosterScope: rosterScopeSlots ?? slots,
			agencyPRs,
			outletShifts: (outletShifts ??
				[]) as RosterShiftEarningsContext["outletShifts"],
			drinkMenu,
			receiptScans,
			happyHourStart,
			happyHourEnd,
			workspaceTierRates,
			commissionOnlyRates,
		};
	}, [
		workspaceTierRates,
		commissionOnlyRates,
		rosterScopeSlots,
		slots,
		agencyPRs,
		outletShifts,
		drinkMenu,
		receiptScans,
		happyHourStart,
		happyHourEnd,
	]);

	const openEarningsSheet = (
		kind: RosterEarningsSheetKind,
		slot: AgencyRosterSlot,
	) => {
		if (!earningsContext) return;
		setEarningsSheet({ kind, slot });
	};
	if (slots.length === 0) {
		return (
			<IzCard className="text-center">
				<p className="iz-sm iz-muted">{t.filters.noShiftsMatch}</p>
			</IzCard>
		);
	}

	const prById = new Map(agencyPRs.map((p) => [p.id, p]));

	return (
		<>
			<p className="iz-tiny iz-muted2 mb-2 hidden md:block">
				Tap a <strong className="text-[var(--iz-gold-l)]">comcard</strong> to
				identify PRs ·{" "}
				<strong className="text-[var(--iz-gold-l)]">{t.money.drinks}</strong>,{" "}
				<strong className="text-[var(--iz-gold-l)]">{t.money.tips}</strong>, or{" "}
				<strong className="text-[var(--iz-gold-l)]">
					{t.rosterGrid.estPayout}
				</strong>{" "}
				for shift breakdown ·{" "}
				<strong className="text-[var(--iz-gold-l)]">{t.common.edit}</strong> to
				change status, shift times, or request outlet swap.
			</p>

			<div className="iz-roster-table-wrap hidden md:block">
				<table className="iz-roster-table">
					<thead>
						<tr>
							<th>PR</th>
							<th>{t.rosterGrid.agency}</th>
							<th>{t.filters.outlet}</th>
							<th>{t.rosterGrid.shift}</th>
							<th>{t.rosterGrid.checkIn}</th>
							<th>{t.filters.status}</th>
							<th>{t.money.drinks}</th>
							<th>{t.money.tips}</th>
							<th>{t.rosterGrid.estPayout}</th>
							{canAssign && <th aria-label={t.rosterGrid.actions} />}
						</tr>
					</thead>
					<tbody>
						{slots.map((slot) => {
							const floor = resolveRosterSlotFloorSales(
								slot,
								outletShifts,
								drinkMenu,
								receiptScans,
							);
							return (
								<RosterTableRow
									key={slot.id}
									slot={slot}
									profile={prById.get(slot.prId)}
									agencyPRs={agencyPRs}
									viewingAgencyId={viewingAgencyId}
									prSwap={activePrSwapForRosterSlot(prSwapRequests, slot.id)}
									floor={floor}
									estPayout={rosterSlotDisplayPayout(
										slot,
										prById.get(slot.prId),
										outletCommissionRules,
										perDrinkRm,
										outletShifts,
										drinkMenu,
										receiptScans,
										earningsContext,
									)}
									canAssign={canAssign}
									onEdit={onEdit}
									onFlagLate={onFlagLate}
									onFlagNoShow={onFlagNoShow}
									onCancelPrSwap={onCancelPrSwap}
									onOpenEarningsSheet={
										earningsContext ? openEarningsSheet : undefined
									}
								/>
							);
						})}
					</tbody>
				</table>
			</div>

			<div className="space-y-2 md:hidden">
				{slots.map((slot) => {
					const floor = resolveRosterSlotFloorSales(
						slot,
						outletShifts,
						drinkMenu,
						receiptScans,
					);
					return (
						<RosterShiftCard
							key={slot.id}
							slot={slot}
							profile={prById.get(slot.prId)}
							agencyPRs={agencyPRs}
							viewingAgencyId={viewingAgencyId}
							prSwap={activePrSwapForRosterSlot(prSwapRequests, slot.id)}
							floor={floor}
							estPayout={rosterSlotDisplayPayout(
								slot,
								prById.get(slot.prId),
								outletCommissionRules,
								perDrinkRm,
								outletShifts,
								drinkMenu,
								receiptScans,
								earningsContext,
							)}
							canAssign={canAssign}
							onEdit={onEdit}
							onFlagLate={onFlagLate}
							onFlagNoShow={onFlagNoShow}
							onCancelPrSwap={onCancelPrSwap}
							onOpenEarningsSheet={
								earningsContext ? openEarningsSheet : undefined
							}
						/>
					);
				})}
			</div>

			{earningsContext && (
				<RosterShiftEarningsSheets
					kind={earningsSheet?.kind ?? null}
					anchorSlot={earningsSheet?.slot ?? null}
					earningsContext={earningsContext}
					onClose={() => setEarningsSheet(null)}
				/>
			)}
		</>
	);
}

function StatusPills({ slot }: { slot: AgencyRosterSlot }) {
	const { t } = usePortalLocale();
	if (slot.checkedOutAt) {
		return (
			<div className="flex flex-wrap gap-1">
				{slot.lateFlag && <IzPill variant="amber">{t.rosterGrid.late}</IzPill>}
				{slot.noShowFlag && (
					<IzPill variant="red">{t.rosterGrid.noShow}</IzPill>
				)}
				<IzPill variant="ink">{t.rosterGrid.releasedEarly}</IzPill>
			</div>
		);
	}
	const st = STATUS_LABEL[rosterPageDisplayStatus(slot.status)];
	return (
		<div className="flex flex-wrap gap-1">
			{slot.lateFlag && <IzPill variant="amber">{t.rosterGrid.late}</IzPill>}
			{slot.noShowFlag && <IzPill variant="red">{t.rosterGrid.noShow}</IzPill>}
			<IzPill variant={st.variant}>{st.label(t)}</IzPill>
		</div>
	);
}

function RosterTableRow({
	slot,
	profile,
	agencyPRs,
	viewingAgencyId,
	prSwap,
	floor,
	estPayout,
	canAssign,
	onEdit,
	onFlagLate,
	onFlagNoShow,
	onCancelPrSwap,
	onOpenEarningsSheet,
}: {
	slot: AgencyRosterSlot;
	profile?: AgencyManagedPR;
	agencyPRs: AgencyManagedPR[];
	viewingAgencyId?: string;
	prSwap?: import("@agency-portal/lib/pr-features").PrSwapRequest;
	floor: OutletPrLiveSales;
	estPayout: number;
	canAssign: boolean;
	onEdit: (id: string) => void;
	onFlagLate: (id: string) => void;
	onFlagNoShow: (id: string) => void;
	onCancelPrSwap: (swapId: string) => void;
	onOpenEarningsSheet?: (
		kind: RosterEarningsSheetKind,
		slot: AgencyRosterSlot,
	) => void;
}) {
	const { t } = usePortalLocale();
	const releasedEarly = Boolean(slot.checkedOutAt);
	const showFlags =
		canAssign &&
		!releasedEarly &&
		!slot.checkedInAt &&
		slot.status !== "unavailable" &&
		slot.status !== "swap-pending";
	const showEdit =
		canAssign &&
		!releasedEarly &&
		slot.status !== "swap-pending" &&
		slot.status !== "assignment-pending" &&
		slot.status !== "outlet-request-pending";
	const showReassign = canAssign && releasedEarly;
	const agencyLabel = viewingAgencyId
		? agencyPortalLabel(viewingAgencyId)
		: rosterSlotAgencyName(slot);

	return (
		<tr className={prSwap ? "iz-roster-row--swap" : undefined}>
			<td>
				<RosterPrNameCell
					slot={slot}
					profile={profile}
					agencyPRs={agencyPRs}
					viewingAgencyId={viewingAgencyId}
					prSwap={prSwap}
				/>
			</td>
			<td className="iz-portal-table-meta">{agencyLabel}</td>
			<td className="iz-portal-table-meta">{slot.outlet}</td>
			<td className="iz-portal-table-meta iz-portal-table-shift">
				{formatRosterShiftTime(slot)}
			</td>
			<td
				className="iz-portal-table-meta"
				// Full stamp on hover, so the exact second is still available.
				title={slot.checkedInAt ?? undefined}
			>
				{slot.checkedInAt
					? formatAttendanceStamp(slot.checkedInAt, slot.dateIso)
					: "—"}
			</td>
			<td className="iz-portal-table-status">
				<StatusPills slot={slot} />
			</td>
			<td className="iz-portal-table-meta">
				{onOpenEarningsSheet ? (
					<RosterAmountButton
						label={t.rosterGrid.drinks}
						onClick={() => onOpenEarningsSheet("drinks", slot)}
					>
						{formatRosterSlotDrinks(floor)}
					</RosterAmountButton>
				) : (
					formatRosterSlotDrinks(floor)
				)}
			</td>
			<td className="iz-portal-table-meta">
				{onOpenEarningsSheet ? (
					<RosterAmountButton
						label={t.rosterGrid.tips}
						onClick={() => onOpenEarningsSheet("tips", slot)}
					>
						{formatRosterSlotTips(floor)}
					</RosterAmountButton>
				) : (
					formatRosterSlotTips(floor)
				)}
			</td>
			<td className="text-[var(--iz-gold-l)] font-semibold">
				{onOpenEarningsSheet ? (
					<RosterAmountButton
						label={t.rosterGrid.estimatedPayout}
						className="iz-roster-amount-btn--gold"
						onClick={() => onOpenEarningsSheet("payout", slot)}
					>
						{formatRM(estPayout)}
					</RosterAmountButton>
				) : (
					formatRM(estPayout)
				)}
			</td>
			{canAssign && (
				<td>
					<div className="iz-roster-row-actions">
						{showReassign && (
							<button
								type="button"
								className="iz-roster-mini-btn on"
								onClick={() => onEdit(slot.id)}
								title={t.rosterGrid.reassignToOpenShift}
							>
								{t.roster.reassign}
							</button>
						)}
						{showEdit && (
							<button
								type="button"
								className="iz-roster-icon-btn"
								onClick={() => onEdit(slot.id)}
								title={t.common.edit}
							>
								<Pencil className="h-3.5 w-3.5" />
							</button>
						)}
						{showFlags && (
							<>
								<button
									type="button"
									className={`iz-roster-mini-btn${slot.lateFlag ? " on" : ""}`}
									onClick={() => onFlagLate(slot.id)}
								>
									{t.rosterGrid.late}
								</button>
								<button
									type="button"
									className={`iz-roster-mini-btn${slot.noShowFlag ? " on" : ""}`}
									onClick={() => onFlagNoShow(slot.id)}
								>
									{t.rosterGrid.noShow}
								</button>
							</>
						)}
						{prSwap && (
							<button
								type="button"
								className="iz-roster-mini-btn"
								onClick={() => onCancelPrSwap(prSwap.id)}
							>
								{t.common.cancel}
							</button>
						)}
					</div>
				</td>
			)}
		</tr>
	);
}

function RosterShiftCard({
	slot,
	profile,
	agencyPRs,
	viewingAgencyId,
	prSwap,
	floor,
	estPayout,
	canAssign,
	onEdit,
	onFlagLate,
	onFlagNoShow,
	onCancelPrSwap,
	onOpenEarningsSheet,
}: {
	slot: AgencyRosterSlot;
	profile?: AgencyManagedPR;
	agencyPRs: AgencyManagedPR[];
	viewingAgencyId?: string;
	prSwap?: import("@agency-portal/lib/pr-features").PrSwapRequest;
	floor: OutletPrLiveSales;
	estPayout: number;
	canAssign: boolean;
	onEdit: (id: string) => void;
	onFlagLate: (id: string) => void;
	onFlagNoShow: (id: string) => void;
	onCancelPrSwap: (swapId: string) => void;
	onOpenEarningsSheet?: (
		kind: RosterEarningsSheetKind,
		slot: AgencyRosterSlot,
	) => void;
}) {
	const { t } = usePortalLocale();
	const displayName = rosterPrLabel(slot, profile, agencyPRs);
	const agencyLabel = viewingAgencyId
		? agencyPortalLabel(viewingAgencyId)
		: rosterSlotAgencyName(slot);
	return (
		<IzCard>
			<div className="iz-between gap-2">
				<div className="flex min-w-0 items-start gap-2.5">
					<PrComcardIdentity
						pr={comcardPreviewFromSlot(slot, profile)}
						profile={profile}
						agencyName={agencyLabel}
					/>
					<div className="min-w-0">
						<RosterPrNameLink
							prId={slot.prId}
							label={displayName}
							className="block truncate"
						/>
						{profile?.trainingLevel && (
							<span className="iz-roster-tier-tag">
								{profile.trainingLevel}
							</span>
						)}
						<p className="iz-tiny iz-portal-table-meta mt-0.5">{agencyLabel}</p>
						<p className="iz-tiny iz-muted2 mt-0.5">{slot.outlet}</p>
					</div>
				</div>
				<StatusPills slot={slot} />
			</div>
			<div className="iz-roster-card-meta mt-2">
				<span>{formatRosterShiftTime(slot)}</span>
				{slot.checkedInAt && (
					<span>
						In {formatAttendanceStamp(slot.checkedInAt, slot.dateIso)}
					</span>
				)}
				<span>
					Drinks{" "}
					{onOpenEarningsSheet ? (
						<RosterAmountButton
							label={t.rosterGrid.drinks}
							onClick={() => onOpenEarningsSheet("drinks", slot)}
						>
							{formatRosterSlotDrinks(floor)}
						</RosterAmountButton>
					) : (
						formatRosterSlotDrinks(floor)
					)}
				</span>
				<span>
					Tips{" "}
					{onOpenEarningsSheet ? (
						<RosterAmountButton
							label={t.rosterGrid.tips}
							onClick={() => onOpenEarningsSheet("tips", slot)}
						>
							{formatRosterSlotTips(floor)}
						</RosterAmountButton>
					) : (
						formatRosterSlotTips(floor)
					)}
				</span>
				{onOpenEarningsSheet ? (
					<RosterAmountButton
						label={t.rosterGrid.estimatedPayout}
						className="iz-roster-amount-btn--gold"
						onClick={() => onOpenEarningsSheet("payout", slot)}
					>
						{formatRM(estPayout)}
					</RosterAmountButton>
				) : (
					<span className="text-[var(--iz-gold-l)]">{formatRM(estPayout)}</span>
				)}
			</div>
			{prSwap && (
				<div className="mt-2 rounded-lg border border-[rgba(124,107,255,.3)] bg-[rgba(124,107,255,.08)] px-2.5 py-2">
					<p className="iz-tiny iz-muted flex items-center gap-1">
						<ArrowLeftRight className="h-3 w-3 text-[var(--iz-violet)]" />
						PR swap to {prSwap.targetOutlet} — awaiting agency
					</p>
					<button
						type="button"
						className="iz-btn iz-btn-soft mt-2 w-full !py-1.5 !text-xs"
						onClick={() => onCancelPrSwap(prSwap.id)}
					>
						{t.rosterGrid.declineSwap}
					</button>
				</div>
			)}
			{canAssign && (
				<div className="iz-roster-actions">
					{slot.status !== "swap-pending" &&
						slot.status !== "assignment-pending" && (
							<button
								type="button"
								className="iz-btn iz-btn-soft iz-roster-action-btn"
								onClick={() => onEdit(slot.id)}
							>
								<Pencil className="h-3 w-3" /> {t.common.edit}
							</button>
						)}
					{!slot.checkedInAt &&
						slot.status !== "unavailable" &&
						slot.status !== "swap-pending" && (
							<>
								<button
									type="button"
									className={`iz-btn iz-roster-action-btn !text-xs ${slot.lateFlag ? "iz-btn-primary" : "iz-btn-ghost"}`}
									onClick={() => onFlagLate(slot.id)}
								>
									{slot.lateFlag ? t.rosterGrid.lateDone : t.rosterGrid.late}
								</button>
								<button
									type="button"
									className={`iz-btn iz-roster-action-btn !text-xs ${slot.noShowFlag ? "iz-btn-primary" : "iz-btn-ghost"}`}
									onClick={() => onFlagNoShow(slot.id)}
								>
									{slot.noShowFlag
										? t.rosterGrid.noShowDone
										: t.rosterGrid.noShow}
								</button>
							</>
						)}
				</div>
			)}
		</IzCard>
	);
}
