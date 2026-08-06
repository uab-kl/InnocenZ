import {
	Comcard3dPreviewCard,
	Comcard3dPreviewThumb,
	Comcard3dPreviewVisual,
} from "@agency-portal/components/agency/Comcard3dPreview";
import {
	comcardPreviewFromSlot,
	toComcardPreview,
} from "@agency-portal/components/agency/PrComcardIdentity";
import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { OutletPrShiftHistorySheet } from "@agency-portal/components/iz/ShiftHistoryLog";
import { TitleWithIcon } from "@agency-portal/components/iz/TitleWithIcon";
import { IzPill, TierBadge } from "@agency-portal/components/iz/ui";
import { OutletPrLiveSalesFloorTable } from "@agency-portal/components/outlet/OutletPrLiveSalesFloorTable";
import { OutletPrLiveSalesSheet } from "@agency-portal/components/outlet/OutletPrLiveSalesSheet";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import { OutletTonightSummaryTable } from "@agency-portal/components/outlet/OutletTonightSummaryTable";
import {
	workforceStatusLabel,
	workforceStatusVariant,
} from "@agency-portal/components/portal/LiveWorkforceTable";
import type {
	AgencyManagedPR,
	AgencyRosterSlot,
} from "@agency-portal/lib/agency-demo";
import {
	agencyIdOf,
	languagesFromPr,
	rosterSlotAgencyName,
} from "@agency-portal/lib/agency-demo";
import { formatAttendanceStamp } from "@agency-portal/lib/attendance-stamp";
import {
	OUTLET_LIVE_SALES_SECTION_ID,
	OUTLET_OPEN_LIVE_SALES_EVENT,
	OUTLET_PR_TONIGHT_SECTION_ID,
	PR_RATING_NOTE_PLACEHOLDERS,
	PR_RATING_TAGS,
	resolveShiftTierRates,
} from "@agency-portal/lib/outlet-demo";
import {
	outletPrLiveFloorSales,
	outletShiftClockStarted,
	outletShiftFloorSalesStarted,
	outletTonightFloorTotals,
	outletTonightLiveEarningsRows,
} from "@agency-portal/lib/outlet-financial-sync";
import { outletCan } from "@agency-portal/lib/outlet-rbac";
import { outletMatches } from "@agency-portal/lib/portal-sync";
import {
	getPrAgencyById,
	TIED_DEMO_ROSTER_PR_ID,
} from "@agency-portal/lib/pr-demo";
import type { PrShiftSessionState } from "@agency-portal/lib/pr-session";
import { DEFAULT_ROSTER_DATE_ISO } from "@agency-portal/lib/roster-availability";
import type { PR, ShiftRequest } from "@agency-portal/lib/store";
import { useStore } from "@agency-portal/lib/store";
import { cn } from "@agency-portal/lib/utils";
import { Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type FloorDisplayStatus = "on-duty" | "en-route" | "scheduled" | "checked-out";

type StaffEntry = {
	pr: PR;
	slot?: AgencyRosterSlot;
	displayStatus: FloorDisplayStatus;
};

function slotHasDemoFloorActivity(slot: AgencyRosterSlot): boolean {
	return (slot.floorDrinks ?? 0) > 0 || (slot.floorTips ?? 0) > 0;
}

function resolveFloorPrDisplayStatusFromSlot(
	slot: AgencyRosterSlot | undefined,
	shift: ShiftRequest,
	now = new Date(),
): FloorDisplayStatus {
	if (!slot) return "scheduled";

	// A real attendance stamp beats the shift clock. The agency roster already
	// reads a checked-in PR as on duty (backend-shift-map's liveRosterStatus),
	// and the outlet is the venue the person is physically standing in — but
	// this used to sit BELOW the clock gate, so before the shift started a
	// genuine check-in read as "Booked" here while the agency showed "On duty".
	// Check-in is deliberately not time-boxed, so an early stamp is real.
	if (slot.checkedOutAt) return "checked-out";
	if (slot.status === "on-duty" && slot.checkedInAt) return "on-duty";

	// Nothing is stamped below this point, so the clock still governs: before
	// the shift starts a PR is at most en route, and demo floor activity must
	// not invent an on-duty PR for a shift that has not begun.
	const clockStarted = outletShiftClockStarted(shift, now);
	if (!clockStarted) {
		if (slot.status === "en-route") return "en-route";
		return "scheduled";
	}
	if (slot.status === "en-route") return "en-route";
	if (slot.status === "on-duty") return "en-route";
	if (slotHasDemoFloorActivity(slot)) return "on-duty";
	return "scheduled";
}

function resolveTiedPrLiveAttendance(
	prSessionByRole: Partial<Record<string, PrShiftSessionState>> | undefined,
	prSubRole: string | null,
	checkedIn: boolean,
	checkedOut: boolean,
	prActiveShift: { outlet: string } | null | undefined,
) {
	const cache = prSessionByRole?.pr_tied;
	const onTiedRole = prSubRole === "pr_tied";
	const liveCheckedIn = onTiedRole
		? checkedIn
		: (cache?.checkedIn ?? checkedIn);
	const liveCheckedOut = onTiedRole
		? checkedOut
		: (cache?.checkedOut ?? checkedOut);
	const liveSession =
		(onTiedRole ? prActiveShift : cache?.prActiveShift) ??
		prActiveShift ??
		null;
	return {
		onDuty: Boolean(liveCheckedIn && !liveCheckedOut && liveSession),
		checkedOutTonight: Boolean(liveCheckedOut),
		outlet: liveSession?.outlet,
	};
}

function resolveStaffFloorStatus(
	prId: string,
	slot: AgencyRosterSlot | undefined,
	tiedLive: ReturnType<typeof resolveTiedPrLiveAttendance>,
	shift: ShiftRequest,
	now = new Date(),
): FloorDisplayStatus {
	if (shift.releasedEarlyPrIds?.includes(prId)) return "checked-out";
	const clockStarted = outletShiftClockStarted(shift, now);
	if (prId === TIED_DEMO_ROSTER_PR_ID) {
		if (clockStarted && tiedLive.onDuty) return "on-duty";
		if (tiedLive.checkedOutTonight) return "checked-out";
	}
	return resolveFloorPrDisplayStatusFromSlot(slot, shift, now);
}

const STATUS_SORT: Record<FloorDisplayStatus, number> = {
	"on-duty": 0,
	"en-route": 1,
	scheduled: 2,
	"checked-out": 3,
};

export function OutletTodayOperationPanel({
	shift,
	outletName,
	className,
	roster: rosterOverride,
	agencyPrs: agencyPrsOverride,
}: {
	shift: ShiftRequest;
	outletName: string;
	className?: string;
	/**
	 * Backend roster slots + PR records for a real outlet session. The PR list is
	 * built by resolving `shift.prs` ids against these, and unresolvable ids are
	 * dropped — so both must be supplied together. Omitted on demo sessions.
	 */
	roster?: AgencyRosterSlot[];
	agencyPrs?: AgencyManagedPR[];
}) {
	const outletSubRole = useStore((s) => s.outletSubRole);
	const outletWorkspace = useStore((s) => s.outletWorkspace);
	const prReceiptScans = useStore((s) => s.prReceiptScans ?? []);
	const {
		prs,
		ratePr,
		agencyRoster: storeRoster,
		agencyPRs: storeAgencyPRs,
		postSealRatePrompt,
		clearPostSealRatePrompt,
	} = useStore();
	const agencyRoster = rosterOverride ?? storeRoster;
	const agencyPRs = agencyPrsOverride ?? storeAgencyPRs;
	const prSubRole = useStore((s) => s.prSubRole);
	const prSessionByRole = useStore((s) => s.prSessionByRole);
	const checkedIn = useStore((s) => s.checkedIn);
	const checkedOut = useStore((s) => s.checkedOut);
	const prActiveShift = useStore((s) => s.prActiveShift);
	const syncLivePrCheckInToRoster = useStore(
		(s) => s.syncLivePrCheckInToRoster,
	);
	const canRate = outletCan(outletSubRole, "ratePrs");
	const [openPr, setOpenPr] = useState<string | null>(null);
	const [comcardPreviewId, setComcardPreviewId] = useState<string | null>(null);
	const [historyPrId, setHistoryPrId] = useState<string | null>(null);
	const [liveSalesPrId, setLiveSalesPrId] = useState<string | null>(null);
	const [prTonightOpen, setPrTonightOpen] = useState(false);
	const [liveSalesOpen, setLiveSalesOpen] = useState(false);
	const [stars, setStars] = useState<1 | 2 | 3 | 4 | 5>(5);
	const [note, setNote] = useState("");
	const [tags, setTags] = useState<string[]>([]);

	useEffect(() => {
		if (postSealRatePrompt?.prIds[0]) {
			setOpenPr(postSealRatePrompt.prIds[0]);
			setStars(5);
			setNote("");
			setTags([]);
		}
	}, [postSealRatePrompt]);

	useEffect(() => {
		const openLiveSales = () => setLiveSalesOpen(true);
		window.addEventListener(OUTLET_OPEN_LIVE_SALES_EVENT, openLiveSales);
		return () =>
			window.removeEventListener(OUTLET_OPEN_LIVE_SALES_EVENT, openLiveSales);
	}, []);

	useEffect(() => {
		syncLivePrCheckInToRoster();
	}, [
		syncLivePrCheckInToRoster,
		checkedIn,
		checkedOut,
		prActiveShift,
		prSubRole,
		prSessionByRole,
		agencyRoster.length,
	]);

	const tiedLive = useMemo(
		() =>
			resolveTiedPrLiveAttendance(
				prSessionByRole,
				prSubRole,
				checkedIn,
				checkedOut,
				prActiveShift,
			),
		[prSessionByRole, prSubRole, checkedIn, checkedOut, prActiveShift],
	);

	const rosterTonight = useMemo(
		() =>
			agencyRoster.filter(
				(s) =>
					s.dateIso === DEFAULT_ROSTER_DATE_ISO &&
					outletMatches(s.outlet, outletName),
			),
		[agencyRoster, outletName],
	);

	const agencyPrById = useMemo(
		() => new Map(agencyPRs.map((p) => [p.id, p])),
		[agencyPRs],
	);

	const staffTonight = useMemo((): StaffEntry[] => {
		const rosterByPr = new Map(rosterTonight.map((s) => [s.prId, s]));
		const released = new Set(shift.releasedEarlyPrIds ?? []);
		const bookedIds = new Set(shift.prs ?? []);
		for (const id of released) bookedIds.add(id);
		for (const slot of rosterTonight) {
			if (released.has(slot.prId)) continue;
			if (
				["scheduled", "on-duty", "en-route", "swap-pending"].includes(
					slot.status,
				) &&
				slot.shift === shift.shift &&
				!slot.checkedOutAt
			) {
				bookedIds.add(slot.prId);
			}
		}
		return [...bookedIds]
			.flatMap((id): StaffEntry[] => {
				const marketplacePr = prs.find((p) => p.id === id);
				const agencyPr = agencyPrById.get(id);
				if (!marketplacePr && !agencyPr) return [];
				const pr =
					marketplacePr ??
					({
						id: agencyPr!.id,
						name: agencyPr!.name,
						rating: agencyPr!.rating,
						languages: agencyPr!.languages.map((l) =>
							l.length <= 3 ? l : l.slice(0, 2).toUpperCase(),
						),
						status: "booked" as const,
						avatar: "✨",
						comcardImageUrl: agencyPr!.comcardImageUrl ?? null,
					} satisfies PR);
				const slot = rosterByPr.get(id);
				const displayStatus = resolveStaffFloorStatus(
					id,
					slot,
					tiedLive,
					shift,
				);
				return slot ? [{ pr, slot, displayStatus }] : [{ pr, displayStatus }];
			})
			.sort(
				(a, b) =>
					STATUS_SORT[a.displayStatus] - STATUS_SORT[b.displayStatus] ||
					a.pr.name.localeCompare(b.pr.name),
			);
	}, [
		shift.prs,
		shift.shift,
		shift.releasedEarlyPrIds,
		prs,
		rosterTonight,
		tiedLive,
		agencyPrById,
	]);

	const statusCounts = useMemo(() => {
		const counts = { onDuty: 0, enRoute: 0, booked: 0, checkedOut: 0 };
		for (const { displayStatus } of staffTonight) {
			if (displayStatus === "on-duty") counts.onDuty += 1;
			else if (displayStatus === "en-route") counts.enRoute += 1;
			else if (displayStatus === "scheduled") counts.booked += 1;
			else if (displayStatus === "checked-out") counts.checkedOut += 1;
		}
		return counts;
	}, [staffTonight]);

	/**
	 * Every PR whose card is on screen, by id.
	 *
	 * 🔴 Resolve the sheets from HERE, never from the `prs` store slice. The card
	 * list above already falls back to building a PR out of `agencyPRs` when the
	 * marketplace slice has no match — that fallback is what lets a
	 * backend-sourced PR render at all — but the sheet lookups did a bare
	 * `prs.find()` with no such fallback. So on a real outlet session every card
	 * appeared and every button did nothing: the click set its state, the lookup
	 * returned null, and the render gate below (`openPr && openPrData && …`)
	 * silently declined to mount the sheet. No error, no empty state, nothing in
	 * the console — the worst shape a bug can take.
	 *
	 * `prs` is the one prop with no backend override — `roster` and `agencyPrs`
	 * both take one — so it is empty for every real session, and since the demo
	 * seed was retired it is empty for demo ones too.
	 *
	 * The invariant this restores: a card that can be shown is a card whose
	 * sheets can open.
	 */
	const prOnScreenById = useMemo(
		() => new Map(staffTonight.map((e) => [e.pr.id, e.pr])),
		[staffTonight],
	);

	const openPrData = openPr ? (prOnScreenById.get(openPr) ?? null) : null;
	const openPrCheckedOut = useMemo(
		() =>
			staffTonight.find((e) => e.pr.id === openPr)?.displayStatus ===
			"checked-out",
		[openPr, staffTonight],
	);
	const comcardPreviewProfile = comcardPreviewId
		? agencyPrById.get(comcardPreviewId)
		: null;
	const comcardPreviewPr = comcardPreviewProfile
		? toComcardPreview(comcardPreviewProfile)
		: comcardPreviewId
			? comcardPreviewFromSlot(
					{
						prId: comcardPreviewId,
						prName: prOnScreenById.get(comcardPreviewId)?.name ?? "PR",
					},
					null,
				)
			: null;
	const historyPr = historyPrId
		? (prOnScreenById.get(historyPrId) ?? null)
		: null;
	const historyPrSlot = historyPrId
		? rosterTonight.find((s) => s.prId === historyPrId)
		: undefined;
	const historyPrAgency = historyPrSlot
		? rosterSlotAgencyName(historyPrSlot)
		: undefined;
	const tierRates = useMemo(
		() => resolveShiftTierRates(shift, outletWorkspace),
		[shift, outletWorkspace],
	);

	const liveEarningsRows = useMemo(
		() =>
			outletTonightLiveEarningsRows({
				shift,
				outletName,
				drinkMenu: outletWorkspace.drinkMenu ?? [],
				rosterSlots: rosterTonight,
				// The PRs actually on screen, unioned with the shift's own list: a
				// backend-mapped shift can carry no `prs` array at all, and a row
				// keyed off an id with no card is one the Live-sales sheet could
				// never surface — which is the other half of why that button did
				// nothing. Names come from the same resolved list for the same
				// reason; reading `prs` here left every row labelled "PR".
				prIds: [
					...new Set([
						...(shift.prs ?? []),
						...staffTonight.map((e) => e.pr.id),
					]),
				],
				prNameById: Object.fromEntries(
					staffTonight.map((e) => [e.pr.id, e.pr.name]),
				),
				trainingLevelById: Object.fromEntries(
					agencyPRs.map((p) => [p.id, p.trainingLevel]),
				),
				payClassById: Object.fromEntries(
					agencyPRs.map((p) => [p.id, p.payClass]),
				),
				tierRates,
				commissionOnlyRates: outletWorkspace.commissionOnlyRates,
				happyHourStart: outletWorkspace.happyHourStart,
				happyHourEnd: outletWorkspace.happyHourEnd,
				receiptScans: prReceiptScans,
			}),
		[
			shift,
			outletName,
			outletWorkspace.drinkMenu,
			outletWorkspace.happyHourStart,
			outletWorkspace.happyHourEnd,
			rosterTonight,
			staffTonight,
			agencyPRs,
			tierRates,
			prReceiptScans,
		],
	);

	const liveSalesBreakdown = liveSalesPrId
		? (liveEarningsRows.find((row) => row.prId === liveSalesPrId) ?? null)
		: null;

	const floorSalesStarted = outletShiftFloorSalesStarted(shift, new Date(), {
		outletName,
		rosterSlots: rosterTonight,
		receiptScans: prReceiptScans,
		prIds: shift.prs ?? [],
	});

	const liveDrinkUnitsByPrId = useMemo(() => {
		if (!floorSalesStarted) return new Map<string, number>();
		const map = new Map<string, number>();
		const rosterByPr = new Map(rosterTonight.map((slot) => [slot.prId, slot]));
		for (const prId of shift.prs ?? []) {
			const { drinkUnits } = outletPrLiveFloorSales({
				prId,
				outletName,
				shift,
				slot: rosterByPr.get(prId),
				drinkMenu: outletWorkspace.drinkMenu ?? [],
				receiptScans: prReceiptScans,
			});
			if (drinkUnits > 0) map.set(prId, drinkUnits);
		}
		return map;
	}, [
		floorSalesStarted,
		shift,
		outletName,
		rosterTonight,
		outletWorkspace.drinkMenu,
		prReceiptScans,
	]);

	const tonightFloorTotals = useMemo(() => {
		if (!floorSalesStarted) {
			return {
				totalSalesRm: 0,
				totalDrinksRm: 0,
				drinkUnits: 0,
				totalTipsRm: 0,
			};
		}
		return outletTonightFloorTotals({
			shift,
			outletName,
			drinkMenu: outletWorkspace.drinkMenu ?? [],
			rosterSlots: rosterTonight,
			prIds: shift.prs ?? [],
			receiptScans: prReceiptScans,
		});
	}, [
		floorSalesStarted,
		shift,
		outletName,
		outletWorkspace.drinkMenu,
		rosterTonight,
		prReceiptScans,
	]);

	const toggleTag = (tag: string) => {
		setTags((cur) =>
			cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag],
		);
	};

	const staffHint =
		staffTonight.length === 0
			? "No PRs yet"
			: [
					statusCounts.onDuty > 0 ? `${statusCounts.onDuty} on duty` : null,
					statusCounts.enRoute > 0 ? `${statusCounts.enRoute} en route` : null,
					statusCounts.checkedOut > 0
						? `${statusCounts.checkedOut} checked out`
						: null,
					statusCounts.booked > 0 ? `${statusCounts.booked} booked` : null,
				]
					.filter(Boolean)
					.join(" · ");

	if (!canRate) return null;

	return (
		<div className={cn("!mb-0", className)}>
			{postSealRatePrompt && canRate && (
				<div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-[rgba(232,194,122,.3)] bg-[rgba(232,194,122,.06)] px-3 py-2">
					<p className="text-xs font-semibold">
						Rate {postSealRatePrompt.prIds.length} PR
						{postSealRatePrompt.prIds.length !== 1 ? "s" : ""} · 24h
					</p>
					<button
						type="button"
						className="iz-chip text-[10px]"
						onClick={() => clearPostSealRatePrompt()}
					>
						Dismiss
					</button>
				</div>
			)}

			<OutletSection
				id={OUTLET_PR_TONIGHT_SECTION_ID}
				title="PR tonight"
				hint={staffHint}
				collapsible
				open={prTonightOpen}
				onOpenChange={setPrTonightOpen}
				className="!mb-0"
			>
				{staffTonight.length === 0 ? (
					<p className="iz-tiny iz-muted rounded-xl border border-dashed border-[var(--iz-line)] px-4 py-6 text-center">
						No PRs assigned for tonight yet.
					</p>
				) : (
					<div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
						{staffTonight.map(({ pr, slot, displayStatus }) => {
							const agencyProfile = agencyPrById.get(pr.id);
							const comcardPr = agencyProfile
								? toComcardPreview(agencyProfile)
								: comcardPreviewFromSlot({ prId: pr.id, prName: pr.name });
							const langs = agencyProfile
								? languagesFromPr(agencyProfile)
								: pr.languages;
							const drinkUnits = liveDrinkUnitsByPrId.get(pr.id);
							// Agency label: prefer the shift's assigning agency (slot), else fall back to the
							// PR's own owning agency — so a Delta PR (e.g. Sofia) reads "Delta Agency" here,
							// not the Atlas default, even when the slot carries no explicit agency tag.
							const ownerAgencyName = agencyProfile
								? getPrAgencyById(agencyIdOf(agencyProfile))?.name
								: undefined;
							const agencyLabel = slot
								? rosterSlotAgencyName(slot, ownerAgencyName)
								: ownerAgencyName;
							const opsLine = [
								// A stamp renders LOCAL time. A backend slot carries the full
								// UTC ISO string, so this line read
								// "Out 2026-08-06T06:17:45.947Z" — and 06:17Z is 2:17 pm here.
								displayStatus === "on-duty" && slot?.checkedInAt
									? `In ${formatAttendanceStamp(slot.checkedInAt, slot.dateIso)}`
									: displayStatus === "checked-out" && slot?.checkedOutAt
										? `Out ${formatAttendanceStamp(slot.checkedOutAt, slot.dateIso)}`
										: null,
								drinkUnits ? `${drinkUnits} drinks` : null,
								agencyLabel ?? null,
							]
								.filter(Boolean)
								.join(" · ");

							return (
								<div
									key={pr.id}
									className="iz-outlet-pr-tonight-card flex flex-col gap-1.5 rounded-xl border border-[var(--iz-line)] bg-[var(--iz-grad-card)] p-2"
								>
									<button
										type="button"
										className="iz-comcard-3d-preview-btn relative w-full text-left"
										aria-label={`View comcard for ${pr.name}`}
										onClick={() => setComcardPreviewId(pr.id)}
									>
										<IzPill
											variant={workforceStatusVariant(displayStatus)}
											className="absolute right-1 top-1 z-10 !py-0.5 shadow-sm"
										>
											{workforceStatusLabel(displayStatus)}
										</IzPill>
										<Comcard3dPreviewCard
											pr={comcardPr}
											trainingLevel={agencyProfile?.trainingLevel}
											rating={agencyProfile?.rating ?? pr.rating}
											languages={langs}
											place={agencyProfile?.place}
										/>
									</button>

									{opsLine && (
										<p className="iz-outlet-pr-tonight-card__ops iz-muted2 line-clamp-2">
											{opsLine}
										</p>
									)}

									<button
										type="button"
										onClick={() => setLiveSalesPrId(pr.id)}
										className="iz-btn iz-btn-soft iz-btn-sm iz-outlet-pr-tonight-card__btn w-full"
									>
										<TitleWithIcon>Live sales</TitleWithIcon>
									</button>

									<button
										type="button"
										onClick={() => setHistoryPrId(pr.id)}
										className="iz-btn iz-btn-soft iz-btn-sm iz-outlet-pr-tonight-card__btn w-full"
									>
										<TitleWithIcon>Shift history</TitleWithIcon>
									</button>

									{displayStatus === "checked-out" && (
										<button
											type="button"
											onClick={() => setOpenPr(pr.id)}
											className="iz-btn iz-btn-soft iz-btn-sm iz-outlet-pr-tonight-card__btn w-full"
										>
											<TitleWithIcon>Rate</TitleWithIcon>
										</button>
									)}
								</div>
							);
						})}
					</div>
				)}
				<OutletSection
					id={OUTLET_LIVE_SALES_SECTION_ID}
					title="Live sales"
					collapsible
					open={liveSalesOpen}
					onOpenChange={setLiveSalesOpen}
					className="iz-outlet-live-sales-section !mt-3"
					collapsedPreview={
						<OutletTonightSummaryTable
							floorTotals={tonightFloorTotals}
							outletSubRole={outletSubRole}
							drinkMenu={outletWorkspace.drinkMenu ?? []}
							shift={shift}
							variant="collapsed"
						/>
					}
				>
					<OutletTonightSummaryTable
						floorTotals={tonightFloorTotals}
						outletSubRole={outletSubRole}
						drinkMenu={outletWorkspace.drinkMenu ?? []}
						shift={shift}
						variant="embedded"
					/>
					<OutletPrLiveSalesFloorTable
						rows={liveEarningsRows}
						onRowClick={(prId) => setLiveSalesPrId(prId)}
					/>
				</OutletSection>
			</OutletSection>

			<IzSheet
				open={!!comcardPreviewPr}
				onClose={() => setComcardPreviewId(null)}
				comcard
			>
				{comcardPreviewPr && (
					<div className="iz-outlet-comcard-sheet">
						<p className="iz-outlet-comcard-sheet__meta">
							<span className="font-sora font-bold text-[var(--iz-txt)]">
								{comcardPreviewPr.name}
							</span>
							{(() => {
								const slot = rosterTonight.find(
									(s) => s.prId === comcardPreviewId,
								);
								const owner = comcardPreviewId
									? agencyPrById.get(comcardPreviewId)
									: undefined;
								const ownerAgencyName = owner
									? getPrAgencyById(agencyIdOf(owner))?.name
									: undefined;
								const label = slot
									? rosterSlotAgencyName(slot, ownerAgencyName)
									: ownerAgencyName;
								return label ? (
									<span className="iz-muted"> · {label}</span>
								) : null;
							})()}
						</p>
						<Comcard3dPreviewVisual
							pr={comcardPreviewPr}
							showName={false}
							compact
						/>
						<div className="iz-outlet-comcard-sheet__pills">
							{comcardPreviewProfile?.trainingLevel && (
								<TierBadge tier={comcardPreviewProfile.trainingLevel} />
							)}
							{comcardPreviewProfile?.rating != null && (
								<IzPill variant="gold" className="!py-0.5 !text-[9px]">
									{comcardPreviewProfile.rating}★
								</IzPill>
							)}
							{(comcardPreviewProfile
								? languagesFromPr(comcardPreviewProfile)
								: []
							)
								.slice(0, 3)
								.map((lang) => (
									<IzPill
										key={lang}
										variant="violet"
										className="!py-0.5 !text-[9px]"
									>
										{lang}
									</IzPill>
								))}
						</div>
					</div>
				)}
			</IzSheet>

			{historyPr && (
				<OutletPrShiftHistorySheet
					open
					onClose={() => setHistoryPrId(null)}
					prId={historyPr.id}
					prName={historyPr.name}
					outletName={outletName}
					agencyName={historyPrAgency || undefined}
				/>
			)}

			{liveSalesBreakdown && (
				<OutletPrLiveSalesSheet
					open
					onClose={() => setLiveSalesPrId(null)}
					shiftEvent={shift.event}
					breakdown={liveSalesBreakdown}
				/>
			)}

			{openPr && openPrData && openPrCheckedOut && canRate && (
				<IzSheet open onClose={() => setOpenPr(null)} rating>
					<div className="iz-outlet-rate-sheet">
						<div className="mb-4 flex items-center gap-3">
							<Comcard3dPreviewThumb
								pr={
									agencyPrById.get(openPrData.id)
										? toComcardPreview(agencyPrById.get(openPrData.id)!)
										: comcardPreviewFromSlot({
												prId: openPrData.id,
												prName: openPrData.name,
											})
								}
							/>
							<h3 className="font-sora text-lg font-bold">
								Rate {openPrData.name}
							</h3>
						</div>
						<div className="flex justify-center gap-2">
							{[1, 2, 3, 4, 5].map((n) => (
								<button
									key={n}
									type="button"
									onClick={() => setStars(n as 1 | 2 | 3 | 4 | 5)}
								>
									<Star
										className={`h-8 w-8 ${n <= stars ? "fill-[var(--iz-gold)] text-[var(--iz-gold)]" : "text-[var(--iz-muted2)]"}`}
									/>
								</button>
							))}
						</div>
						<div className="mt-4 flex flex-wrap justify-center gap-1.5">
							{PR_RATING_TAGS.map((tag) => (
								<button
									key={tag}
									type="button"
									onClick={() => toggleTag(tag)}
									className={`iz-pill !text-[10px] ${tags.includes(tag) ? "iz-pill-violet" : "iz-pill-ink"}`}
								>
									{tag}
								</button>
							))}
						</div>
						<textarea
							value={note}
							onChange={(e) => setNote(e.target.value)}
							placeholder={PR_RATING_NOTE_PLACEHOLDERS[stars]}
							className="mt-4 h-24 w-full rounded-xl border border-[var(--iz-line2)] bg-white/[0.03] p-3.5 text-sm outline-none"
						/>
						<button
							type="button"
							onClick={() => {
								ratePr(openPr, stars, note, tags.length > 0 ? tags : undefined);
								setOpenPr(null);
							}}
							className="iz-btn iz-btn-primary mt-4 w-full"
						>
							Submit
						</button>
					</div>
				</IzSheet>
			)}
		</div>
	);
}
