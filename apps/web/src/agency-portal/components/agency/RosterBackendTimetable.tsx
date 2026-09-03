import { OutletLogoTile } from "@agency-portal/components/agency/OutletLogoTile";
import {
	PrComcardIdentity,
	toComcardPreview,
} from "@agency-portal/components/agency/PrComcardIdentity";
import { PhotoLightbox } from "@agency-portal/components/agency/ProofPhotoViewer";
import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { formatRM } from "@agency-portal/components/iz/ui";
import { useAllShiftAssignments } from "@agency-portal/hooks/use-all-shift-assignments";
import type {
	AgencyRosterSlot,
	RosterSlotStatus,
} from "@agency-portal/lib/agency-demo";
import { formatPayeeLabel } from "@agency-portal/lib/agency-payroll";
import {
	ASSIGNABLE_SHIFT_STATUSES,
	bucketForPrTier,
	mergeCrossAgencyStaffing,
	type ShiftBlockReason,
	shiftBlockedFor,
	tierLabel,
} from "@agency-portal/lib/auto-assign";
import {
	busyFrameOn,
	minuteRangesOverlap,
	previousDayIso,
	windowMinutes,
	windowsEffectiveOn,
} from "@agency-portal/lib/pr-live-status";
import { managedPrFromBackend } from "@agency-portal/lib/pr-personnel-map";
import { getPrScheduleState } from "@agency-portal/lib/roster-availability";
import {
	filterRosterShifts,
	type RosterTimetableFilterState,
	rosterShiftFiltersActive,
	timetableSlotMatches,
} from "@agency-portal/lib/roster-shift-filters";
import {
	dayColumnLabel,
	weekDayIsos,
	weekRangeLabel,
} from "@agency-portal/lib/roster-week-plan";
import {
	shiftBlockLong,
	shiftBlockShort,
} from "@agency-portal/lib/shift-block-label";
import {
	hasShiftEnded,
	isEndedAndUnworked,
	shiftEndDayIso,
} from "@agency-portal/lib/shift-window";
import { cn } from "@agency-portal/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Maximize2, Plus, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
import { useAuth } from "@/lib/auth-context";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import {
	dressCodeLabel,
	languageLabel,
} from "@/lib/portal-i18n/language-label";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import { fetchOutlets } from "@/services/outlet/outlet";
import { fetchOutletSwaps } from "@/services/outlet-swap";
import {
	blockedDatesByPr,
	blockedReasonKey,
	blockedReasonsByPr,
	committedWindowsByPr,
	fetchPrAvailability,
	fetchPrCommittedWindows,
} from "@/services/pr-availability";
import { fetchPrPersonnel, type PrPersonnel } from "@/services/pr-personnel";
import { fetchShifts, type Shift } from "@/services/shift";
import {
	fetchBackfillSlots,
	fetchWagePreview,
	type ShiftAssignmentStatus,
	type TierWagePreview,
} from "@/services/shift-assignment";

/**
 * What this shift pays THIS PR, in the sheet's one line of space.
 *
 * Never falls back to a number when the answer is unknown: the card previously
 * showed the shift's own `pay_per_hour`, which is the same for every PR, so a
 * Servant and a Tier I read one wage and only the sealed voucher disagreed.
 * Absence is reported as absence — `unpriced` in particular is the case the
 * assign call REFUSES, so quietly printing RM0.00 would hide the reason.
 */
function wageLabel(
	wage: TierWagePreview | undefined,
	loading: boolean,
	tierUnwanted: boolean,
	prTier: string | null,
	// Required, not optional-with-an-English-default: an optional `t` would let a
	// future call site compile while quietly rendering English.
	t: PortalTranslations,
): string {
	// The shift declared a mix with no place for this tier, so the resolver's
	// fallback — the OUTLET's list price for it — is a number this shift can
	// never pay: the assign is refused on the tier rule before money is reached.
	// Quoting RM700 for a shift posted at RM40 was true of the rate card and
	// false of the shift, which is the most convincing kind of wrong.
	if (tierUnwanted)
		return fill(t.rosterGrid.tierNotOnShift, { tier: tierLabel(prTier) });
	if (loading) return t.rosterGrid.checkingRate;
	if (!wage) return t.rosterGrid.rateUnavailable;
	switch (wage.kind) {
		case "commission_only":
			return t.rosterGrid.commissionOnlyNoDayRate;
		case "unpriced":
			return fill(t.rosterGrid.noRateSetFor, {
				tier: wage.tierLabel ?? t.rosterGrid.thisTier,
			});
		default:
			return fill(t.rosterGrid.perDay, { amount: formatRM(Number(wage.wage)) });
	}
}

/** Statuses that free the slot again — mirrors the backend's NON_STAFFING_STATUSES. */
const NON_STAFFING_ASSIGNMENT_STATUSES: readonly ShiftAssignmentStatus[] = [
	"cancelled",
	"no_show",
	"leave_approved",
];

/**
 * Every slot status this grid can be handed, and what the cell shows for it.
 *
 * ⚠️ `Record<RosterSlotStatus, …>`, NOT `Record<string, …>`. That single
 * difference is the whole bug this replaces. The old map keyed on `string` and
 * listed three of the eight statuses, with a `?? scheduled` fallback under it —
 * so `on-duty`, `en-route`, `swap-pending`, `outlet-pending` and
 * `outlet-request-pending` all silently printed "Scheduled". A PR standing on
 * the floor was drawn exactly like one who had not left home, and the giveaway
 * sat in the stylesheet: `--live`, `--pending` and `--swap` were all defined and
 * none of them was reachable. **A fallback over a partial map turns a missing
 * case into a confident wrong answer; an exhaustive Record turns it into a
 * compile error.** Add a status to `RosterSlotStatus` and this stops building
 * until it is answered here, which is the point.
 *
 * Labels are RESOLVERS, not dictionary keys: a key is itself a `string`, so
 * rendering the map value directly type-checks and ships the key name to screen.
 * They are also the same labels `RosterShiftTable` uses for the same statuses —
 * the grid and the table describe one roster, and two vocabularies for it drift
 * the first time either is revised.
 */
const STATUS_CELL: Record<
	RosterSlotStatus,
	{ className: string; label: (t: PortalTranslations) => string }
> = {
	scheduled: {
		className: "iz-roster-week-cell--scheduled",
		label: (t) => t.roster.scheduled,
	},
	// Past, and nothing else to say about it — drawn back, not as a live plan.
	ended: {
		className: "iz-roster-week-cell--ended",
		label: (t) => t.roster.ended,
	},
	// Demo-only: `rosterStatusFromAssignment` never returns it, because the
	// backend has no "on the way" stamp. Reads as scheduled, like the table.
	"en-route": {
		className: "iz-roster-week-cell--scheduled",
		label: (t) => t.roster.scheduled,
	},
	"on-duty": {
		className: "iz-roster-week-cell--live",
		label: (t) => t.roster.onDuty,
	},
	"assignment-pending": {
		className: "iz-roster-week-cell--pending",
		label: (t) => t.rosterGrid.awaitingPr,
	},
	"outlet-pending": {
		className: "iz-roster-week-cell--pending",
		label: (t) => t.rosterGrid.awaitingOutlet,
	},
	"outlet-request-pending": {
		className: "iz-roster-week-cell--pending",
		label: (t) => t.rosterGrid.outletRequest,
	},
	"swap-pending": {
		className: "iz-roster-week-cell--swap",
		label: (t) => t.rosterGrid.swapPending,
	},
	unavailable: {
		className: "iz-roster-week-cell--off",
		label: (t) => t.roster.unavailable,
	},
};

/**
 * A finished shift, which no STATUS can express.
 *
 * `RosterSlotStatus` has no "checked out" value, and it cannot get one cheaply:
 * `rosterStatusFromAssignment` folds the backend's `completed` back into
 * "scheduled". So the check-out STAMP is the only thing that knows the shift is
 * over, and a cell reading "Scheduled" at 4am about a shift that ended at
 * midnight is telling the agency the wrong story.
 */
const DONE_CELL = {
	className: "iz-roster-week-cell--done",
	label: (t: PortalTranslations) => t.roster.checkedOut,
};

function toneFor(slot: Pick<AgencyRosterSlot, "status" | "checkedOutAt">) {
	// Stamped out wins over the status — EXCEPT when the row was cancelled or
	// no-showed, where "Off" is the more important fact about the slot and a
	// stamp may exist from before the decision.
	if (slot.checkedOutAt && slot.status !== "unavailable") return DONE_CELL;
	// No `??` fallback: the Record above is exhaustive over the key's own type,
	// so there is nothing left to fall back to. Reintroducing one would restore
	// exactly the silence this replaced.
	return STATUS_CELL[slot.status];
}

type RosterBackendTimetableProps = {
	weekStartIso: string;
	/** Backend-derived roster slots for the week (from useRosterSlots). */
	roster: AgencyRosterSlot[];
	filters: RosterTimetableFilterState;
	canAssign: boolean;
	onEditSlot: (slotId: string) => void;
	onWeekChange: (anchorDateIso: string) => void;
	/**
	 * Cell-tap assign: schedule a backend PR onto an open backend shift. Must
	 * reject on failure — the sheet reports the reason and stays open rather than
	 * closing on a write that never landed.
	 */
	onAssign: (
		shiftId: string,
		prId: string,
		userId?: string,
	) => Promise<unknown>;
	todayIso?: string;
	/**
	 * Rendered between the open-demand band and the week grid (owner, 3 Sep
	 * 2026: the auto-assign banner belongs under Open demand, not above it).
	 * A SLOT rather than the banner itself, because this component knows about
	 * rosters and nothing about auto-assign — the page owns that decision.
	 *
	 * The band above it is conditional, so with no open demand this simply
	 * renders first, still directly above the grid it acts on.
	 */
	afterOpenDemand?: ReactNode;
};

/**
 * Backend-driven weekly planning grid. Rows are backend PRs, columns are the
 * week's days, and each cell reflects real backend state: a filled cell maps to
 * a shift-assignment (tap to edit), a free cell lets the agency assign the PR to
 * an open backend shift on that day (tap → pick shift → `onAssign`). All ids are
 * backend ids, so what the grid shows and what it writes stay in sync — unlike
 * the demo timetable, whose rows/shifts are demo-shaped. Honors the PR-name and
 * outlet filters from the shared filter bar; the time/payout/status filters are
 * demo-only and don't apply here.
 */
export function RosterBackendTimetable({
	weekStartIso,
	roster,
	filters,
	canAssign,
	onEditSlot,
	onWeekChange,
	onAssign,
	todayIso,
	afterOpenDemand,
}: RosterBackendTimetableProps) {
	const { t } = usePortalLocale();
	const { logout } = useAuth();
	const [assignTarget, setAssignTarget] = useState<{
		pr: PrPersonnel;
		dateIso: string;
	} | null>(null);

	// A tapped demand card opens the whole day: every live shift, who the
	// venue put in its cart, who is actually booked.
	const [demandShift, setDemandShift] = useState<{
		shiftId: string;
		dateIso: string;
	} | null>(null);
	/** The cover being viewed full-screen; its resolved URL, or null for none. */
	const [coverZoom, setCoverZoom] = useState<string | null>(null);

	const days = useMemo(() => weekDayIsos(weekStartIso), [weekStartIso]);
	const fromDate = days[0] ?? weekStartIso;
	const toDate = days[days.length - 1] ?? weekStartIso;

	// Days these PRs marked unavailable on their own phone. Same query key as
	// useRosterSlots, so this reads the already-loaded cache rather than
	// re-fetching. A failure leaves the map empty and every cell assignable —
	// the server still refuses the assign with a 409, so the grid can be
	// optimistic here without letting a booking through.
	const availabilityQuery = useQuery({
		queryKey: ["roster", "availability", fromDate, toDate],
		queryFn: () => fetchPrAvailability({ from: fromDate, to: toDate }, logout),
		staleTime: 30_000,
	});
	const blockedDates = useMemo(
		() => blockedDatesByPr(availabilityQuery.data ?? []),
		[availabilityQuery.data],
	);

	/*
	 * Drop-outs the agency has NOT yet answered.
	 *
	 * Same ["roster", "backfill"] key BackfillPanel uses, so this reads that
	 * already-loaded cache rather than firing a second request, and the roster
	 * mutations invalidate both together. The BACKEND decides what "unanswered"
	 * means (a replacement assigned after the release) — asking it here is what
	 * stops the grid and the worklist disagreeing about whether a night still
	 * needs somebody.
	 */
	const backfillQuery = useQuery({
		queryKey: ["roster", "backfill"],
		queryFn: () => fetchBackfillSlots(logout),
		staleTime: 15_000,
	});
	const unansweredDropouts = useMemo(
		() => new Set((backfillQuery.data ?? []).map((r) => r.assignmentId)),
		[backfillQuery.data],
	);
	/*
	 * WHEN this roster is committed to ANOTHER agency — times only.
	 *
	 * The preview half of the cross-agency rule. Until now the grid showed nothing
	 * and the agency only found out at the moment it pressed Schedule, which made
	 * the refusal read as an error rather than as a fact about the person. Shown
	 * here, that refusal becomes a reminder of something already on screen.
	 *
	 * Shares the roster's query-key discipline so the grid and the assign sheet
	 * cannot disagree about who is free. Deliberately NOT merged into
	 * `availabilityQuery`: a blocked DAY cannot be booked around, these windows
	 * can, and flattening the two would undo the rule change.
	 */
	const committedQuery = useQuery({
		// FROM ONE DAY EARLIER than the grid shows. A shift is stamped with its
		// START date, so the week's first column could not otherwise see a
		// 22:00-04:00 booking that began the night before and is still running.
		// `windowsEffectiveOn` rebases it into the day it spills into.
		queryKey: ["roster", "committed", previousDayIso(fromDate), toDate],
		queryFn: () =>
			fetchPrCommittedWindows(
				{ from: previousDayIso(fromDate), to: toDate },
				logout,
			),
		staleTime: 30_000,
	});
	const committedWindows = useMemo(
		() => committedWindowsByPr(committedQuery.data ?? []),
		[committedQuery.data],
	);
	/**
	 * The busy windows the assign sheet shows — built by `busyFrameOn` from
	 * the SAME map the grid cell behind it reads, so the sheet and the cell
	 * cannot disagree about who is free on an overnight. The frame also
	 * carries TOMORROW's windows rebased +1440, which is how an overnight
	 * card offered tonight meets a booking that starts the next morning —
	 * the server's `shiftsOverlap` timeline, not a same-day copy of it.
	 * `timeUnknown` carries the one thing a window list cannot: a commitment
	 * whose slot named no clock at all.
	 */
	const assignSheetBusy = useMemo(() => {
		if (!assignTarget) return null;
		const byDate = committedWindows.get(assignTarget.pr.id);
		const frame = busyFrameOn(byDate, assignTarget.dateIso);
		const timeUnknown = byDate?.get(assignTarget.dateIso)?.length === 0;
		if (frame.length === 0 && !timeUnknown) return null;
		return { frame, timeUnknown };
	}, [assignTarget, committedWindows]);
	// The PR's own words for why. Optional — most blocks carry none.
	const blockedReasons = useMemo(
		() => blockedReasonsByPr(availabilityQuery.data ?? []),
		[availabilityQuery.data],
	);

	// Same query keys as useRosterSlots, so these read the already-loaded cache.
	const prsQuery = useQuery({
		queryKey: ["roster", "prs"],
		// Paged out: the server clamps to 100, and these keys are shared — see
		// lib/fetch-all-pages.ts. This grid derives `shiftBlockedFor` from the
		// staffed rows it reads, so a truncated set greys out the wrong cells.
		queryFn: () =>
			fetchAllPages((page) =>
				fetchPrPersonnel({ page, pageSize: 100 }, logout),
			),
		staleTime: 60_000,
	});
	const shiftsQuery = useQuery({
		queryKey: ["roster", "shifts", fromDate, toDate],
		queryFn: () =>
			fetchAllPages((page) =>
				fetchShifts({ fromDate, toDate, page, pageSize: 100 }, logout),
			),
		staleTime: 30_000,
	});
	const outletsQuery = useQuery({
		queryKey: ["roster", "outlets"],
		queryFn: () => fetchOutlets({ pageSize: 500 }, logout),
		staleTime: 60_000,
	});
	// Staffing is COUNTED from live assignments. `shift.filled` is a dead column —
	// nothing in the backend increments it (the swap repo and cut-loss both say so
	// and route around it), so it reads 0 on a fully-staffed shift. Trusting it is
	// why this sheet offered a 2/2 shift as "2 open" and the API then refused the
	// write with "already fully staffed (2/2)".
	const assignmentsQuery = useAllShiftAssignments();

	const outletNameById = useMemo(
		() => new Map((outletsQuery.data?.data ?? []).map((o) => [o.id, o.name])),
		[outletsQuery.data],
	);
	// The venue's own mark, off the SAME read as its name — no extra request for
	// the demand band's logos. R2 object keys; `OutletLogoTile` owns the resolver
	// and the map-pin fallback for the venues that never uploaded one.
	const outletLogoById = useMemo(
		() =>
			new Map(
				(outletsQuery.data?.data ?? []).map((o) => [o.id, o.logoImage ?? null]),
			),
		[outletsQuery.data],
	);

	// The venue's named asks, keyed pr -> day (0131). Server-scoped to this
	// agency, so every row here is addressed to us; the outlet NAME may show
	// (it is our client asking), unlike the anonymous busy windows below.
	const requestedByPrDate = useMemo(() => {
		const now = new Date();
		const map = new Map<
			string,
			Map<string, { outlet: string; slot: string | null; shiftId: string }[]>
		>();
		for (const shift of shiftsQuery.data?.data ?? []) {
			const rows = shift.requestedPrs ?? [];
			if (rows.length === 0) continue;
			// A MARKER MUST NOT OUTLIVE THE QUESTION IT ASKS (owner, 24 Aug 2026:
			// "when they have assigned for all the slots with non-requested pr then
			// it should make the Outlet Request disappear", and then "as the shift is
			// closed now the Outlet Request here should also be closed").
			//
			// TWO ways the ask stops being answerable, and the first fix only had
			// one of them — a SEALED shift sat at 6/0, so "is it full" said no and
			// the chips stayed on a night nobody could be booked onto any more.
			// Ask the question the agency is actually being asked: can I still act
			// on this? That is status first, seats second.
			//
			// Same ASSIGNABLE_SHIFT_STATUSES the assign guard and the planner read,
			// never a local "anything except sealed" — that private copy is exactly
			// what once had two screens disagreeing about the same shift.
			//
			// The request ROW is untouched either way: what the venue asked for
			// stays true whoever ended up working the night.
			if (!ASSIGNABLE_SHIFT_STATUSES.includes(shift.status)) continue;
			if ((shift.quantity ?? 0) - (shift.staffedCount ?? 0) <= 0) continue;
			// THE THIRD way it stops being answerable (owner, 24 Aug 2026: "the
			// roster down here should also be hidden when the shift is hidden").
			// The night is over and nobody worked it, so the demand band drops the
			// card — and a request chip pointing at a shift that is no longer
			// listed anywhere is a question with no subject. Same predicate as the
			// band's, so the two cannot disagree about what "hidden" means.
			if (isEndedAndUnworked(shift, now)) continue;
			const outlet = outletNameById.get(shift.outletId) ?? "";
			for (const r of rows) {
				// THE FOURTH way it stops being answerable — and the only one that is
				// about the PERSON rather than the shift. The other three ask whether
				// the NIGHT can still take anybody; this asks whether the one human
				// the venue actually named can still work it.
				//
				// An approved MC now blocks the whole day (backend `blockLeaveDay`), so
				// the cell already renders UNAVAILABLE — and printed "Outlet request"
				// directly beneath it, asking the agency to book someone the same grid
				// had just said is off. A request naming Vicky is not answered by
				// booking Alice; it is answered by nobody, and it should stop asking.
				//
				// Reads the SAME `blockedDates` the UNAVAILABLE cell reads, so the two
				// cannot disagree about who is off. The request ROW is untouched: what
				// the venue asked for stays true even once it cannot be granted.
				if (blockedDates.get(r.userId)?.has(shift.shiftDate)) continue;
				const byDate =
					map.get(r.userId) ??
					new Map<
						string,
						{ outlet: string; slot: string | null; shiftId: string }[]
					>();
				const arr = byDate.get(shift.shiftDate) ?? [];
				arr.push({ outlet, slot: shift.slot ?? null, shiftId: shift.id });
				byDate.set(shift.shiftDate, arr);
				map.set(r.userId, byDate);
			}
		}
		// Chronological inside every cell (owner: "please arrange by the time").
		// A label-only slot has no window and sinks to the end of the day.
		for (const byDate of map.values()) {
			for (const arr of byDate.values()) {
				arr.sort(
					(a, b) =>
						(windowMinutes(a.slot ?? "")?.[0] ?? 1e9) -
						(windowMinutes(b.slot ?? "")?.[0] ?? 1e9),
				);
			}
		}
		return map;
	}, [shiftsQuery.data, outletNameById, blockedDates]);

	const shiftFiltersOn = rosterShiftFiltersActive(filters);

	// ALL slots per (PR, day) — a PR can work two different-time shifts on the
	// same day, so a cell holds a list. Filter matching is applied per-cell
	// below via timetableSlotMatches, so a slot that fails the active filters
	// reads as free rather than removing the whole row.
	// Swaps still waiting on the PR (owner: "if swap waiting for pr to accept
	// swap, status show pending swapping"). The swap-pending tone sat in the
	// stylesheet since the demo era with nothing feeding it on a backed
	// session — the grid never fetched outlet-swap rows.
	const pendingSwapsQuery = useQuery({
		queryKey: ["roster", "swaps", "pending"],
		queryFn: () => fetchOutletSwaps({ status: "pending_pr" }, logout),
		staleTime: 30_000,
	});
	const pendingSwapAssignmentIds = useMemo(
		() =>
			new Set((pendingSwapsQuery.data ?? []).map((swap) => swap.assignmentId)),
		[pendingSwapsQuery.data],
	);

	const slotsByPrDay = useMemo(() => {
		const map = new Map<string, AgencyRosterSlot[]>();
		for (const slot of roster) {
			const key = `${slot.prId}__${slot.dateIso}`;
			const list = map.get(key) ?? [];
			// The swap question outranks a plain "scheduled" — the agency is
			// waiting on the PR and the cell should say so — but never a stamp:
			// a PR already ON DUTY has answered the question with her feet.
			list.push(
				pendingSwapAssignmentIds.has(slot.id) &&
					slot.status === "scheduled" &&
					!slot.checkedInAt
					? { ...slot, status: "swap-pending" as const }
					: slot,
			);
			map.set(key, list);
		}
		return map;
	}, [roster, pendingSwapAssignmentIds]);

	// Tier per PR, so a staffed seat can be attributed to the bucket it consumed.
	// `PrPersonnel.id` IS the user id, which is also what `shift_assignment.pr_id`
	// holds after 0089 — the two line up without a translation step.
	const tierByPrId = useMemo(
		() => new Map((prsQuery.data?.data ?? []).map((p) => [p.id, p.tier])),
		[prsQuery.data],
	);

	// The assignment a (PR, shift) pair already holds — what turns a request
	// marker into a door: assigned opens the slot editor, unassigned opens
	// the assign flow.
	const assignmentIdByPrShift = useMemo(() => {
		const map = new Map<string, string>();
		for (const a of assignmentsQuery.data?.data ?? []) {
			if (NON_STAFFING_ASSIGNMENT_STATUSES.includes(a.status)) continue;
			map.set(`${a.prId}|${a.shiftId}`, a.id);
		}
		return map;
	}, [assignmentsQuery.data]);

	// Who is BOOKED per shift — the demand sheet's answer to "requested vs
	// seated". Names ride on the assignment join; ids let the cart rows tell
	// a pick that landed from one still waiting.
	const bookedByShift = useMemo(() => {
		const map = new Map<string, { prId: string; name: string }[]>();
		for (const a of assignmentsQuery.data?.data ?? []) {
			if (NON_STAFFING_ASSIGNMENT_STATUSES.includes(a.status)) continue;
			const arr = map.get(a.shiftId) ?? [];
			arr.push({ prId: a.prId, name: a.prName ?? "PR" });
			map.set(a.shiftId, arr);
		}
		return map;
	}, [assignmentsQuery.data]);

	// Nickname first, legal name as fallback — same choice every card makes.
	const prNameById = useMemo(
		() =>
			new Map(
				(prsQuery.data?.data ?? []).map((p) => [
					p.id,
					p.nickname?.trim() || p.name,
				]),
			),
		[prsQuery.data],
	);

	const staffingByShift = useMemo(() => {
		const map = new Map<
			string,
			{ staffed: number; tiers: (string | null)[]; unknown?: number }
		>();
		for (const a of assignmentsQuery.data?.data ?? []) {
			if (NON_STAFFING_ASSIGNMENT_STATUSES.includes(a.status)) continue;
			const entry = map.get(a.shiftId) ?? { staffed: 0, tiers: [] };
			entry.staffed += 1;
			// ⚠️ CONVERTED TO THE OUTLET BUCKET, not the raw membership tier.
			//
			// `agency_pr.tier` is `'tier_1'`; the demand (`shift_pay_tier.tier`) and
			// the server's `staffedBuckets` both speak `'Tier I'`. Pushing the raw
			// value made an agency's OWN filled seats match nothing, so the tier
			// they had just filled still read as open — while seats filled by
			// ANOTHER agency, which arrive already bucketed from the server, capped
			// correctly. The agency that supplied the PR was the one that could
			// double-book the tier, and every other agency saw the cap work, which
			// is why this looked like a sharing bug rather than a units bug.
			//
			// `auto-assign.ts` already converted at both of its own call sites; this
			// one was simply missed.
			entry.tiers.push(bucketForPrTier(tierByPrId.get(a.prId) ?? null));
			map.set(a.shiftId, entry);
		}
		// A SHIFT SHARED WITH ANOTHER AGENCY (0124) is filled by both, and the loop
		// above can only see our own rows — `/shift-assignment` is scoped to us, as
		// it must be. Counting it alone reports our contribution as the occupancy,
		// which is how this sheet came to offer seats the other agency had filled.
		//
		// The server's count REPLACES ours rather than adding to it: it already
		// includes the rows we just counted.
		//
		// The tier list keeps ours and is topped up with the other agency's seats as
		// anonymous entries — the quota needs to know a Tier I seat is gone, and must
		// NOT learn who took it.
		// ONE merge, shared with the auto-assign planner and the manual assign
		// dialog. This used to be an inlined copy, and for a while there were
		// three — which is exactly how the tier vocabularies drifted: one copy
		// pushed the raw `tier_1` while the demand and the server buckets speak
		// `Tier I`, so the agency that supplied a PR could double-book its own
		// tier while every other agency saw the cap work. Three screens answering
		// "how full is this shift, per tier" have to answer with one function.
		for (const shift of shiftsQuery.data?.data ?? []) {
			const entry = map.get(shift.id) ?? { staffed: 0, tiers: [] };
			const merged = mergeCrossAgencyStaffing(shift, entry.tiers);
			map.set(shift.id, {
				staffed: merged.staffed,
				tiers: merged.buckets,
				// SEATS WE KNOW ARE TAKEN BUT CANNOT NAME A TIER FOR. Carried rather
				// than dropped because dropping it is what made the failure silent:
				// with no tier split the anonymous seats land in the "tiers the shift
				// never named" bucket, every named quota reads open, and the grid goes
				// on greying rows out with exactly the same confidence it has when it
				// really knows. Nothing here refuses on it — the server decides — but
				// the sheet says so instead of quietly promising a seat.
				unknown: merged.unknownBuckets,
			});
		}
		return map;
	}, [assignmentsQuery.data, tierByPrId, shiftsQuery.data]);

	// Backend shifts for the day: not sealed, and NOT already finished. The
	// grouping key is a DATE, so a shift stayed assignable for the rest of the day
	// after it ended, and every shift on an earlier day of the week stayed
	// assignable outright. Assigning there produces a slot nobody can check into.
	// `hasShiftEnded` is overnight-aware; see shift-window.ts for why that is not
	// optional (most rows in this table cross midnight).
	//
	// Full shifts are NO LONGER dropped from this list — they are listed and
	// greyed out. Hiding them made a full shift indistinguishable from one that
	// was never posted, and the agency had no way to tell why a venue they knew
	// about was missing from the day.
	const openShiftsByDay = useMemo(() => {
		const map: Record<string, Shift[]> = {};
		const now = new Date();
		const todayLocal = now.toLocaleDateString("en-CA");
		for (const s of shiftsQuery.data?.data ?? []) {
			if (s.status === "sealed") continue;
			// A clock-ended shift STAYS for the rest of the day it ENDED on
			// (owner, 23 Aug 2026: "the outlet posted the shift earlier why
			// after check out then agency cannot assign again"). Stamps and
			// decisions resolve bookings, not clocks — the demand a venue posted
			// stands until that day is done. Earlier days are genuinely gone.
			//
			// ⚠️ Keyed on the END day, not on `shiftDate` (owner, 24 Aug 2026).
			// The original `s.shiftDate !== todayLocal` measured the day the
			// shift STARTED, so a 22:00-04:00 posted Monday was dropped at 04:00
			// Tuesday — the very instant it ended — and the ENDED state could
			// never render for it. That silently excluded the majority: 21 of
			// the 40 live rows cross midnight. Now Monday's overnight stays
			// through Tuesday, exactly as a 14:00 shift stays through Monday.
			//
			// A slot with no window yields null and is KEPT, unchanged from
			// before: `hasShiftEnded` failed open on it too.
			const endDay = shiftEndDayIso(s.shiftDate, s.slot);
			if (endDay && endDay < todayLocal) continue;
			const outletName = outletNameById.get(s.outletId) ?? s.outletId;
			if (filters.outlet && outletName !== filters.outlet) continue;
			const list = map[s.shiftDate];
			if (list) list.push(s);
			else map[s.shiftDate] = [s];
		}
		return map;
	}, [shiftsQuery.data, outletNameById, filters.outlet]);

	/**
	 * WHICH of those shifts are over. The clock is read ONCE for the whole grid,
	 * so the demand band, the + buttons and the assign sheet cannot disagree —
	 * and so the answer cannot drift between three reads taken milliseconds
	 * apart on either side of an end time.
	 *
	 * Ended shifts deliberately STAY in `openShiftsByDay`: c800d5e stopped them
	 * vanishing, because a venue's unfilled demand disappearing at its own end
	 * time is how the agency lost sight of it. They are shown, greyed and
	 * refused — not hidden.
	 */
	const endedShiftIds = useMemo(() => {
		const now = new Date();
		const set = new Set<string>();
		for (const list of Object.values(openShiftsByDay)) {
			for (const s of list) {
				if (hasShiftEnded(s.shiftDate, s.slot, now)) set.add(s.id);
			}
		}
		return set;
	}, [openShiftsByDay]);

	/**
	 * What the assign sheet may offer: the day's open shifts minus the ended
	 * ones. The server refuses those with a 409, so listing them would only
	 * manufacture a refusal the agency could have been spared.
	 */
	const assignableShiftsForTarget = useMemo(() => {
		if (!assignTarget) return [];
		return (openShiftsByDay[assignTarget.dateIso] ?? []).filter(
			(s) => !endedShiftIds.has(s.id),
		);
	}, [assignTarget, openShiftsByDay, endedShiftIds]);

	/**
	 * SHIFTS THIS PR IS ALREADY ON — the one refusal no shift-side rule can see.
	 *
	 * Every filter above judges the SHIFT: sealed, past its day, over by the
	 * clock, full, wrong tier. None of them knows anything about the person the
	 * sheet was opened for, so a shift the PR already holds a seat on stayed
	 * offered, and Schedule PR could only come back 409 "PR is already assigned
	 * to this shift".
	 *
	 * It shows on a HALF-FILLED shift, which is why it survived: 1 of 2 seats
	 * taken is a real open seat and the card belongs in the list — it is this PR
	 * who cannot take it.
	 *
	 * A CHECKED-OUT booking still counts. The server's `alreadyHere` pre-check
	 * ignores `checkOutAt`, unlike its overlap guard, which skips a PR who has
	 * left: leaving early frees somebody for OTHER shifts, never for a second
	 * seat on the one they just worked.
	 *
	 * Matched on `prId` alone, which is the whole identity here: post-cutover
	 * `shift_assignment.pr_id` IS the user id, and the row shape carries no
	 * separate `userId` to disagree with it.
	 */
	const alreadyOnShiftIds = useMemo(() => {
		const set = new Set<string>();
		const target = assignTarget?.pr;
		if (!target) return set;
		for (const a of assignmentsQuery.data?.data ?? []) {
			if (NON_STAFFING_ASSIGNMENT_STATUSES.includes(a.status)) continue;
			if (a.prId !== target.id) continue;
			set.add(a.shiftId);
		}
		return set;
	}, [assignTarget, assignmentsQuery.data]);

	// Row filter mirrors the demo timetable's filterTimetablePrs, adapted to
	// backend PRs: name/nickname search, the scheduled/free toggle, and — when
	// any shift filter is active — keep only PRs with a matching slot or a free
	// day. (The old `prType` filter is gone: it only offered "agency" and every
	// backend PR is agency-scoped, so it never excluded anyone — this comment is
	// what proved it was dead.)
	const prRows = useMemo(() => {
		const q = filters.nameQuery.trim().toLowerCase();
		return (prsQuery.data?.data ?? [])
			.filter((pr) => {
				if (
					q &&
					!(
						pr.name.toLowerCase().includes(q) ||
						(pr.nickname?.toLowerCase().includes(q) ?? false)
					)
				) {
					return false;
				}
				const weekSlots = roster.filter(
					(s) => s.prId === pr.id && days.includes(s.dateIso),
				);
				const matchingSlots = filterRosterShifts(weekSlots, filters);
				const hasFreeDay = days.some(
					(d) => getPrScheduleState(pr.id, roster, d) === "free",
				);
				if (filters.showPrs === "scheduled") return matchingSlots.length > 0;
				if (filters.showPrs === "free") return hasFreeDay;
				if (shiftFiltersOn) return matchingSlots.length > 0 || hasFreeDay;
				return true;
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [prsQuery.data, roster, days, filters, shiftFiltersOn]);

	/**
	 * THE WEEK'S OPEN DEMAND, flattened.
	 *
	 * This used to be the grid's first ROW — one cell per day, cards stacked
	 * inside. Stacking is why it had to hide everything past the second card
	 * behind a "+2 more": a Saturday with six posted jobs made the header taller
	 * than the roster beneath it, and the row grew downward without limit.
	 *
	 * One entry per SHIFT, carrying its own day, lets the band scroll sideways
	 * instead. Height is then fixed no matter how much demand there is, nothing
	 * is hidden behind a toggle, and the grid starts where the roster starts.
	 *
	 * Same `openShiftsByDay` the assign dialog reads, so the two can never
	 * disagree about what is still open. Sealed shifts are gone from that map;
	 * ENDED ones are NOT — they stay, and this band is the one place that shows
	 * them, greyed and labelled. The assign dialog subtracts them instead
	 * (`assignableShiftsForTarget`), which is the whole point: the demand is
	 * still reportable after its end time even though it is no longer fillable.
	 */
	const openDemand = useMemo(() => {
		const demandNow = new Date();
		const cards = days.flatMap((dateIso) =>
			(openShiftsByDay[dateIso] ?? [])
				.map((shift) => ({
					shift,
					dateIso,
					open: (shift.quantity ?? 0) - (shift.staffedCount ?? 0),
					// ENDED, not gone (owner, 24 Aug 2026). c800d5e stopped hiding
					// today's finished shifts because a venue's unfilled demand
					// vanishing at its own end time is how the agency lost track of
					// it. It still does not vanish — it goes grey and says so — but
					// the server now refuses to staff it, so the card must stop
					// looking like work someone can pick up.
					ended: endedShiftIds.has(shift.id),
				}))
				.filter((d) => d.open > 0)
				// Nothing left to chase and nobody to pay — see `isEndedAndUnworked`,
				// the same predicate the grid's request markers read.
				.filter((d) => !isEndedAndUnworked(d.shift, demandNow)),
		);
		// Chronological across the whole week — the same rule the request markers
		// use, so a card's position means the same thing in both places.
		cards.sort(
			(x, y) =>
				x.dateIso.localeCompare(y.dateIso) ||
				(windowMinutes(x.shift.slot ?? "")?.[0] ?? 1e9) -
					(windowMinutes(y.shift.slot ?? "")?.[0] ?? 1e9),
		);
		/*
		 * ONE ROW PER OUTLET (owner, 24 Aug 2026).
		 *
		 * A single sideways rail mixed every venue together, so reading "what
		 * does JK House still need" meant scanning the whole week's cards for a
		 * repeated name. Grouping first makes the venue the row label, which is
		 * also why the card below no longer prints the outlet: the row already
		 * said it, and the space buys the bigger type the owner asked for.
		 *
		 * `cards` is already chronological, so each group inherits that order and
		 * `rows[0]` is that venue's next open shift.
		 */
		const byOutlet = new Map<string, typeof cards>();
		for (const card of cards) {
			const arr = byOutlet.get(card.shift.outletId) ?? [];
			arr.push(card);
			byOutlet.set(card.shift.outletId, arr);
		}
		const groups = [...byOutlet.entries()].map(([outletId, rows]) => ({
			outletId,
			name: outletNameById.get(outletId) ?? outletId,
			logo: outletLogoById.get(outletId) ?? null,
			rows,
			seats: rows.reduce((sum, d) => sum + d.open, 0),
		}));
		// Soonest need first — the venue whose next open shift comes up first
		// leads, so the band reads as a queue rather than an alphabet.
		groups.sort(
			(a, b) =>
				a.rows[0].dateIso.localeCompare(b.rows[0].dateIso) ||
				(windowMinutes(a.rows[0].shift.slot ?? "")?.[0] ?? 1e9) -
					(windowMinutes(b.rows[0].shift.slot ?? "")?.[0] ?? 1e9) ||
				a.name.localeCompare(b.name),
		);
		return {
			cards,
			groups,
			// Seats, not shifts: "3 shifts" understates a night that needs 18 people.
			seats: cards.reduce((sum, d) => sum + d.open, 0),
		};
	}, [days, openShiftsByDay, outletNameById, outletLogoById, endedShiftIds]);

	/**
	 * The ONE shift the day sheet is open on (owner, 24 Aug 2026: clicking a card
	 * shows "only the details of the shift that was clicked"). It used to key off
	 * the DATE and list every open shift that day, so clicking Emhub also showed
	 * JK House and the reader had to find the card they had just pressed.
	 *
	 * Resolved from `openShiftsByDay` rather than captured at click time, so a
	 * refetch that fills or ends the shift closes the sheet instead of leaving a
	 * stale copy of it on screen.
	 */
	const demandShiftRow = useMemo(() => {
		if (!demandShift) return null;
		return (
			(openShiftsByDay[demandShift.dateIso] ?? []).find(
				(s) => s.id === demandShift.shiftId,
			) ?? null
		);
	}, [demandShift, openShiftsByDay]);

	/**
	 * Everything the sheet prints about that one shift, folded here so the JSX
	 * below is flat. It used to be computed inside a `.map` over the day's
	 * shifts; with a single shift there is nothing to map over.
	 */
	const demandDetail = useMemo(() => {
		const s = demandShiftRow;
		if (!s) return null;
		const booked = bookedByShift.get(s.id) ?? [];
		const bookedIds = new Set(booked.map((b) => b.prId));
		return {
			shift: s,
			// The SHIFT's own template picture — a different asset space from the
			// venue's logo beside it, hence the different resolver.
			cover: apiAssetUrl(s.templateCoverImage),
			outlet: outletNameById.get(s.outletId) ?? "",
			logo: outletLogoById.get(s.outletId) ?? null,
			booked,
			cart: (s.requestedPrs ?? []).map((r) => ({
				userId: r.userId,
				name: prNameById.get(r.userId) ?? "PR",
				booked: bookedIds.has(r.userId),
			})),
			open: (s.quantity ?? 0) - (s.staffedCount ?? 0),
		};
	}, [
		demandShiftRow,
		bookedByShift,
		outletNameById,
		outletLogoById,
		prNameById,
	]);

	const weekLabel = weekRangeLabel(weekStartIso);
	const loading = prsQuery.isLoading || shiftsQuery.isLoading;

	return (
		<>
			{/*
				OPEN DEMAND, lifted out of the grid.
				
				It sits ABOVE the roster because it is the question the roster is the
				answer to — "who still needs covering" read before "who is free". In
				the grid it was a row like any other, which meant it scrolled away the
				moment the agency looked down the PR list, and it stole height from the
				thing it was asking about.
				
				The strip scrolls SIDEWAYS and never wraps. That is the whole point: a
				week with twenty open shifts is a longer scroll, never a taller page,
				so the roster below always starts in the same place.
			*/}
			{openDemand.cards.length > 0 && (
				<section
					className="iz-roster-demand-band"
					aria-label={t.rosterGrid.openDemandRow}
				>
					<div className="iz-roster-demand-band-head">
						<span className="iz-roster-demand-band-title">
							{t.rosterGrid.openDemandRow}
						</span>
						{/* Seats, not just shifts — the number that says how much work
						    this is. One shift reads as a sentence, not "1 shifts". */}
						<span className="iz-roster-demand-band-count">
							{openDemand.cards.length === 1
								? fill(t.rosterGrid.openDemandOneShift, {
										seats: openDemand.seats,
									})
								: fill(t.rosterGrid.openDemandSummary, {
										shifts: openDemand.cards.length,
										seats: openDemand.seats,
									})}
						</span>
					</div>

					{/* One row per venue. Each keeps its OWN sideways rail, so the
					    band still grows rightwards with the week rather than
					    downwards — a venue with nine open shifts is a longer scroll
					    on its own line, not nine lines. */}
					<div className="iz-roster-demand-outlets">
						{openDemand.groups.map((group) => (
							<div className="iz-roster-demand-outlet" key={group.outletId}>
								<div className="iz-roster-demand-outlet-head">
									{/* The venue's real mark. Shared tile, so a missing logo
									    falls back to the map pin the rest of the portal uses
									    instead of an empty square that reads as a bug. */}
									{/* Pin sized for the 40px tile — a 14px icon inside it reads
									    as a mistake rather than as "no logo on file". */}
									<OutletLogoTile
										logo={group.logo}
										className="iz-roster-demand-outlet-logo"
										iconClassName="h-5 w-5"
									/>
									<span className="iz-roster-demand-outlet-name">
										{group.name}
									</span>
									{/* Same two keys as the band total, scoped to this venue —
									    one shift reads as a sentence, not "1 shifts". */}
									<span className="iz-roster-demand-outlet-count">
										{group.rows.length === 1
											? fill(t.rosterGrid.openDemandOneShift, {
													seats: group.seats,
												})
											: fill(t.rosterGrid.openDemandSummary, {
													shifts: group.rows.length,
													seats: group.seats,
												})}
									</span>
								</div>

								<div className="iz-roster-demand-band-rail">
									{group.rows.map(({ shift, dateIso, open, ended }) => {
										const { dow, dom } = dayColumnLabel(dateIso);
										const requested = shift.requestedPrs ?? [];
										// Two names, then a count. A venue that asked for six
										// people must not make its card six times taller than its
										// neighbours — the sheet behind the card lists them all.
										const shownNames = requested.slice(0, 2);
										const restNames = requested.length - shownNames.length;
										return (
											<button
												type="button"
												key={shift.id}
												className={cn(
													"iz-roster-demand-card iz-roster-demand-card--rail",
													todayIso === dateIso && "is-today",
													ended && "is-ended",
												)}
												onClick={() =>
													setDemandShift({ shiftId: shift.id, dateIso })
												}
												title={[
													group.name,
													shift.slot,
													fill(t.rosterGrid.openDemandCell, { n: open }),
												]
													.filter(Boolean)
													.join(" · ")}
											>
												<span className="day">
													{dow} {dom}
												</span>
												{shift.slot && (
													<span className="slot">{shift.slot}</span>
												)}
												<span className="count">
													{fill(t.rosterGrid.openDemandCount, { n: open })}
												</span>
												{/* Says the seats are unfillable, not that they were
												    filled — the count above still reads "6 open"
												    because six people never turned up. */}
												{ended && (
													<span className="ended">
														{t.rosterGrid.openDemandEnded}
													</span>
												)}
												{/* WHO the venue asked for — its SELECT PRS picks.
												    Only requests addressed to THIS agency arrive, so
												    every chip is ours to act on. */}
												{requested.length > 0 && (
													<div className="iz-roster-demand-names">
														{shownNames.map((r) => (
															<span
																key={r.userId}
																className="iz-roster-demand-chip"
															>
																{prNameById.get(r.userId) ?? "PR"}
															</span>
														))}
														{restNames > 0 && (
															<span className="iz-roster-demand-chip">
																+{restNames}
															</span>
														)}
													</div>
												)}
											</button>
										);
									})}
								</div>
							</div>
						))}
					</div>
				</section>
			)}

			{afterOpenDemand}

			<div className="iz-roster-week">
				<div className="iz-roster-week-head">
					<button
						type="button"
						className="iz-roster-week-nav"
						aria-label={t.rosterGrid.previousWeek}
						onClick={() => onWeekChange(shiftWeekAnchor(weekStartIso, -1))}
					>
						<ChevronLeft className="h-4 w-4" />
					</button>
					<div className="min-w-0 text-center">
						<p className="font-sora text-sm font-bold text-[var(--iz-txt)]">
							{fill(t.rosterGrid.weekOf, { label: weekLabel })}
						</p>
						<p className="iz-tiny iz-muted2">
							{t.rosterGrid.liveBackendRoster}
						</p>
					</div>
					<button
						type="button"
						className="iz-roster-week-nav"
						aria-label={t.rosterGrid.nextWeek}
						onClick={() => onWeekChange(shiftWeekAnchor(weekStartIso, 1))}
					>
						<ChevronRight className="h-4 w-4" />
					</button>
				</div>

				<div className="iz-roster-week-scroll">
					<table className="iz-roster-week-table">
						<colgroup>
							<col className="iz-roster-week-col-pr" />
							{days.map((dateIso) => (
								<col key={dateIso} className="iz-roster-week-col-day" />
							))}
						</colgroup>
						<thead>
							<tr>
								<th className="iz-roster-week-pr-col">PR</th>
								{days.map((dateIso) => {
									const { dow, dom } = dayColumnLabel(dateIso);
									const isToday = todayIso === dateIso;
									return (
										<th
											key={dateIso}
											className={cn("iz-roster-week-day-col", isToday && "on")}
										>
											<span className="dow">{dow}</span>
											<span className="dom">{dom}</span>
										</th>
									);
								})}
							</tr>
						</thead>
						<tbody>
							{prRows.length === 0 ? (
								<tr>
									<td
										colSpan={days.length + 1}
										className="iz-roster-week-empty"
									>
										{loading
											? t.rosterGrid.loadingRoster
											: t.rosterGrid.noPrsYet}
									</td>
								</tr>
							) : (
								prRows.map((pr) => {
									const profile = managedPrFromBackend(pr);
									// Nickname FIRST: "(Vicky) Victoria Tan Mei Lin". This row
									// had the two halves the other way round, so the same PR
									// read one way here and the other way on every payment
									// voucher. `formatPayeeLabel` is the single spelling.
									const displayName = formatPayeeLabel(pr.nickname, pr.name);
									return (
										<tr key={pr.id}>
											<th scope="row" className="iz-roster-week-pr">
												<div className="iz-roster-week-pr-inner">
													<PrComcardIdentity
														pr={toComcardPreview(profile)}
														profile={profile}
														size="week"
													/>
													<div className="min-w-0">
														<span className="name">{displayName}</span>
														{pr.tier && (
															<span className="meta">
																<span className="rating">{pr.tier}</span>
															</span>
														)}
													</div>
												</div>
											</th>
											{days.map((dateIso) => {
												const rawSlots =
													slotsByPrDay.get(`${pr.id}__${dateIso}`) ?? [];
												// The PR blocked this day. A distinct state from the "Off" a
												// cancelled assignment paints — that one means a booking was
												// called off, this one means the person is not available at
												// all — and the agency has to be able to tell them apart.
												const prBlocked =
													blockedDates.get(pr.id)?.has(dateIso) ?? false;
												// Slots that fail the active filters read as free, so
												// the outlet/status/payout/time filters narrow the grid.
												const daySlots = rawSlots.filter(
													(s) =>
														(!shiftFiltersOn ||
															timetableSlotMatches(s, filters)) &&
														// An EXCUSED shift that somebody has since COVERED stops
														// occupying the PR's day. Until a replacement exists the red
														// card is the reminder that this night lost someone; once it is
														// covered that reminder has been answered, and all that stays
														// true of the PR is that they are unavailable — which the
														// blocked-day cell already says, with the reason on it.
														// Emptying this list is what lets that cell through.
														//
														// leave_approved, cancelled and no_show ALL arrive here as the
														// single UI status "unavailable" (backend-shift-map), so the
														// status alone cannot say which one this is. noShowFlag and
														// cancelledAt are the discriminators the slot already carries,
														// and both must be excluded: a NO-SHOW is an attendance fact
														// the agency bills and rates on, and a cancellation is a
														// booking called off rather than a person excused. What is left
														// is an approved MC, which is the only case this hides.
														//
														// prBlocked is NOT the discriminator — pr_availability rows are
														// mostly the PR's OWN self-declared days and blockLeaveDay is
														// just one more writer, so leaning on it would have hidden a
														// no-show on any day the PR had blocked themselves. It stays as
														// the precondition for the fall-through: the blocked-day cell is
														// what replaces the card, and without a block there is nothing
														// for the emptied list to fall through TO.
														!(
															prBlocked &&
															s.status === "unavailable" &&
															!s.noShowFlag &&
															!s.cancelledAt &&
															!unansweredDropouts.has(s.id)
														),
												);
												const open = openShiftsByDay[dateIso] ?? [];
												// ENDED shifts stay in openShiftsByDay so the demand
												// band can paint them grey, but they are not work
												// anyone can be given — the server refuses them with
												// a 409 — so the + must not invite the attempt.
												const assignable = open.filter(
													(s2) => !endedShiftIds.has(s2.id),
												);
												const hasOpen = assignable.length > 0;
												// The PR blocked this day. A distinct state from the
												// "Off" a cancelled assignment paints — that one means
												// a booking was called off, this one means the person
												// is not available at all — and the agency has to be
												// able to tell them apart.
												// (declared above daySlots — it decides what that list keeps)
												/*
												 * BUSY ELSEWHERE — a THIRD state, and not a fourth
												 * flavour of the two above.
												 *
												 * "Blocked" is the whole day and the agency cannot work
												 * around it. "Filled" is this agency's own booking. This
												 * is neither: the person is spoken for during these hours
												 * only, and the rest of the day is genuinely bookable —
												 * which is the entire point of the window rule and the
												 * reason the cell must STAY clickable underneath.
												 *
												 * Times, never the agency or the venue. The grid says WHEN
												 * so the roster can be planned around it; who booked her
												 * is a rival's business and stays out of the payload.
												 */
												// `windowsEffectiveOn`, not a bare `.get(dateIso)`: a
												// shift is stamped with its START date, so last
												// night's 22:00-04:00 is filed under yesterday while
												// still occupying this morning.
												const prCommittedByDate = committedWindows.get(pr.id);
												const effectiveBusy = windowsEffectiveOn(
													prCommittedByDate,
													dateIso,
												);
												/*
												 * A rival commitment whose slot named no clock time
												 * arrives as this date registered with ZERO windows —
												 * the server strips label-only slots to null at its
												 * privacy boundary. The person is spoken for at an
												 * UNKNOWN hour: the cell says so and stays clickable.
												 * A whole-day "Unavailable" would re-impose the rule
												 * the owner narrowed on 20 Aug, and silence is how a
												 * double-booking gets planned in good faith.
												 */
												const committedTimeUnknown =
													effectiveBusy.length === 0 &&
													prCommittedByDate?.get(dateIso)?.length === 0;
												// The venue asked for THIS person on THIS day — the
												// "waiting for agency to approve" state the owner
												// wants visible on the planning grid.
												const dayRequestsAll =
													requestedByPrDate.get(pr.id)?.get(dateIso) ?? null;
												// A request the roster already satisfied VANISHES — the
												// assigned slot cell is its display now, with its real
												// status (owner: "if assigned for the pr not show outlet
												// requested"). The marker only ever means "still waiting".
												const dayRequests =
													dayRequestsAll?.filter(
														(r) =>
															!assignmentIdByPrShift.has(
																`${pr.id}|${r.shiftId}`,
															),
													) ?? null;
												const busyLabel =
													effectiveBusy.length > 0
														? effectiveBusy.join(", ")
														: committedTimeUnknown
															? t.rosterGrid.busyTimeUnknown
															: null;
												const reason = blockedReasons.get(
													blockedReasonKey(pr.id, dateIso),
												);
												if (daySlots.length > 0) {
													return (
														<td key={dateIso} className="iz-roster-week-td">
															{daySlots.map((slot) => {
																const tone = toneFor(slot);
																return (
																	<button
																		key={slot.id}
																		type="button"
																		className={`iz-roster-week-cell iz-roster-week-cell--filled ${tone.className}`}
																		onClick={() =>
																			canAssign && onEditSlot(slot.id)
																		}
																		disabled={!canAssign}
																		aria-label={fill(
																			t.rosterGrid.prAtOutletOn,
																			{
																				name: pr.name,
																				outlet: slot.outlet,
																				date: dateIso,
																			},
																		)}
																	>
																		<span className="outlet">
																			{slot.outlet}
																		</span>
																		<span className="shift">
																			{slot.shift || t.rosterGrid.shift}
																		</span>
																		<span className="status">
																			{tone.label(t)}
																		</span>
																	</button>
																);
															})}
															{/* The venue asked for THIS person — shown even when
															    she already holds a slot today: the request may be
															    for a different hour, and hiding it made a named
															    ask invisible exactly when the PR was busiest. */}
															{dayRequests?.map((r, i) => (
																<button
																	type="button"
																	key={`${r.outlet}-${r.slot ?? ""}-${i}`}
																	className="iz-roster-week-cell iz-roster-week-cell--pending"
																	style={{ marginTop: 4 }}
																	title={[r.outlet, r.slot]
																		.filter(Boolean)
																		.join(" · ")}
																	disabled={!canAssign}
																	onClick={() => {
																		const assignmentId =
																			assignmentIdByPrShift.get(
																				`${pr.id}|${r.shiftId}`,
																			);
																		if (assignmentId) onEditSlot(assignmentId);
																		else setAssignTarget({ pr, dateIso });
																	}}
																>
																	<span className="outlet">{r.outlet}</span>
																	<span className="shift">{r.slot ?? ""}</span>
																	<span className="status">
																		{t.rosterGrid.outletRequest}
																	</span>
																</button>
															))}
															{/* Same day, second shift — allowed at a different
															    time (the backend refuses overlaps). Not offered
															    when the PR has blocked the day: the shift they
															    already hold predates the block, but a SECOND one
															    is a new booking the server would refuse. */}
															{/* Present even with nothing open right now — the
															    FREE cells keep their + in that state (dimmed,
															    with the no-shifts title), and this branch hiding
															    its own made the button look randomly missing
															    (owner: "where is the add shift for the pr"). */}
															{canAssign && !prBlocked && (
																<button
																	type="button"
																	className={`iz-roster-week-cell iz-roster-week-cell--empty${!hasOpen ? " iz-roster-week-cell--no-shifts" : ""}`}
																	style={{ marginTop: 4, minHeight: 28 }}
																	onClick={() =>
																		setAssignTarget({ pr, dateIso })
																	}
																	aria-label={fill(
																		t.rosterGrid.assignAnotherShift,
																		{ name: pr.name, date: dateIso },
																	)}
																	title={
																		hasOpen
																			? t.rosterGrid.addAnotherShiftThisDay
																			: t.rosterGrid.noOpenShiftsThisDay
																	}
																>
																	<Plus className="h-3 w-3" />
																</button>
															)}
														</td>
													);
												}

												// The PR is not available. Rendered as a stated
												// refusal rather than a plain empty cell: a cell that
												// merely does nothing on click reads as a broken
												// button, and this is the one thing on the grid the
												// agency cannot change themselves.
												if (prBlocked) {
													return (
														<td key={dateIso} className="iz-roster-week-td">
															{/* Not a button: the agency cannot clear this, only
															    the PR can. The visible t.roster.unavailable IS the
															    accessible name — an aria-label on a plain div is
															    not exposed to assistive tech, so the text has to
															    carry it.

															    The reason is the PR's own words and is optional,
															    so the cell must read correctly without it — it is
															    a second line, never a replacement for the status.
															    The cell is one column of seven, so a long reason
															    is clamped to two lines and the `title` carries it
															    in full on hover. */}
															<div
																className="iz-roster-week-cell iz-roster-week-cell--unavailable"
																title={
																	reason
																		? fill(
																				t.rosterGrid.markedUnavailableReason,
																				{
																					name: pr.name,
																					date: dateIso,
																					reason,
																				},
																			)
																		: fill(t.rosterGrid.markedUnavailable, {
																				name: pr.name,
																				date: dateIso,
																			})
																}
															>
																<span className="status">
																	{t.roster.unavailable}
																</span>
																{reason && (
																	<span className="reason">{reason}</span>
																)}
															</div>
														</td>
													);
												}

												return (
													<td key={dateIso} className="iz-roster-week-td">
														<button
															type="button"
															className={`iz-roster-week-cell iz-roster-week-cell--empty${canAssign && !hasOpen ? " iz-roster-week-cell--no-shifts" : ""}`}
															disabled={!canAssign}
															onClick={() =>
																canAssign && setAssignTarget({ pr, dateIso })
															}
															aria-label={fill(t.rosterGrid.assignPrOn, {
																name: pr.name,
																date: dateIso,
															})}
															title={
																canAssign && !hasOpen
																	? t.rosterGrid.noOpenShiftsThisDay
																	: undefined
															}
														>
															{canAssign ? (
																<Plus className="h-4 w-4" />
															) : (
																<span className="dash">—</span>
															)}
														</button>
														{/*
														 * BUSY ELSEWHERE, under the still-clickable cell.
														 *
														 * Deliberately BELOW the assign button and not in
														 * place of it: those hours are taken, the rest of the
														 * day is not, and replacing the button would refuse in
														 * the interface exactly the bookings the window rule
														 * exists to allow.
														 *
														 * Says WHEN and nothing else — no agency, no venue.
														 * The assign sheet's refusal now repeats what this
														 * already showed, which is what turns it from an error
														 * into a reminder.
														 */}
														{dayRequests?.map((r, i) => (
															<button
																type="button"
																key={`${r.outlet}-${r.slot ?? ""}-${i}`}
																className="iz-roster-week-cell iz-roster-week-cell--pending"
																style={{ marginTop: 4 }}
																title={[r.outlet, r.slot]
																	.filter(Boolean)
																	.join(" · ")}
																disabled={!canAssign}
																onClick={() => {
																	const assignmentId =
																		assignmentIdByPrShift.get(
																			`${pr.id}|${r.shiftId}`,
																		);
																	if (assignmentId) onEditSlot(assignmentId);
																	else setAssignTarget({ pr, dateIso });
																}}
															>
																<span className="outlet">{r.outlet}</span>
																<span className="shift">{r.slot ?? ""}</span>
																<span className="status">
																	{t.rosterGrid.outletRequest}
																</span>
															</button>
														))}
														{busyLabel && (
															<div
																className="iz-roster-week-busy"
																title={fill(t.rosterGrid.busyElsewhereAt, {
																	name: pr.name,
																	time: busyLabel,
																})}
															>
																{/*
																 * ⚠️ SAYS UNAVAILABLE, NEVER "WORKING".
																 *
																 * The earlier wording was "already working 15:00 -
																 * 04:00", which states there IS a job on. Since it is
																 * plainly not THIS agency's job, that names a rival by
																 * elimination — the exact disclosure the refusal it
																 * previews was written to avoid. The status of the
																 * hours is all an agency needs to roster around them,
																 * and it is all they are owed.
																 *
																 * Same word as the self-declared block above, on
																 * purpose: an agency must not be able to tell "she
																 * took these hours off" from "she is spoken for".
																 */}
																<span className="status">
																	{t.rosterGrid.unavailableAtTime}
																</span>
																<span className="time">{busyLabel}</span>
															</div>
														)}
													</td>
												);
											})}
										</tr>
									);
								})
							)}
						</tbody>
					</table>
				</div>
			</div>

			{demandShift && demandDetail && (
				<IzSheet open onClose={() => setDemandShift(null)}>
					<div className="iz-sheet-head">
						<div>
							<p className="iz-tiny iz-muted2 uppercase tracking-widest">
								{t.rosterGrid.openDemandRow}
							</p>
							<h3>{demandShift.dateIso}</h3>
						</div>
						<button
							type="button"
							className="iz-sheet-close"
							onClick={() => setDemandShift(null)}
							aria-label={t.common.close}
						>
							<X className="h-4 w-4" />
						</button>
					</div>
					<div className="mt-3 space-y-3">
						{(() => {
							const {
								shift: s,
								cover,
								outlet,
								logo,
								booked,
								cart,
								open,
							} = demandDetail;
							return (
								<div key={s.id} className="iz-demand-sheet-card">
									{/*
										The shift's own cover runs the full width of the sheet as
										a header image, with the venue's mark badged onto its
										corner. Two 40-odd-pixel tiles side by side next to the
										text is what made this read as a list row; one picture at
										a size worth looking at is what makes it read as the
										night itself. The badge also puts the venue's identity ON
										the picture, so the pairing needs no caption.
									*/}
									<div className="iz-demand-sheet-art">
										{cover ? (
											// Zoomable, through the SAME viewer the proof photos use —
											// it is portalled to <body> at z-300 precisely so it can
											// escape a translucent transformed sheet like this one. A
											// shift cover carries the dress the venue wants and the
											// room it wants it in, and neither survives 146px.
											<button
												type="button"
												className="iz-demand-sheet-cover-btn"
												onClick={() => setCoverZoom(cover)}
												aria-label={t.rosterGrid.demandCoverZoom}
											>
												<img
													src={cover}
													alt=""
													className="iz-demand-sheet-cover"
												/>
												<span className="iz-demand-sheet-zoom-hint" aria-hidden>
													<Maximize2 className="h-3.5 w-3.5" />
												</span>
											</button>
										) : (
											<div className="iz-demand-sheet-cover is-empty" />
										)}
										<OutletLogoTile
											logo={logo}
											className="iz-demand-sheet-logo"
											iconClassName="h-5 w-5"
										/>
									</div>
									<div className="iz-demand-sheet-top">
										<div className="iz-demand-sheet-titles">
											<p className="iz-demand-sheet-outlet">{outlet}</p>
											<p className="iz-demand-sheet-slot">{s.slot ?? ""}</p>
											{s.eventName && (
												<p className="iz-demand-sheet-event">{s.eventName}</p>
											)}
										</div>
										<span
											className={`iz-pill ${open > 0 ? "iz-pill-amber" : "iz-pill-green"} iz-demand-sheet-pill`}
										>
											{fill(t.rosterGrid.demandFilled, {
												n: s.staffedCount ?? 0,
												total: s.quantity ?? 0,
											})}
										</span>
									</div>
									{cart.length > 0 && (
										<div className="iz-demand-sheet-section">
											<p className="iz-demand-sheet-heading">
												{t.rosterGrid.demandCartHeading}
											</p>
											<div className="iz-demand-sheet-pills">
												{cart.map((c) => (
													<span
														key={c.userId}
														className={`iz-pill ${c.booked ? "iz-pill-green" : "iz-pill-amber"} iz-demand-sheet-pill`}
													>
														{c.name}
														{" · "}
														{c.booked
															? t.today.bookedPill
															: t.today.requestedPill}
													</span>
												))}
											</div>
										</div>
									)}
									<div className="iz-demand-sheet-section">
										<p className="iz-demand-sheet-heading">
											{t.rosterGrid.demandBookedHeading}
										</p>
										{booked.length === 0 ? (
											<p className="iz-demand-sheet-empty">
												{t.rosterGrid.demandNoBooked}
											</p>
										) : (
											<div className="iz-demand-sheet-pills">
												{booked.map((b) => (
													<span
														key={b.prId}
														className="iz-pill iz-pill-green iz-demand-sheet-pill"
													>
														{b.name}
													</span>
												))}
											</div>
										)}
									</div>
								</div>
							);
						})()}
					</div>
				</IzSheet>
			)}
			{/*
				OUTSIDE the sheet, and kept in its own state rather than derived from
				`demandDetail`, so closing the zoom returns you to the sheet you were
				reading instead of dismissing both.
			*/}
			{coverZoom && (
				<PhotoLightbox
					photo={coverZoom}
					alt={demandDetail?.outlet ?? t.rosterGrid.openDemandRow}
					onClose={() => setCoverZoom(null)}
				/>
			)}
			{assignTarget && (
				<AssignBackendCellSheet
					pr={assignTarget.pr}
					dateIso={assignTarget.dateIso}
					shifts={assignableShiftsForTarget}
					staffingByShift={staffingByShift}
					outletNameById={outletNameById}
					// The same windows the grid greys behind this sheet, so the two
					// cannot disagree about who is free.
					busyWindows={assignSheetBusy?.frame ?? null}
					busyTimeUnknown={assignSheetBusy?.timeUnknown ?? false}
					// The person-side fact the windows cannot carry: they are times,
					// and "already on this one" is an identity.
					alreadyOnShiftIds={alreadyOnShiftIds}
					onAssign={onAssign}
					onClose={() => setAssignTarget(null)}
				/>
			)}
		</>
	);
}

function shiftWeekAnchor(weekStartIso: string, delta: number): string {
	const [y, m, d] = weekStartIso.split("-").map(Number);
	const next = new Date(y, m - 1, d + delta * 7);
	return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

// Plain helper, not a component — takes `t` rather than reading it itself.
function shiftLabel(s: Shift, t: PortalTranslations): string {
	return s.slot || s.eventName || t.rosterGrid.shift;
}

function AssignBackendCellSheet({
	pr,
	dateIso,
	shifts,
	staffingByShift,
	outletNameById,
	busyWindows,
	busyTimeUnknown,
	alreadyOnShiftIds,
	onAssign,
	onClose,
}: {
	pr: PrPersonnel;
	dateIso: string;
	shifts: Shift[];
	staffingByShift: Map<
		string,
		{ staffed: number; tiers: (string | null)[]; unknown?: number }
	>;
	outletNameById: Map<string, string>;
	/**
	 * Windows this PR is already unavailable for around this DATE, on the
	 * continuous minute line `busyFrameOn` builds — today's windows plus
	 * tomorrow's rebased +1440, so an overnight card is greyed against the
	 * next morning too. Null when nothing is known.
	 *
	 * Times, never who or where: see the endpoint. The sheet greys a card and says
	 * "unavailable", exactly as the grid behind it does.
	 */
	busyWindows?: { label: string; from: number; to: number }[] | null;
	/**
	 * The PR is also spoken for at an hour NOBODY KNOWS — a commitment whose
	 * slot named no clock time. Advice only: no card is greyed for it, because
	 * greying all of them is the whole-day rule the owner retired on 20 Aug.
	 */
	busyTimeUnknown?: boolean;
	/** Shift ids this PR already holds a staffing seat on — see the parent memo. */
	alreadyOnShiftIds?: Set<string>;
	onAssign: (
		shiftId: string,
		prId: string,
		userId?: string,
	) => Promise<unknown>;
	onClose: () => void;
}) {
	const { t } = usePortalLocale();
	// Why each shift can or cannot take THIS PR — the same rules the API applies,
	// in the same order, so nothing selectable here can be refused there.
	const blockedById = useMemo(() => {
		const map = new Map<string, ShiftBlockReason | null>();
		for (const s of shifts) {
			const staffing = staffingByShift.get(s.id) ?? { staffed: 0, tiers: [] };
			map.set(
				s.id,
				shiftBlockedFor({
					shift: s,
					staffed: staffing.staffed,
					staffedTiers: staffing.tiers,
					prTier: pr.tier,
				}),
			);
		}
		return map;
	}, [shifts, staffingByShift, pr.tier]);

	/**
	 * THE THIRD RULE — the PR is not available at that time.
	 *
	 * The two rules above are facts about the SHIFT (full, wrong tier). This is a
	 * fact about the PERSON, and the server applies it too, so the sheet has to
	 * as well: a card left selectable here is a promise the assign will go
	 * through, and until now that promise was broken by a red refusal AFTER the
	 * agency had picked a shift and pressed the button.
	 *
	 * Kept out of `shiftBlockedFor` deliberately. That helper is shared with the
	 * auto-assign planner and takes only shift-shaped inputs; widening it to carry
	 * a PR's commitments would push person-state into a module about shifts.
	 *
	 * Compared on the CONTINUOUS minute line the busy frame arrives on, so a
	 * card that runs past midnight (15:00 - 04:00 parses past 1440) meets a
	 * booking filed under tomorrow. The server still holds the authority —
	 * this is the same advice as before, now agreeing with the refusal it
	 * previews.
	 */
	const unavailableById = useMemo(() => {
		const map = new Map<string, string | null>();
		for (const s of shifts) {
			const own = windowMinutes(s.slot ?? "");
			const hit =
				own &&
				busyWindows?.find((w) =>
					minuteRangesOverlap({ from: own[0], to: own[1] }, w),
				);
			map.set(s.id, hit ? hit.label : null);
		}
		return map;
	}, [shifts, busyWindows]);

	const selectable = useMemo(
		() =>
			shifts.filter(
				(s) =>
					!blockedById.get(s.id) &&
					!unavailableById.get(s.id) &&
					!alreadyOnShiftIds?.has(s.id),
			),
		[shifts, blockedById, unavailableById, alreadyOnShiftIds],
	);

	// Would this shift take this PR's tier AT ALL, ignoring how full it is?
	//
	// The same rule as above, asked at zero staffing on purpose: `shiftBlockedFor`
	// reports `full` before it reports the tier, so a 2/2 shift hides the fact
	// that the tier was never wanted. A shift with unallocated headcount still
	// answers "yes" here, and it should — an unnamed tier legitimately takes a
	// leftover seat at the outlet's own rate.
	const tierUnwantedById = useMemo(() => {
		const map = new Map<string, boolean>();
		for (const s of shifts) {
			map.set(
				s.id,
				shiftBlockedFor({
					shift: s,
					staffed: 0,
					staffedTiers: [],
					prTier: pr.tier,
				})?.kind === "tier-full",
			);
		}
		return map;
	}, [shifts, pr.tier]);

	// The wage each card shows is THIS PR's, resolved by the server off the same
	// rule that seals the shift later (per-shift Post Job override, else the
	// outlet's tier rate). One call for the whole day — the server batches it.
	const { logout } = useAuth();
	const shiftIds = useMemo(() => shifts.map((s) => s.id), [shifts]);
	const wageQuery = useQuery({
		queryKey: ["roster", "wage-preview", pr.id, shiftIds.join(",")],
		queryFn: () => fetchWagePreview(pr.id, shiftIds, logout),
		enabled: shiftIds.length > 0,
		staleTime: 60_000,
	});
	const wageByShift = useMemo(
		() => new Map((wageQuery.data ?? []).map((w) => [w.shiftId, w])),
		[wageQuery.data],
	);

	const [pickId, setPickId] = useState(selectable[0]?.id ?? "");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Default to the first ASSIGNABLE shift, never a greyed-out one — otherwise
	// Schedule PR starts enabled on a row that cannot be written.
	useEffect(() => {
		setPickId((current) =>
			current && selectable.some((s) => s.id === current)
				? current
				: (selectable[0]?.id ?? ""),
		);
	}, [selectable]);

	const picked = selectable.find((s) => s.id === pickId);

	// Closing before the write resolved was indistinguishable from success: a
	// 403, a 409 for a PR already on the shift, or an unreachable API all left
	// the sheet shut and the cell empty with nothing said.
	const confirm = async () => {
		if (busy || !picked) return;
		setBusy(true);
		setError(null);
		try {
			await onAssign(picked.id, pr.id, pr.userId ?? undefined);
			onClose();
		} catch (err) {
			setError(
				toMutationError(err, t.rosterGrid.couldNotAssignPr)?.message ??
					t.rosterGrid.couldNotAssignPr,
			);
			setBusy(false);
		}
	};

	return (
		<IzSheet open onClose={busy ? () => {} : onClose}>
			<div className="iz-sheet-head">
				<div>
					<p className="iz-tiny iz-muted2 uppercase tracking-widest">
						{fill(t.rosterGrid.planningOn, { date: dateIso })}
					</p>
					{/* Same spelling as the row that opened this sheet, and as the
					    voucher that eventually pays the shift — see formatPayeeLabel. */}
					<h3>
						{fill(t.rosterGrid.assignName, {
							name: formatPayeeLabel(pr.nickname, pr.name),
						})}
					</h3>
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

			{shifts.length === 0 ? (
				<p className="iz-tiny iz-muted mt-4 rounded-xl border border-dashed border-[var(--iz-line)] px-4 py-6 text-center">
					{/* No "add a shift" instruction: posting shifts is the OUTLET's
					    job, so telling the agency to do it sends them somewhere they
					    cannot act. */}
					{t.rosterGrid.noShiftsPostedThisDay}
				</p>
			) : (
				<>
					<p className="iz-field-label mt-3">
						{fill(t.rosterGrid.openShiftsCount, { n: shifts.length })}
					</p>
					{busyTimeUnknown && (
						<p className="iz-tiny iz-muted mt-1">
							{t.rosterGrid.busyTimeUnknownAdvice}
						</p>
					)}
					<div className="iz-roster-shift-pick-scroll mt-1.5">
						<div className="iz-roster-shift-pick-list">
							{shifts.map((shift) => {
								const selected = shift.id === pickId;
								const outlet =
									outletNameById.get(shift.outletId) ?? shift.outletId;
								const blocked = blockedById.get(shift.id) ?? null;
								// The PR is not free then. Greys the card exactly as the two
								// shift-side rules do — the agency should not have to pick a
								// shift and press the button to be told.
								const unavailableAt = unavailableById.get(shift.id) ?? null;
								// Already seated here. Greyed rather than hidden, for the
								// reason the full ones are: a card that vanishes is
								// indistinguishable from a shift the venue never posted,
								// and this one is worth seeing — it is where the PR IS.
								const alreadyOn = alreadyOnShiftIds?.has(shift.id) ?? false;
								const off =
									Boolean(blocked) || Boolean(unavailableAt) || alreadyOn;
								const staffed = staffingByShift.get(shift.id)?.staffed ?? 0;
								return (
									<button
										key={shift.id}
										type="button"
										className={cn(
											"iz-roster-shift-pick",
											selected && !off && "on",
											off && "is-blocked",
										)}
										onClick={() => !off && setPickId(shift.id)}
										disabled={busy || off}
										aria-disabled={off}
										title={
											alreadyOn
												? fill(t.rosterGrid.alreadyOnThisShift, {
														name: pr.name,
													})
												: unavailableAt
													? fill(t.rosterGrid.busyElsewhereAt, {
															name: pr.name,
															time: unavailableAt,
														})
													: blocked
														? shiftBlockLong(blocked, t)
														: undefined
										}
									>
										{/* The event picture — the card this shift was posted from (0128). */}
										{shift.templateCoverImage && (
											<img
												className="iz-shift-event-thumb"
												src={apiAssetUrl(shift.templateCoverImage) ?? undefined}
												alt=""
												loading="lazy"
											/>
										)}
										<div className="min-w-0 flex-1 text-left">
											<div className="flex flex-wrap items-center gap-1.5">
												<span className="font-sora text-sm font-bold text-[var(--iz-txt)]">
													{outlet}
												</span>
												<span className="iz-tiny iz-muted">
													{shiftLabel(shift, t)}
												</span>
											</div>
											{/*
												What the shift IS, not just where and when. Four cards
												all reading "Emhub Testing" differ only by a time the
												agency has to squint at; the event is what tells them
												apart. Both facts are already on the row — `event_name`
												and `event_kind` — they were simply never rendered.
												`event_name` is nullable, so an unnamed shift says so
												rather than leaving a gap that reads as a load failure.
											*/}
											<p className="iz-tiny iz-muted2 mt-0.5 truncate">
												{shift.eventName?.trim() || t.rosterGrid.noEventName} ·{" "}
												{shift.eventKind === "special"
													? t.rosterGrid.specialEvent
													: t.rosterGrid.normalShift}
											</p>
											{/*
												WHAT THE VENUE ASKED FOR — the dress code (0132) and the
												languages it would like. The agency is the one choosing
												WHO goes, so this is the only screen where the ask can
												still change the answer; by the time the PR reads it on
												her own card the decision has been made for her.
												Both are optional, and a shift that names neither draws
												no row rather than an empty one.
											*/}
											{/*
												A ROW EACH (owner, 24 Aug 2026). Sharing one truncated
												line meant the dress code always won and the languages
												were cut mid-word — "Languages: Cant…" — so the half the
												agency is meant to act on was the half that never
												survived. Languages WRAPS rather than truncating: a
												venue asking for three of them is asking for all three,
												and an ellipsis hides which.
											*/}
											{shift.dressCode?.trim() && (
												<p className="iz-tiny iz-muted2 mt-0.5 truncate">
													<span className="iz-muted">
														{t.today.dressCodeLabel}
													</span>{" "}
													{dressCodeLabel(shift.dressCode, t)}
												</p>
											)}
											{shift.languages?.trim() && (
												<p className="iz-tiny iz-muted2 mt-0.5 leading-snug">
													<span className="iz-muted">
														{t.today.languagesLabel}
													</span>{" "}
													{/* The STORED string is untouched — it is a
													    comma-joined list the venue posted and the PR
													    profile filter matches on. Only each name's
													    rendered label is resolved, and the separator
													    is kept exactly as stored so the line reads the
													    same length it always did. An unrecognised
													    entry falls through as itself. */}
													{shift.languages
														.split(",")
														.map((lang) => languageLabel(lang.trim(), t))
														.filter(Boolean)
														.join(", ")}
												</p>
											)}
											<p
												className={cn(
													"iz-tiny mt-1",
													off ? "iz-muted2" : "text-[var(--iz-gold-l)]",
												)}
											>
												{/* Says only that the PR is unavailable — never that
												    there is other work on, which would name a rival by
												    elimination. Same word the grid behind uses. */}
												{/* FIRST, because it is the most specific answer and
												    the only one that is about this PR by name rather
												    than about the shift. */}
												{alreadyOn
													? t.rosterGrid.alreadyOnShiftShort
													: unavailableAt
														? `${t.rosterGrid.unavailableAtTime} · ${unavailableAt}`
														: blocked
															? shiftBlockShort(blocked, t)
															: fill(t.rosterGrid.openCount, {
																	n: shift.quantity - staffed,
																})}{" "}
												·{" "}
												{/* NOT `shift.payPerHour`: that is the shift's own
												    figure and does not move when you pick a different
												    PR, so every tier read the same wage here and only
												    the sealed voucher disagreed. This is the server's
												    answer for THIS PR's tier. */}
												<span
													className={cn(
														// Amber flags a CONFIG fault (a tier the outlet never
														// costed). "Not on this shift" is an ordinary answer,
														// so it must not borrow the warning colour.
														!tierUnwantedById.get(shift.id) &&
															wageByShift.get(shift.id)?.kind === "unpriced" &&
															"text-[var(--iz-amber)]",
													)}
												>
													{wageLabel(
														wageByShift.get(shift.id),
														wageQuery.isLoading,
														tierUnwantedById.get(shift.id) ?? false,
														pr.tier,
														t,
													)}
												</span>
											</p>
										</div>
										<span className="iz-tiny iz-muted2 shrink-0 text-right leading-tight">
											{staffed}/{shift.quantity}
										</span>
									</button>
								);
							})}
						</div>
					</div>

					{error && (
						<p className="iz-tiny mt-3 text-[var(--iz-danger,#dc2626)]">
							{error}
						</p>
					)}

					{/* THE TIER CHECK COULD NOT RUN ON THIS SHIFT — said out loud rather
					    than assumed away.

					    Every greyed card above is a promise that the ones left are
					    assignable, and that promise rests on knowing which tier each
					    taken seat consumed. When the server's split does not account for
					    a cross-agency seat, the anonymous seats fall into the "tiers the
					    shift never named" bucket, the named quotas read fully open, and
					    the sheet goes on greying rows out with exactly the confidence it
					    has when it really knows. Nothing is refused on it — the server
					    is the authority and will 409 — but "we could not check" and "we
					    checked and it is fine" must not look identical. */}
					{(staffingByShift.get(picked?.id ?? "")?.unknown ?? 0) > 0 && (
						<p className="iz-tiny iz-muted2 mt-3 leading-snug">
							{fill(t.rosterGrid.tierSplitUnavailable, {
								n: staffingByShift.get(picked?.id ?? "")?.unknown ?? 0,
							})}
						</p>
					)}

					{/* Every shift on the day exists but none can take this PR. Said
					    plainly, because a disabled button over a list of visible cards
					    otherwise reads as a broken screen. */}
					{selectable.length === 0 && (
						<p className="iz-tiny iz-muted2 mt-3 leading-snug">
							{/*
								WHICH RULE REFUSED — read, not guessed at.

								This sentence said "already staffed, raise a headcount" for every
								refusal there is. On a 2/6 shift that is false, and it names a
								remedy that cannot work: raising the headcount adds UNALLOCATED
								seats, it does not open a Tier I seat. The agency is sent to argue
								with the wrong number.

								`shiftBlockedFor` already separates the two — it reports `full`
								before `tier-full` — so the reason only had to be read.
							*/}
							{shifts.length > 0 &&
							shifts.every(
								(s) =>
									blockedById.get(s.id)?.kind === "tier-full" ||
									unavailableById.get(s.id),
							)
								? fill(t.rosterGrid.everyShiftTierFull, {
										name: formatPayeeLabel(pr.nickname, pr.name),
										tier: tierLabel(pr.tier),
									})
								: fill(t.rosterGrid.everyShiftStaffedFor, {
										name: formatPayeeLabel(pr.nickname, pr.name),
									})}
						</p>
					)}

					<button
						type="button"
						className="iz-btn iz-btn-primary mt-4 w-full"
						disabled={busy || !picked}
						onClick={confirm}
					>
						{busy ? t.rosterGrid.assigning : t.rosterGrid.schedulePr}
					</button>
				</>
			)}
		</IzSheet>
	);
}
