import { AgencyAttendanceFixPanel } from "@agency-portal/components/agency/AgencyAttendanceFixPanel";
import { AgencyGpsPanel } from "@agency-portal/components/agency/AgencyGpsPanel";
import { BackfillPanel } from "@agency-portal/components/agency/BackfillPanel";
import { RosterAutoAssignBanner } from "@agency-portal/components/agency/RosterAutoAssignBanner";
import { RosterBackendTimetable } from "@agency-portal/components/agency/RosterBackendTimetable";
import { RosterPlanningDatePicker } from "@agency-portal/components/agency/RosterPlanningDatePicker";
import { RosterShiftFilters } from "@agency-portal/components/agency/RosterShiftFilters";
import {
	RosterShiftTable,
	rosterSlotDisplayPayout,
} from "@agency-portal/components/agency/RosterShiftTable";
import { RosterTimetableFilters } from "@agency-portal/components/agency/RosterTimetableFilters";
import { IzSheet } from "@agency-portal/components/iz/Sheet";
import {
	LabelWithIcon,
	TitleWithIcon,
} from "@agency-portal/components/iz/TitleWithIcon";
import {
	formatRM,
	IzCard,
	IzCardTitle,
	IzPill,
	IzSelect,
} from "@agency-portal/components/iz/ui";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import { useAgencyPrs } from "@agency-portal/hooks/use-agency-prs";
import { useOutletSwapMutations } from "@agency-portal/hooks/use-outlet-swap-mutations";
import { useRosterMutations } from "@agency-portal/hooks/use-roster-mutations";
import { useRosterSlots } from "@agency-portal/hooks/use-roster-slots";
import { useSwapOutletTargets } from "@agency-portal/hooks/use-swap-outlet-targets";
import {
	type AgencyRosterSlot,
	scopeToAgency,
} from "@agency-portal/lib/agency-demo";
import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import {
	type AgencyOutletAvailableShift,
	listAvailableShiftsForEarlyReleaseReassign,
} from "@agency-portal/lib/agency-outlet-shifts";
import { formatPayeeLabel } from "@agency-portal/lib/agency-payroll";
import { formatAttendanceStamp } from "@agency-portal/lib/attendance-stamp";
import { iconForLabel } from "@agency-portal/lib/lucide-label-icons";
import { listEarlyReleasedPrsForReassign } from "@agency-portal/lib/outlet-demo";
import type { RosterShiftEarningsContext } from "@agency-portal/lib/outlet-financial-sync";
import { parseShiftWindow } from "@agency-portal/lib/portal-sync";
import { recordRating } from "@agency-portal/lib/pr-rating-summary";
import {
	DEFAULT_ROSTER_DATE_ISO,
	getPrScheduleState,
} from "@agency-portal/lib/roster-availability";
import {
	countTimetableMatchingSlots,
	EMPTY_ROSTER_SHIFT_FILTERS,
	EMPTY_ROSTER_TIMETABLE_FILTERS,
	filterRosterShifts,
	filterTimetablePrs,
	type RosterShiftFilterState,
	type RosterTimetableFilterState,
} from "@agency-portal/lib/roster-shift-filters";
import {
	dedupeLiveRosterByPr,
	rosterWeekStart,
	weekDayIsos,
} from "@agency-portal/lib/roster-week-plan";
import { useStore } from "@agency-portal/lib/store";
import { useAgencyCan } from "@agency-portal/lib/use-portal-can";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ArrowLeftRight,
	Calendar,
	ChevronRight,
	MapPin,
	Trash2,
	Users,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

type ViewMode = "live" | "planning";

export const Route = createFileRoute("/agency/roster")({
	validateSearch: (search: Record<string, unknown>): { view?: ViewMode } =>
		search.view === "planning" ? { view: "planning" } : {},
	component: AgencyRoster,
});

function AgencyRoster() {
	const { t } = usePortalLocale();
	const navigate = useNavigate({ from: Route.fullPath });
	const { view } = Route.useSearch();
	const viewMode: ViewMode = view ?? "live";
	const setViewMode = (next: ViewMode) =>
		navigate({ search: next === "live" ? {} : { view: next } });
	const allAgencyPRs = useStore((s) => s.agencyPRs);
	const activeAgencyId = useStore((s) => s.activeAgencyId);
	const toast = useStore((s) => s.toast);
	// 🔴 THE ROSTER'S PR FACTS COME FROM THE SAME PLACE MANAGE PR READS.
	//
	// This used to be `scopeToAgency(useStore(s => s.agencyPRs), …)` — the DEMO
	// slice, which `buildBlankPortalReset` sets to [] on every real login. So the
	// Shifts table below was handed backend slots (real UUID prIds) together with
	// an EMPTY roster, and `prById.get(slot.prId)` was undefined for every row.
	// That one mismatch is the whole reported bug: no comcard photo, height /
	// weight / age as em-dashes, NO languages at all (which is why the popover
	// showed three of Vicky's four — it was actually showing the slot's own
	// nothing), no tier tag, no place, an empty swap-replacement picker, and a
	// Planning filter header reading "0 of 0 PRs" above a table full of rows.
	//
	// `useAgencyPrs` owns the very ["roster","prs"] cache entry `useRosterSlots`
	// already fills, so this is zero extra network — the same rows, put through
	// `managedPrFromBackend` instead of thrown away. The join is exact:
	// AgencyManagedPR.id === PrPersonnel.id === agency_pr.user_id === slot.prId.
	//
	// Demo sessions have no backend identity and their PRs only exist in the
	// store, so they keep reading it — `scopeToAgency` is theirs alone now
	// (GET /pr is already agency-scoped server-side).
	const backed = useMemo(() => getAgencyIdentity() !== null, []);
	const { prs: backendPRs } = useAgencyPrs({ enabled: backed });
	const agencyPRs = useMemo(
		() => (backed ? backendPRs : scopeToAgency(allAgencyPRs, activeAgencyId)),
		[backed, backendPRs, allAgencyPRs, activeAgencyId],
	);
	const [planningDate, setPlanningDate] = useState(DEFAULT_ROSTER_DATE_ISO);
	// Sun–Sat, the payroll week — the same seven days the auto-assign planner
	// counts for fairness and the PV lane settles.
	const weekStartIso = rosterWeekStart(planningDate);
	const weekDays = useMemo(() => weekDayIsos(weekStartIso), [weekStartIso]);
	// Both views read live backend data. Planning loads the picked week; live
	// pins to today so the Shifts table + KPIs reflect tonight's real roster —
	// assignments made in Planning are the same backend rows, so a shift booked
	// for today shows up here the moment it's saved.
	const backendRoster = useRosterSlots({
		fromDate: viewMode === "live" ? DEFAULT_ROSTER_DATE_ISO : weekStartIso,
		toDate:
			viewMode === "live"
				? DEFAULT_ROSTER_DATE_ISO
				: (weekDays[weekDays.length - 1] ?? weekStartIso),
	});
	const agencyRoster = backendRoster.slots;
	const prCheckInMeta = useStore((s) => s.prCheckInMeta);
	const prSubRole = useStore((s) => s.prSubRole);
	// `editRosterSlot`, `cancelRosterShift` and `flagRosterAttendance` were read
	// here until the live-view handlers were pointed at the backend. They are
	// gone rather than left dangling: a demo action still subscribed beside a
	// backend one is how the two got wired together by accident.
	// Outlet swaps are backend-backed: the demo store's requestOutletSwap matched
	// the slot id against `agencyRoster`, but the roster now renders backend
	// slots whose id is a shift_assignment UUID, so it silently found nothing
	// and the button did nothing.
	const outletSwap = useOutletSwapMutations();
	const prSwapRequests = useStore((s) => s.prSwapRequests);
	const approvePrSwapRequest = useStore((s) => s.approvePrSwapRequest);
	const declinePrSwapRequest = useStore((s) => s.declinePrSwapRequest);
	// `demoAutoAssignPr` is no longer read here — it moved inside
	// RosterAutoAssignBanner, which only reaches it in a demo session.
	const assignPrToOutlet = useStore((s) => s.assignPrToOutlet);
	const syncLivePrCheckInToRoster = useStore(
		(s) => s.syncLivePrCheckInToRoster,
	);
	const syncOutletRequestRoster = useStore((s) => s.syncOutletRequestRoster);
	const [shiftFilters, setShiftFilters] = useState<RosterShiftFilterState>(
		EMPTY_ROSTER_SHIFT_FILTERS,
	);
	const [timetableFilters, setTimetableFilters] =
		useState<RosterTimetableFilterState>(EMPTY_ROSTER_TIMETABLE_FILTERS);
	const [editId, setEditId] = useState<string | null>(null);
	const [approveSwapId, setApproveSwapId] = useState<string | null>(null);
	const [replacementPick, setReplacementPick] = useState("");
	const canAssign = useAgencyCan()("assignShifts");

	// The by-id write actions hit the backend in BOTH views.
	//
	// 🔴 They used to branch on `viewMode === "planning"`, sending the live view
	// to the demo store instead — but `agencyRoster` above is the BACKEND slots in
	// both views, so a live-view slot id is a shift_assignment UUID. The demo
	// actions look that id up in a demo slice that has never contained backend
	// UUIDs, find nothing, and return silently: cancelling a shift or flagging a
	// no-show from the Live tab did NOTHING, while the sheet closed as though it
	// had worked.
	//
	// This is the identical failure already recorded for outlet swap a few lines
	// up — same cause, three more handlers, missed because that fix was described
	// as being about swaps rather than about ids. *When a screen changes where its
	// rows come from, every action keyed by row id has to move with them.*
	const rosterMut = useRosterMutations();
	// No handleCancelSlot: the agency does not cancel a venue's shift, and the
	// button that claimed to only ever wrote `cancelled` to the ASSIGNMENT —
	// which is what Remove assignment already does honestly. See the note in the
	// edit sheet.
	const handleFlagNoShow = (slotId: string) =>
		rosterMut.flagNoShow.mutate(slotId);
	// No handleEditSave either, and this one was worse than dead — it was LOSSY.
	//
	// The sheet has had no status control for a while (see the note in it), so
	// "Save changes" could only ever re-send the status the sheet was already
	// showing. But that status is a PROJECTION: `rosterStatusFromAssignment` folds
	// backend `completed` into the roster's "scheduled", and the write mapper
	// turns "scheduled" back into `confirmed`. So pressing Save on a finished
	// shift demoted `completed` → `confirmed` — and the weekly voucher job reads
	// `completed` rows only, so a worked night quietly left payroll, from a button
	// whose whole job was to change nothing.
	//
	// A sheet with no control over a field has no business writing that field. The
	// footer is a plain Close now.

	// biome-ignore lint/correctness/useExhaustiveDependencies(agencyRoster.length): the roster count is the re-run TRIGGER, not a value read here — slots that arrive after first render still have to be synced with the live check-in. Dropping it makes this a one-shot sync (the store action is stable), so a late-loading slot would render as never checked in.
	useEffect(() => {
		syncLivePrCheckInToRoster();
	}, [syncLivePrCheckInToRoster, agencyRoster.length]);

	const dates = useMemo(
		() => [...new Set(agencyRoster.map((s) => s.dateIso))].sort(),
		[agencyRoster],
	);

	/**
	 * The outlets the filter bars offer — taken from the ROWS THEMSELVES.
	 *
	 * Both bars used to map `OUTLET_NAMES`, a demo constant, so a real agency was
	 * offered five venues it does not staff while its own sat in the grid.
	 * Deriving from `agencyRoster` means an option can never fail to match
	 * something, and it needs no extra request — unlike the roster's own outlets
	 * query, which fetches EVERY outlet on the platform (no `linkedToAgencyId`)
	 * and would offer venues this agency has nothing to do with.
	 */
	const rosterOutletNames = useMemo(
		() =>
			[...new Set(agencyRoster.map((s) => s.outlet).filter(Boolean))].sort(),
		[agencyRoster],
	);

	const liveDateIso = DEFAULT_ROSTER_DATE_ISO;

	const dateFiltered = useMemo(
		() =>
			dedupeLiveRosterByPr(
				agencyRoster.filter((s) => s.dateIso === liveDateIso),
			),
		// `liveDateIso` is a module constant (DEFAULT_ROSTER_DATE_ISO), fixed for
		// the life of the tab, so it can never re-trigger this memo.
		[agencyRoster],
	);

	const filtered = useMemo(
		() =>
			[...filterRosterShifts(dateFiltered, shiftFilters)].sort((a, b) =>
				a.prName.localeCompare(b.prName, undefined, { sensitivity: "base" }),
			),
		[dateFiltered, shiftFilters],
	);

	const pendingPrSwaps = useMemo(
		() =>
			prSwapRequests.filter((s) => {
				if (s.status !== "pending_agency" && s.status !== "pending_replacement")
					return false;
				const slot = agencyRoster.find((r) => r.id === s.rosterSlotId);
				if (slot && slot.prId !== s.requestingPrId) return false;
				return true;
			}),
		[prSwapRequests, agencyRoster],
	);
	const outletRequestCount = agencyRoster.filter(
		(s) => s.status === "outlet-request-pending",
	).length;
	const swapCount = pendingPrSwaps.length;
	const swapToApprove = approveSwapId
		? prSwapRequests.find(
				(s) => s.id === approveSwapId && s.status === "pending_agency",
			)
		: null;
	const replacementCandidates = useMemo(
		() =>
			agencyPRs.filter(
				(p) =>
					!p.suspended && !p.detached && p.id !== swapToApprove?.requestingPrId,
			),
		[agencyPRs, swapToApprove?.requestingPrId],
	);
	const editSlot = agencyRoster.find((s) => s.id === editId);

	const outletCommissionRules = useStore((s) => s.outletCommissionRules);
	const perDrinkRm = useStore((s) => s.outletWorkspace.perDrinkRm);
	const drinkMenu = useStore((s) => s.outletWorkspace.drinkMenu ?? []);
	const prReceiptScans = useStore((s) => s.prReceiptScans ?? []);
	const outletWorkspace = useStore((s) => s.outletWorkspace);
	const shifts = useStore((s) => s.shifts);
	const shiftApplicants = useStore((s) => s.shiftApplicants);

	// biome-ignore lint/correctness/useExhaustiveDependencies(shifts): the shift list is the re-run TRIGGER, not a value read here — the sync rebuilds roster rows from whatever outlet requests now exist, so a new or edited shift has to re-run it.
	// biome-ignore lint/correctness/useExhaustiveDependencies(shiftApplicants): same trigger role — an applicant arriving changes the rows this sync writes, and the store action itself is stable, so without these two it would run once and never again.
	useEffect(() => {
		syncOutletRequestRoster();
	}, [syncOutletRequestRoster, shifts, shiftApplicants]);

	const earlyReleasedAvailable = useMemo(
		() => listEarlyReleasedPrsForReassign(shifts, agencyPRs),
		[shifts, agencyPRs],
	);

	const activeCount = useMemo(
		() =>
			dateFiltered.filter((s) => s.status === "on-duty" && !!s.checkedInAt)
				.length,
		[dateFiltered],
	);
	const unavailableCount = useMemo(
		() => dateFiltered.filter((s) => s.status === "unavailable").length,
		[dateFiltered],
	);
	/** Scheduled / pending — excludes on-duty (active) and unavailable so KPIs partition tonight. */
	const plannedCount = useMemo(
		() =>
			dateFiltered.filter(
				(s) =>
					s.status !== "unavailable" &&
					!(s.status === "on-duty" && !!s.checkedInAt),
			).length,
		[dateFiltered],
	);
	/** Same formula + same rows as the Shifts table Est. payout column. */
	const estPayoutLive = useMemo(() => {
		const prById = new Map(agencyPRs.map((p) => [p.id, p]));
		const earningsContext: RosterShiftEarningsContext | null =
			outletWorkspace.tierRates
				? {
						rosterScope: dateFiltered,
						agencyPRs,
						outletShifts: shifts,
						drinkMenu,
						receiptScans: prReceiptScans,
						happyHourStart: outletWorkspace.happyHourStart,
						happyHourEnd: outletWorkspace.happyHourEnd,
						workspaceTierRates: outletWorkspace.tierRates,
						commissionOnlyRates: outletWorkspace.commissionOnlyRates,
					}
				: null;
		return filtered.reduce(
			(sum, slot) =>
				sum +
				rosterSlotDisplayPayout(
					slot,
					prById.get(slot.prId),
					outletCommissionRules,
					perDrinkRm,
					shifts,
					drinkMenu,
					prReceiptScans,
					earningsContext,
				),
			0,
		);
	}, [
		filtered,
		agencyPRs,
		dateFiltered,
		outletCommissionRules,
		perDrinkRm,
		shifts,
		drinkMenu,
		prReceiptScans,
		outletWorkspace.tierRates,
		outletWorkspace.commissionOnlyRates,
		outletWorkspace.happyHourStart,
		outletWorkspace.happyHourEnd,
	]);
	/**
	 * PRs ROSTERED this week — assignment rows, not posted shifts.
	 *
	 * The tile above read "Shifts this week" until 24 Aug 2026, which is a
	 * different number and a much more obvious one: a week holding two posted
	 * shifts with ten open seats and nobody booked showed 0, and the owner
	 * reasonably read that as broken. It was right — `agencyRoster` is
	 * `backendRoster.slots`, and a slot is a shift_assignment. Renamed rather
	 * than recounted: "how much of this week have we actually staffed" is the
	 * useful question, it just had to say so.
	 */
	const weekScheduled = useMemo(
		() =>
			agencyRoster.filter(
				(s) => weekDays.includes(s.dateIso) && s.status !== "unavailable",
			),
		[agencyRoster, weekDays],
	);
	const estLabour = useMemo(
		() =>
			weekScheduled.reduce((s, slot) => s + (slot.estPayout ?? 350), 0) * 1.08,
		[weekScheduled],
	);

	const activePrs = useMemo(
		() => agencyPRs.filter((p) => !p.suspended && !p.detached),
		[agencyPRs],
	);
	const filteredTimetablePrs = useMemo(
		() =>
			filterTimetablePrs(
				activePrs,
				agencyRoster,
				weekDays,
				timetableFilters,
				(prId, dateIso) => getPrScheduleState(prId, agencyRoster, dateIso),
			),
		[activePrs, agencyRoster, weekDays, timetableFilters],
	);
	const timetableShiftCount = useMemo(
		() =>
			countTimetableMatchingSlots(
				agencyRoster,
				weekDays,
				new Set(filteredTimetablePrs.map((p) => p.id)),
				timetableFilters,
			),
		[agencyRoster, weekDays, filteredTimetablePrs, timetableFilters],
	);
	const weekShiftTotal = useMemo(
		() => agencyRoster.filter((s) => weekDays.includes(s.dateIso)).length,
		[agencyRoster, weekDays],
	);

	const openEdit = useCallback((id: string) => setEditId(id), []);

	/** "(Vicky) Victoria Tan Mei Lin" for a slot, from the canonical PR record. */
	const prLabelForSlot = useCallback(
		(slot: AgencyRosterSlot) => {
			const pr = agencyPRs.find((p) => p.id === slot.prId);
			// No record behind the slot: the slot's own name is genuinely all we
			// hold — do not invent the missing half.
			return pr ? formatPayeeLabel(pr.name, pr.icName) : slot.prName;
		},
		[agencyPRs],
	);

	return (
		<div className="iz-screen iz-roster-page">
			<header className="iz-roster-head">
				<TitleWithIcon
					icon={Calendar}
					iconClassName="h-4 w-4 shrink-0 text-[var(--iz-gold-l)]"
					className="font-sora text-lg font-extrabold tracking-tight text-[var(--iz-txt)] md:text-xl"
				>
					{t.nav.roster}
				</TitleWithIcon>
				{(outletRequestCount > 0 || swapCount > 0) && (
					<div className="iz-roster-head-badges">
						{outletRequestCount > 0 && (
							<IzPill variant="amber">
								{fill(
									outletRequestCount === 1
										? t.agencyPrs.outletRequestOne
										: t.agencyPrs.outletRequestMany,
									{ n: outletRequestCount },
								)}
							</IzPill>
						)}
						{swapCount > 0 && (
							<IzPill variant="violet">
								{fill(
									swapCount === 1
										? t.agencyPrs.swapCountOne
										: t.agencyPrs.swapCountMany,
									{ n: swapCount },
								)}
							</IzPill>
						)}
					</div>
				)}
			</header>

			<div className="iz-roster-toolbar">
				<div className="iz-roster-toggle">
					<button
						type="button"
						className={viewMode === "live" ? "on live" : ""}
						onClick={() => setViewMode("live")}
					>
						{t.roster.live}
					</button>
					<button
						type="button"
						className={viewMode === "planning" ? "on plan" : ""}
						onClick={() => setViewMode("planning")}
					>
						{t.roster.planning}
					</button>
				</div>
				<div className="iz-roster-filters">
					{viewMode === "live" ? (
						// A plain <div> has the generic role, which takes no accessible
						// name — the aria-label that used to sit here was dropped by
						// assistive tech anyway. The visible "Today" beside the calendar
						// icon is the label.
						<div className="iz-roster-date-live">
							<Calendar className="h-3.5 w-3.5 shrink-0 text-[var(--iz-gold-l)]" />
							<span>{t.common.today}</span>
						</div>
					) : (
						<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
							<RosterPlanningDatePicker
								value={planningDate}
								onChange={setPlanningDate}
								rosterDates={dates}
								weekly
								placeholder={t.roster.pickWeek}
								hint={t.roster.weekHint}
							/>
						</div>
					)}
				</div>
				{canAssign && (
					<Link to="/agency/prs" className="iz-roster-pr-link">
						<Users className="h-3.5 w-3.5" />
						{t.nav.managePr}
						<ChevronRight className="h-3.5 w-3.5" />
					</Link>
				)}
			</div>

			<div className={`iz-roster-kpis${viewMode === "live" ? " cols-4" : ""}`}>
				{viewMode === "live" ? (
					<>
						{/* `LabelWithIcon` with no `icon` resolves one from the rendered
						    text, which is now translated — every KPI glyph would vanish
						    outside English. Resolve from the ENGLISH label instead.
						    `iconForLabel`, not `iconForNav`: a miss must stay iconless the
						    way it is today, never degrade to a "?". */}
						<div className="iz-roster-kpi">
							<span className="n">{plannedCount}</span>
							<LabelWithIcon
								label={t.roster.plannedPrs}
								icon={iconForLabel("Planned PRs")}
								className="l"
							/>
						</div>
						<div className="iz-roster-kpi">
							<span className="n">{activeCount}</span>
							<LabelWithIcon
								label={t.roster.activePrs}
								icon={iconForLabel("Active PRs")}
								className="l"
							/>
						</div>
						<div className="iz-roster-kpi">
							<span className="n">{unavailableCount}</span>
							<LabelWithIcon
								label={t.roster.unavailablePrs}
								icon={iconForLabel("Unavailable PRs")}
								className="l"
							/>
						</div>
						<div className="iz-roster-kpi">
							<span className="n gold">{formatRM(estPayoutLive)}</span>
							<LabelWithIcon
								label={t.roster.estPayout}
								icon={iconForLabel("Est payout")}
								className="l"
							/>
						</div>
					</>
				) : (
					<>
						<div className="iz-roster-kpi">
							<span className="n">{weekScheduled.length}</span>
							<LabelWithIcon
								label={t.roster.prsRosteredThisWeek}
								icon={iconForLabel("PRs rostered this week")}
								className="l"
							/>
						</div>
						<div className="iz-roster-kpi">
							<span className="n gold">{formatRM(estLabour)}</span>
							<LabelWithIcon
								label={t.roster.estLabourCost}
								icon={iconForLabel("Est labour cost")}
								className="l"
							/>
						</div>
					</>
				)}
			</div>

			{viewMode === "live" && earlyReleasedAvailable.length > 0 && (
				<div className="mb-3 mt-3 rounded-xl border border-[rgba(244,183,64,.28)] bg-[rgba(244,183,64,.08)] px-3 py-2.5">
					<p className="text-xs font-semibold text-[var(--iz-amber)]">
						{t.roster.releasedEarlyReassign}
					</p>
					<p className="iz-tiny iz-muted2 mt-1 leading-snug">
						{fill(t.agencyPrs.releasedEarlyAssignHint, {
							names: earlyReleasedAvailable
								.map((r) =>
									fill(
										r.releasedAt
											? t.agencyPrs.releasedFromAt
											: t.agencyPrs.releasedFrom,
										{
											name: r.prName,
											outlet: r.fromOutlet,
											time: r.releasedAt ?? "",
										},
									),
								)
								.join(" · "),
						})}
					</p>
				</div>
			)}

			{viewMode === "live" && (
				<div className="iz-roster-gps">
					{/*
						A real session reads attendance stamps from the backend; a demo
						session keeps the old demo-fixture panel verbatim. Two components
						rather than one fed from two sources — the backed one reports
						positions recorded at check-in and check-out and says so, while the
						demo one still presents a moving "Live GPS" that no stored data
						supports.
					*/}
					{getAgencyIdentity() !== null ? (
						<AgencyAttendanceFixPanel dateIso={liveDateIso} />
					) : (
						<AgencyGpsPanel
							roster={agencyRoster}
							agencyPRs={agencyPRs}
							dateIso={liveDateIso}
							prCheckInMeta={prCheckInMeta}
							prSubRole={prSubRole}
						/>
					)}
				</div>
			)}

			{viewMode === "planning" && (
				<div className="iz-roster-planning">
					{/* Filters FIRST (owner, 3 Sep 2026): they narrow both the open-demand
					    row and the week grid below, so they belong with the week picker
					    above rather than buried under the auto-assign banner. Lifted out
					    of the panel, which framed them only visually — the bar carries its
					    own border and background, and the panel's one filter rule targets
					    a class no component uses. */}
					<RosterTimetableFilters
						filters={timetableFilters}
						onChange={(patch) =>
							setTimetableFilters((prev) => ({ ...prev, ...patch }))
						}
						prCount={filteredTimetablePrs.length}
						totalPrs={activePrs.length}
						shiftCount={timetableShiftCount}
						totalShifts={weekShiftTotal}
						outletNames={rosterOutletNames}
					/>
					{/* Backend plan + confirm sheet, shared with the home card. The demo
					    store's one-PR action lives on inside it, for demo sessions only. */}
					{canAssign && <RosterAutoAssignBanner dateIso={planningDate} />}
					<div className="iz-roster-planning-panel">
						<RosterBackendTimetable
							weekStartIso={weekStartIso}
							roster={agencyRoster}
							filters={timetableFilters}
							canAssign={canAssign}
							onEditSlot={openEdit}
							onWeekChange={setPlanningDate}
							onAssign={async (shiftId, prId, userId) => {
								const created = await rosterMut.assign.mutateAsync({
									shiftId,
									prId,
									userId,
								});
								// mutateAsync resolved = the server answered 201, so the
								// assignment row is already committed — the pop-up never
								// claims a save that didn't land.
								toast(t.agencyPrs.prAssignedSaved, "success");
								return created;
							}}
							todayIso={DEFAULT_ROSTER_DATE_ISO}
						/>
					</div>
				</div>
			)}

			{/* MC/leave requests are reviewed on the Approvals page only — the roster
			    keeps the staffing consequence (backfill), not the decision. */}

			{/* Released slots (cancel / approved leave) still short-staffed — pick a
			    ranked free PR to refill via the normal assign mutation. */}
			<BackfillPanel canAct={canAssign} />

			{canAssign && pendingPrSwaps.length > 0 && (
				<OutletSection
					title={t.roster.prSwapRequests}
					iconKey="PR swap requests"
					hint={fill(t.agencyPrs.pendingCount, {
						n: pendingPrSwaps.length,
					})}
					className="!mt-4"
				>
					<div className="grid gap-2 md:grid-cols-2">
						{pendingPrSwaps.map((swap) => (
							<IzCard key={swap.id}>
								<p className="font-sora text-sm font-bold">
									{swap.requestingPrName}
								</p>
								<p className="iz-tiny iz-muted mt-0.5">
									{swap.targetOutlet
										? `${swap.outlet} → ${swap.targetOutlet}`
										: swap.outlet}{" "}
									· {swap.date} · {swap.shift}
								</p>
								{swap.reason && (
									<p className="iz-tiny iz-muted mt-1 line-clamp-2">
										&ldquo;{swap.reason}&rdquo;
									</p>
								)}
								{swap.status === "pending_replacement" &&
									swap.replacementPrName && (
										<p className="iz-tiny mt-2 text-[var(--iz-amber)]">
											{fill(t.agencyPrs.awaitingCoverageAccept, {
												name: swap.replacementPrName,
											})}
										</p>
									)}
								{swap.replacementDeclineReason && (
									<p className="iz-tiny mt-1 text-[var(--iz-red)] line-clamp-2">
										{fill(t.agencyPrs.replacementDeclined, {
											name: swap.replacementPrName ?? t.roster.replacement,
											reason: swap.replacementDeclineReason,
										})}
									</p>
								)}
								{swap.status === "pending_agency" && (
									<div className="mt-2 flex gap-2">
										<button
											type="button"
											className="iz-btn iz-btn-soft flex-1 !py-1.5 !text-xs"
											onClick={() => declinePrSwapRequest(swap.id)}
										>
											{t.common.decline}
										</button>
										<button
											type="button"
											className="iz-btn iz-btn-primary flex-1 !py-1.5 !text-xs"
											onClick={() => {
												setApproveSwapId(swap.id);
												setReplacementPick(replacementCandidates[0]?.id ?? "");
											}}
										>
											{t.roster.pickReplacement}
										</button>
									</div>
								)}
							</IzCard>
						))}
					</div>
				</OutletSection>
			)}

			{viewMode === "live" && (
				<OutletSection
					title={t.roster.shifts}
					iconKey="Shifts"
					hint={t.roster.shiftsHint}
					className="!mt-4"
				>
					<RosterShiftFilters
						filters={shiftFilters}
						onChange={(patch) =>
							setShiftFilters((prev) => ({ ...prev, ...patch }))
						}
						resultCount={filtered.length}
						totalCount={dateFiltered.length}
						outletNames={rosterOutletNames}
					/>
					<RosterShiftTable
						slots={filtered}
						agencyPRs={agencyPRs}
						viewingAgencyId={activeAgencyId}
						prSwapRequests={prSwapRequests}
						outletCommissionRules={outletCommissionRules}
						perDrinkRm={perDrinkRm}
						outletShifts={shifts}
						drinkMenu={drinkMenu}
						receiptScans={prReceiptScans}
						rosterScopeSlots={dateFiltered}
						happyHourStart={outletWorkspace.happyHourStart}
						happyHourEnd={outletWorkspace.happyHourEnd}
						workspaceTierRates={outletWorkspace.tierRates}
						commissionOnlyRates={outletWorkspace.commissionOnlyRates}
						canAssign={canAssign}
						onEdit={openEdit}
						onFlagNoShow={handleFlagNoShow}
						onCancelPrSwap={declinePrSwapRequest}
					/>
				</OutletSection>
			)}

			{editSlot && (
				<EditRosterModal
					slot={editSlot}
					// The canonical record names the person; `slot.prName` is the floor
					// nickname the slot mapper carries, so this sheet said "Vicky" while
					// the voucher for the same shift said "(Vicky) Victoria Tan Mei Lin".
					prLabel={prLabelForSlot(editSlot)}
					onClose={() => setEditId(null)}
					swapPending={outletSwap.isPending}
					swapError={outletSwap.errorMessage}
					onRequestOutletSwap={(toShiftId, note) => {
						// The slot id IS the shift_assignment id (backend-shift-map),
						// which is what the swap record hangs off. Closing only on
						// success keeps the refusal ("that shift is full") on screen.
						outletSwap.request.mutate(
							{
								assignmentId: editSlot.id,
								toShiftId,
								agencyNote: note || undefined,
							},
							{ onSuccess: () => setEditId(null) },
						);
					}}
					onReassignToOpenShift={(target) => {
						const { shiftStart, shiftEnd } = parseShiftWindow(target.shift);
						assignPrToOutlet({
							prId: editSlot.prId,
							outlet: target.outlet,
							dateIso: target.dateIso,
							dateLabel: target.date,
							shiftStart,
							shiftEnd,
							shift: target.shift,
							outletShiftId: target.id,
							event: target.event,
							payEstimate: target.payEstimate,
						});
						setEditId(null);
					}}
					onUnassign={() => {
						// Offered in both views for the same reason as the handlers above:
						// the slot id is a backend shift_assignment id either way, so
						// hiding this in the live view withheld a working action rather
						// than protecting anything.
						rosterMut.unassign.mutate(editSlot.id);
						setEditId(null);
					}}
				/>
			)}

			<IzSheet
				open={!!swapToApprove}
				onClose={() => {
					setApproveSwapId(null);
					setReplacementPick("");
				}}
			>
				{swapToApprove && (
					<>
						<IzCardTitle>{t.roster.assignReplacement}</IzCardTitle>
						{/* One template, no <strong> fragments: the venue names sit in
						    different places in Chinese word order. */}
						<p className="iz-tiny iz-muted mb-3">
							{fill(t.agencyPrs.swapWantsToLeave, {
								name: swapToApprove.requestingPrName,
								from: swapToApprove.outlet,
								to: swapToApprove.targetOutlet ?? "",
								date: swapToApprove.targetDate ?? "",
								shift: swapToApprove.targetShift ?? "",
							})}
						</p>
						<label
							htmlFor="roster-replacement-pr"
							className="iz-tiny iz-muted mb-1 block"
						>
							{t.roster.replacementPr}
						</label>
						<IzSelect
							id="roster-replacement-pr"
							value={replacementPick}
							onChange={(e) => setReplacementPick(e.target.value)}
							className="mb-4 w-full"
						>
							<option value="">{t.roster.selectPr}</option>
							{/* One payee spelling, and no invented score: `p.rating` is the
							    mapper's 0 placeholder on every backend PR, so this option
							    used to read "Vicky · 0★ · Tier I". */}
							{replacementCandidates.map((p) => (
								<option key={p.id} value={p.id}>
									{[
										formatPayeeLabel(p.name, p.icName),
										recordRating(p) !== null ? `${recordRating(p)}★` : null,
										p.trainingLevel,
									]
										.filter(Boolean)
										.join(" · ")}
								</option>
							))}
						</IzSelect>
						<button
							type="button"
							className="iz-btn iz-btn-primary w-full"
							disabled={!replacementPick}
							onClick={() => {
								approvePrSwapRequest(swapToApprove.id, replacementPick);
								setApproveSwapId(null);
								setReplacementPick("");
							}}
						>
							{t.roster.sendOfferToReplacement}
						</button>
					</>
				)}
			</IzSheet>
		</div>
	);
}

function EditRosterModal({
	slot,
	prLabel,
	onClose,
	onRequestOutletSwap,
	swapPending = false,
	swapError = null,
	onReassignToOpenShift,
	onUnassign,
}: {
	slot: AgencyRosterSlot;
	/** The PR named as the rest of the portal names them — see formatPayeeLabel. */
	prLabel: string;
	onClose: () => void;
	/** `toShiftId` is the destination SHIFT, not an outlet — the swap record
	 *  stores a shift id so approval knows exactly where to move the PR. */
	onRequestOutletSwap: (toShiftId: string, note: string) => void;
	/** In flight. Owned by the parent, which holds the mutation. */
	swapPending?: boolean;
	/** The server's refusal text, shown in place rather than closing the sheet. */
	swapError?: string | null;
	onReassignToOpenShift: (target: AgencyOutletAvailableShift) => void;
	/**
	 * Take the PR off this shift: hard-delete the assignment row so the slot
	 * reopens. The ONLY destructive action the agency has here — cancelling the
	 * shift itself is the outlet's, never this portal's.
	 */
	onUnassign?: () => void;
}) {
	const { t } = usePortalLocale();
	const shifts = useStore((s) => s.shifts);
	const outletCommissionRules = useStore((s) => s.outletCommissionRules);
	const outletWorkspace = useStore((s) => s.outletWorkspace);
	// The destination SHIFT id. Was an outlet name, which could not say which of
	// a venue's shifts the PR was being moved to.
	const [swapShiftId, setSwapShiftId] = useState("");
	const [swapNote, setSwapNote] = useState("");
	const [reassignShiftId, setReassignShiftId] = useState("");
	const [busy, setBusy] = useState(false);
	const [unassignConfirmOpen, setUnassignConfirmOpen] = useState(false);
	// Swap targets come from the backend: only outlets that exist and are
	// actually running a shift on this slot's date. Sending a PR to a venue with
	// nothing on that night was possible while this read the demo outlet list.
	const {
		targets: swapTargets,
		isLoading: swapTargetsLoading,
		isError: swapTargetsError,
	} = useSwapOutletTargets({
		// The date, the agency and the "not this shift" exclusion are all derived
		// server-side from the assignment itself.
		assignmentId: slot.id,
	});
	// Once a swap target is picked the window that matters is the destination's,
	// not the shift the PR is being moved off.
	// `target`, not `t`: the locale is `t` in this component, and a callback of
	// that name shadows it.
	const selectedSwapTarget = swapTargets.find(
		(target) => target.shiftId === swapShiftId,
	);
	const releasedEarly = Boolean(slot.checkedOutAt);
	// ── WHAT IS STILL CHANGEABLE ABOUT THIS SLOT ──────────────────────────────
	// A shift that has already happened is a RECORD of a night worked, not a plan
	// anybody can still edit. The assignment row holds the attendance stamps and
	// the wage sealed at check-out, and the weekly voucher reads exactly those
	// rows — so relocating the PR or deleting the row would rewrite money that is
	// already counted, or ask someone to approve a move to a night that is over.
	//
	// Two conditions, because they are different facts: the DATE is behind us, or
	// the PR has clocked in (on any date — the moment they are on the floor there
	// is attendance to protect, and only a check-OUT used to stop this, which left
	// the whole middle of a shift open).
	//
	// The server refuses both as well — `DELETE /shift-assignment/:id` and
	// `POST /outlet-swap`. This is that same rule said early, so the sheet never
	// offers what the API would refuse.
	const shiftHasPassed = slot.dateIso < DEFAULT_ROSTER_DATE_ISO;
	const slotIsHistory = shiftHasPassed || Boolean(slot.checkedInAt);
	const canRequestSwap =
		!releasedEarly &&
		!slotIsHistory &&
		(!slot.outletSwap || slot.outletSwap.status !== "pending_pr");

	const availableShifts = useMemo(
		() =>
			listAvailableShiftsForEarlyReleaseReassign({
				shifts,
				excludeOutlet: slot.outlet,
				dateIso: slot.dateIso,
				todayIso: DEFAULT_ROSTER_DATE_ISO,
				commissionRules: outletCommissionRules,
				outletWorkspace,
			}),
		[shifts, slot.outlet, slot.dateIso, outletCommissionRules, outletWorkspace],
	);
	const selectedReassign = availableShifts.find(
		(s) => s.id === reassignShiftId,
	);

	const handleSwap = () => {
		if (busy || swapPending || !swapShiftId) return;
		// Deliberately does NOT set `busy`: unlike save/reassign/cancel, this
		// request can be refused (destination full, one already pending) and the
		// sheet stays open to show why. `swapPending` covers it instead, and the
		// parent closes the sheet only on success.
		onRequestOutletSwap(swapShiftId, swapNote.trim());
	};

	const handleReassign = () => {
		if (busy || !selectedReassign) return;
		setBusy(true);
		onReassignToOpenShift(selectedReassign);
	};

	if (releasedEarly) {
		return (
			<IzSheet open onClose={busy ? () => {} : onClose}>
				<div className="iz-sheet-head">
					<div>
						<p className="iz-tiny iz-muted2 uppercase tracking-widest">
							{t.roster.reassign}
						</p>
						<h3>{prLabel}</h3>
					</div>
					<button
						type="button"
						className="iz-sheet-close"
						onClick={onClose}
						disabled={busy}
						aria-label={t.common.close}
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="iz-sheet-meta">
					<span className="iz-sheet-meta-pill">
						<MapPin className="h-3 w-3" />
						<strong>{slot.outlet}</strong>
					</span>
					<span className="iz-sheet-meta-pill">
						<Calendar className="h-3 w-3" />
						{slot.date}
					</span>
					<span className="iz-sheet-meta-pill">
						{t.rosterGrid.releasedEarly}
						{slot.checkedOutAt
							? ` · ${formatAttendanceStamp(slot.checkedOutAt, slot.dateIso)}`
							: ""}
					</span>
				</div>

				<p className="iz-tiny iz-muted mt-1">
					{fill(t.agencyPrs.pickOpenShiftHoursPaid, { outlet: slot.outlet })}
				</p>

				{availableShifts.length === 0 ? (
					<p className="iz-tiny iz-muted2 mt-4 rounded-lg border border-dashed border-[var(--iz-line)] px-3 py-4 text-center">
						{t.roster.noOpenShiftsOtherOutlets}
					</p>
				) : (
					<div className="mt-4">
						<span className="iz-field-label">
							{t.roster.availableShiftToday}
						</span>
						<IzSelect
							block
							className="!text-sm"
							value={reassignShiftId}
							onChange={(e) => setReassignShiftId(e.target.value)}
							disabled={busy}
						>
							<option value="">{t.roster.selectOpenShift}</option>
							{availableShifts.map((s) => (
								<option key={s.id} value={s.id}>
									{s.outlet} · {s.shift} ·{" "}
									{fill(t.rosterGrid.openCount, { n: s.openSlots })} · {s.event}
								</option>
							))}
						</IzSelect>
						{selectedReassign && (
							<p className="iz-tiny iz-muted2 mt-2">
								{fill(t.agencyPrs.suppliedEstimate, {
									supplied: selectedReassign.suppliedSlots,
									demand: selectedReassign.demandSlots,
									amount: formatRM(selectedReassign.payEstimate),
								})}
							</p>
						)}
					</div>
				)}

				<div className="iz-sheet-actions">
					<button
						type="button"
						className="iz-btn iz-btn-soft flex-1 !py-3"
						onClick={onClose}
						disabled={busy}
					>
						{t.common.close}
					</button>
					<button
						type="button"
						className="iz-btn iz-btn-primary flex-1 !py-3"
						disabled={!selectedReassign || busy}
						onClick={handleReassign}
					>
						{busy ? t.roster.assigning : t.roster.assign}
					</button>
				</div>
			</IzSheet>
		);
	}

	return (
		<IzSheet open onClose={busy ? () => {} : onClose}>
			<div>
				<div className="iz-sheet-head">
					<div>
						<p className="iz-tiny iz-muted2 uppercase tracking-widest">
							{t.roster.editShift}
						</p>
						<h3>{prLabel}</h3>
					</div>
					<button
						type="button"
						className="iz-sheet-close"
						onClick={onClose}
						disabled={busy}
						aria-label={t.common.close}
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="iz-sheet-meta">
					<span className="iz-sheet-meta-pill">
						<MapPin className="h-3 w-3" />
						<strong>{slot.outlet}</strong>
					</span>
					<span className="iz-sheet-meta-pill">
						<Calendar className="h-3 w-3" />
						{slot.date}
					</span>
				</div>

				{/* No status control: "On duty" wrote the same `confirmed` as
				    "Scheduled" (attendance comes from the PR's check-in timestamps),
				    and "Unavailable" wrote `cancelled` — a destructive write with no
				    confirmation step. Nothing writes a status from this sheet at all
				    now; see the note where handleEditSave used to be. */}

				{/* Shift times are set by the outlet when it posts the job — the
				    agency reassigns people, it does not reschedule a booked shift.
				    The window that matters here is the destination's, shown inside
				    the swap card once a target is picked. */}

				{canRequestSwap && (
					<div className="mt-4 rounded-xl border border-[rgba(124,107,255,.3)] bg-[rgba(124,107,255,.06)] p-3">
						<div className="flex items-center gap-1.5 iz-tiny font-bold uppercase tracking-wide text-[var(--iz-violet)]">
							<ArrowLeftRight className="h-3.5 w-3.5" />
							{t.roster.requestOutletSwap}
						</div>
						<p className="iz-tiny iz-muted mt-1">
							{fill(t.agencyPrs.mustApproveBeforeChange, { name: prLabel })}
						</p>
						<div className="mt-3">
							<span className="iz-field-label">{t.roster.newShift}</span>
							<IzSelect
								block
								className="!text-sm"
								value={swapShiftId}
								onChange={(e) => setSwapShiftId(e.target.value)}
								disabled={
									busy ||
									swapPending ||
									swapTargetsLoading ||
									swapTargets.length === 0
								}
							>
								<option value="">
									{swapTargetsLoading
										? t.roster.loadingShifts
										: swapTargetsError
											? t.roster.couldNotLoadShifts
											: swapTargets.length === 0
												? t.roster.noOtherOutletShift
												: t.roster.selectShift}
								</option>
								{/* A venue running two shifts that night appears twice — the
								    window disambiguates them. Full shifts stay visible but
								    unselectable: approval refuses them server-side, so
								    offering one would only produce a doomed request. */}
								{/* Two separate reasons a shift is unselectable, said separately:
								    "full" is about the venue, "no seat for this tier" is about
								    this PR. A tier-blocked shift still shows a headcount like
								    2/4, so without its own wording a disabled option with room
								    left reads as a bug. */}
								{/* `target`, not `t` — the locale lives in `t` and a map callback
								    of that name would shadow it for the whole option body. */}
								{swapTargets.map((target) => (
									<option
										key={target.shiftId}
										value={target.shiftId}
										disabled={target.isFull || target.tierBlocked}
									>
										{target.outletName}
										{target.shiftWindow ? ` · ${target.shiftWindow}` : ""}{" "}
										{target.isFull
											? t.agencyPrs.swapTargetFull
											: target.tierBlocked
												? fill(t.agencyPrs.swapTargetTierBlocked, {
														staffed: target.staffedCount,
														quantity: target.quantity,
													})
												: `(${target.staffedCount}/${target.quantity})`}
									</option>
								))}
							</IzSelect>
							{selectedSwapTarget && (
								<div className="iz-sheet-preview mt-2">
									<div className="k">{t.roster.shiftTheyMoveTo}</div>
									<div className="v">
										{selectedSwapTarget.outletName} ·{" "}
										{selectedSwapTarget.shiftWindow ?? t.roster.windowNotSet}
									</div>
									{selectedSwapTarget.eventName && (
										<div className="iz-tiny iz-muted mt-0.5">
											{selectedSwapTarget.eventName}
										</div>
									)}
									<div className="iz-tiny iz-muted mt-0.5">
										{fill(t.agencyPrs.staffedOf, {
											staffed: selectedSwapTarget.staffedCount,
											quantity: selectedSwapTarget.quantity,
										})}
									</div>
								</div>
							)}
							{swapError && (
								<p className="iz-tiny mt-2 text-[var(--destructive)]">
									{swapError}
								</p>
							)}
						</div>
						<div className="mt-2">
							<span className="iz-field-label">
								{t.roster.noteToPrOptional}
							</span>
							<input
								className="iz-field-input !text-sm"
								value={swapNote}
								onChange={(e) => setSwapNote(e.target.value)}
								placeholder={t.roster.relocationReasonPlaceholder}
								disabled={busy || swapPending}
							/>
						</div>
						<button
							type="button"
							className="iz-btn iz-btn-soft mt-3 w-full !text-xs"
							disabled={!swapShiftId || busy || swapPending}
							onClick={handleSwap}
						>
							{swapPending ? t.roster.sending : t.roster.sendSwapRequest}
						</button>
					</div>
				)}

				{/* There is no "Cancel shift" here anymore, and there must not be one
				    again. An agency does not cancel a venue's shift — the shift is the
				    OUTLET's, posted by them and withdrawn by them (shift.controller.ts
				    `remove`, outlet-only). What the agency controls is which of its
				    people fill it, and the one honest word for taking a PR off a shift
				    is below.

				    The button that used to sit here wrote `status: 'cancelled'` to the
				    ASSIGNMENT — it never touched the shift — so it read as an authority
				    the agency does not have while doing something else entirely, right
				    above a second red button that did the thing its own body text
				    described ("Remove this assignment — … will be notified and freed").
				    Two destructive controls, one of them mislabelled as the other. */}

				{slotIsHistory && (
					<div className="mt-4 rounded-xl border border-[var(--iz-line)] px-3 py-2.5">
						<p className="iz-tiny iz-muted leading-relaxed">
							{shiftHasPassed
								? t.roster.shiftAlreadyPassed
								: t.roster.prAlreadyCheckedIn}
						</p>
					</div>
				)}

				{onUnassign && !slotIsHistory && (
					<div className="mt-4 rounded-xl border border-[rgba(255,117,117,.25)] bg-[rgba(255,117,117,.06)] p-3">
						<div className="flex items-center gap-1.5 iz-tiny font-bold uppercase tracking-wide text-[var(--destructive)]">
							<Trash2 className="h-3.5 w-3.5" />
							{t.roster.removeAssignment}
						</div>
						<p className="iz-tiny iz-muted mt-1">
							{fill(t.agencyPrs.unassignExplain, { name: prLabel })}
						</p>
						<button
							type="button"
							className="iz-btn iz-btn-soft mt-3 w-full !border-[var(--iz-red)] !text-[var(--iz-red)] !text-xs"
							disabled={busy}
							onClick={() => setUnassignConfirmOpen(true)}
						>
							{t.roster.removeAssignment}
						</button>
					</div>
				)}

				{/* Close only. There is nothing here to "save": every control in this
				    sheet acts the moment it is confirmed (swap request, remove), and
				    the Save button that used to sit beside this one had no field to
				    save — only a status it silently rounded. See handleEditSave's
				    epitaph on the page above. */}
				<div className="iz-sheet-actions">
					<button
						type="button"
						className="iz-btn iz-btn-soft flex-1 !py-3"
						onClick={onClose}
						disabled={busy}
					>
						{t.common.close}
					</button>
				</div>
			</div>

			<IzSheet
				open={unassignConfirmOpen}
				onClose={() => !busy && setUnassignConfirmOpen(false)}
			>
				<IzCardTitle>{t.roster.removeThisAssignment}</IzCardTitle>
				<p className="iz-tiny iz-muted mb-3">
					{fill(t.agencyPrs.unassignConfirmBody, {
						name: prLabel,
						outlet: slot.outlet,
						date: slot.date,
						shift: slot.shift,
					})}
				</p>
				<div className="flex gap-2">
					<button
						type="button"
						className="iz-btn iz-btn-soft flex-1"
						disabled={busy}
						onClick={() => setUnassignConfirmOpen(false)}
					>
						{t.roster.keepAssignment}
					</button>
					<button
						type="button"
						className="iz-btn iz-btn-danger flex-1"
						disabled={busy}
						onClick={() => {
							setBusy(true);
							onUnassign?.();
						}}
					>
						{t.roster.remove}
					</button>
				</div>
			</IzSheet>
		</IzSheet>
	);
}
