import { windowMinutes } from "@agency-portal/lib/shift-slot-clash";
import { hasShiftEnded } from "@agency-portal/lib/shift-window";
import {
	cannotReach,
	type OccupiedWindow,
	type VenuePin,
} from "@agency-portal/lib/travel-gap";
import type { PrPersonnel } from "@/services/pr-personnel";
import type { Shift, ShiftPayTierDemand } from "@/services/shift";
import type {
	ShiftAssignment,
	ShiftAssignmentStatus,
} from "@/services/shift-assignment";

/**
 * Assignment statuses that leave the slot open again — mirrors the backend's
 * NON_STAFFING_STATUSES (shift-assignment.repository.ts). A cancelled, no-show
 * or leave-approved PR is not staffing the shift, so the slot is fillable.
 */
const NON_STAFFING_STATUSES: readonly ShiftAssignmentStatus[] = [
	"cancelled",
	"no_show",
	"leave_approved",
];

/**
 * Shift statuses an agency may staff. Drafts are not published yet and sealed
 * shifts are closed for payroll, so neither takes new PRs.
 *
 * ⚠️ EXPORTED because this is the client's half of a rule the SERVER owns
 * (`ASSIGNABLE_SHIFT_STATUSES` in `shift.model.ts`), and every screen that offers
 * a shift has to mirror the same list. The manual assign dialog had written its
 * own version of this — "anything except sealed" — so it offered drafts this
 * planner would never touch, and the two screens disagreed about the same shift.
 */
export const ASSIGNABLE_SHIFT_STATUSES: readonly Shift["status"][] = [
	"open",
	"confirmed",
];

/**
 * Rank order of the backend `pr_tier` enum, best first. Tiers outside the enum
 * (or a null tier) sort last rather than being dropped, so an odd row never
 * silently disappears from the plan.
 */
const TIER_RANK: Readonly<Record<string, number>> = {
	tier_1: 0,
	tier_2: 1,
	tier_3: 2,
	tier_4: 3,
	tier_5: 4,
	servant: 5,
	commission_only: 6,
};
const UNRANKED_TIER = 99;

function tierRank(tier: string | null): number {
	return tier ? (TIER_RANK[tier] ?? UNRANKED_TIER) : UNRANKED_TIER;
}

/**
 * `pr.tier` -> the outlet tier-rate LABEL a shift's demand rows are keyed by.
 * Deliberate mirror of the backend leaf `features/shift-assignment/tier-demand.ts`
 * — if these two drift, the planner starts proposing pairings the API refuses,
 * which is the exact failure this filtering exists to prevent.
 *
 * Commission-only has NO label on purpose: it is identified by `kind`, both here
 * and on the server.
 */
const PR_TIER_TO_OUTLET_LABEL: Readonly<Record<string, string>> = {
	tier_1: "Tier I",
	tier_2: "Tier II",
	tier_3: "Tier III",
	tier_4: "Tier IV",
	tier_5: "Tier V",
	servant: "Servant",
};
const COMMISSION_ONLY_BUCKET = "commission_only";

/**
 * Which demand bucket a PR counts against; null = a tier the shift never named.
 *
 * A PR's raw membership tier (`'tier_1'`) as the OUTLET BUCKET it fills (`'Tier I'`).
 *
 * Exported because every count of "which seats are taken" must speak the same
 * vocabulary as the demand: `shift_pay_tier.tier` and the server's
 * `staffedBuckets` are both outlet labels, while `agency_pr.tier` is the raw
 * enum. Comparing the two directly matches nothing, silently — no error, no
 * zero, just a tier that never fills up.
 */
export function bucketForPrTier(tier: string | null): string | null {
	if (!tier) return null;
	if (tier === COMMISSION_ONLY_BUCKET) return COMMISSION_ONLY_BUCKET;
	return PR_TIER_TO_OUTLET_LABEL[tier] ?? null;
}

function bucketForDemandRow(row: ShiftPayTierDemand): string | null {
	return row.kind === COMMISSION_ONLY_BUCKET
		? COMMISSION_ONLY_BUCKET
		: row.tier;
}

/** A shift still short of its `quantity` headcount. */
export interface OpenShift {
	shiftId: string;
	outletId: string;
	outletName: string;
	shiftDate: string;
	slot: string | null;
	eventName: string | null;
	openSlots: number;
	/** Seats left per named tier. Empty with `capped: false` = no mix declared. */
	remainingByBucket: Map<string, number>;
	/** Seats left for tiers the shift did NOT name. */
	remainingUnnamed: number;
	capped: boolean;
}

/** One proposed PR → shift assignment, pending the agency's confirmation. */
export interface AutoAssignPair {
	shiftId: string;
	prId: string;
	userId?: string | null;
	prName: string;
	prTier: string | null;
	outletName: string;
	shiftDate: string;
	slot: string | null;
	eventName: string | null;
	/** Shifts the PR already holds this payroll week, before this plan. */
	shiftsThisWeek: number;
	/**
	 * The venue named this PR on this shift (0131) — the pair the owner wants
	 * surfaced first: "the pr of the day waiting for agency to approve".
	 */
	requestedByVenue?: boolean;
}

export interface AutoAssignPlan {
	pairs: AutoAssignPair[];
	/** Open slots across the target dates, before the plan is applied. */
	openSlotCount: number;
	/** Active PRs free on at least one target date. */
	freePrCount: number;
	/** Open slots the plan cannot cover — more slots than free PRs. */
	unfilledCount: number;
	/**
	 * Open slots no free PR can take because their TIER is spoken for.
	 *
	 * Split out from `unfilledCount` because the two have opposite remedies and
	 * the card conflated them: it read "N open slots — no free PRs, everyone is
	 * booked or inactive" at a venue with ten idle Tier IIIs, simply because the
	 * shift had asked for Tier I. "Nobody is free" is fixed by freeing somebody;
	 * "the free PRs are the wrong tier" is fixed by editing the shift's mix, and
	 * telling an agency the first when it is the second sends them hunting for
	 * staff they already have.
	 */
	tierBlockedCount: number;
}

export const EMPTY_AUTO_ASSIGN_PLAN: AutoAssignPlan = {
	pairs: [],
	openSlotCount: 0,
	freePrCount: 0,
	unfilledCount: 0,
	tierBlockedCount: 0,
};

/** PR display name: working nickname when set, else legal name (backend rule). */
function prDisplayName(pr: PrPersonnel): string {
	return pr.nickname?.trim() || pr.name;
}

/**
 * Requested headcount per tier bucket, and the total across them.
 *
 * MIRRORS the backend's `askedByBucket` in `tier-demand.ts`, including the rule
 * that a row asking for ZERO is a price and not a quota: the composer lets a
 * venue set a tier's rates while requesting none of that tier, and those rows are
 * persisted so the rate survives. A zero row must never reach `asked` — having
 * the key at all is what marks a tier as NAMED, and a named tier wanting 0 reads
 * as full before anyone is on it, so nobody of that tier could be assigned.
 *
 * Shared by the planner and `shiftBlockedFor` because those two disagreeing about
 * one shift is precisely how the grid comes to offer a pairing the API refuses.
 */
function askedByBucket(payTiers: ShiftPayTierDemand[] | undefined): {
	asked: Map<string, number>;
	totalAsked: number;
} {
	const asked = new Map<string, number>();
	let totalAsked = 0;
	for (const row of payTiers ?? []) {
		if (row.prCount <= 0) continue;
		const bucket = bucketForDemandRow(row);
		if (!bucket) continue;
		asked.set(bucket, (asked.get(bucket) ?? 0) + row.prCount);
		totalAsked += row.prCount;
	}
	return { asked, totalAsked };
}

/**
 * Folds the server's cross-agency occupancy into the seats WE counted ourselves.
 *
 * `GET /shift-assignment` is scoped to the caller's agency — correctly, one
 * agency must never read another's roster — so `ourBuckets` is only this
 * agency's contribution. `GET /shift` therefore also ships `staffedCount` (the
 * total across every agency) and `staffedBuckets` (that total split by tier).
 *
 * Both REPLACE our figures rather than adding to them: the server's numbers
 * already include the rows we just counted, so adding would double-count every
 * seat we filled ourselves and make a shift we staffed look overfull.
 *
 * The bucket LIST keeps ours and is topped up with the other agency's seats as
 * anonymous entries — the quota must learn that a Tier I seat is gone, and must
 * NOT learn who took it. Seats the buckets cannot account for (an untiered PR, or
 * a backend that sent no buckets at all) are padded with `null`, because a seat
 * we cannot name is still a seat nobody else can have.
 *
 * Same merge as `staffingByShift` in RosterBackendTimetable.tsx, kept as one
 * function because those two disagreeing about one shift is exactly how the grid
 * comes to offer a pairing the API refuses.
 */
/**
 * ⚠️ EXPORTED because three places need it and three copies of one merge is how
 * the tier bug happened in the first place — an agency's own seats were pushed
 * in the raw `tier_1` vocabulary in one copy and the outlet-label vocabulary in
 * another, so the agency that supplied a PR could double-book its own tier while
 * every other agency saw the cap work. The planner, the roster timetable and the
 * manual assign dialog must answer "how full is this shift, per tier" with one
 * function or they will drift again.
 */
export function mergeCrossAgencyStaffing(
	shift: Shift,
	ourBuckets: (string | null)[],
): { staffed: number; buckets: (string | null)[]; unknownBuckets: number } {
	// Field absent (older backend, or a response cached before it existed): degrade
	// to what we counted rather than to zero, which would read as an empty shift.
	// Nothing is UNKNOWN here — we are not claiming to know about anyone else's
	// seats, because we are not counting any.
	if (shift.staffedCount === undefined) {
		return {
			staffed: ourBuckets.length,
			buckets: ourBuckets,
			unknownBuckets: 0,
		};
	}
	const theirs = Math.max(0, shift.staffedCount - ourBuckets.length);
	const theirBuckets: (string | null)[] = [];
	for (const [bucket, count] of Object.entries(shift.staffedBuckets ?? {})) {
		// Subtract the ones already in our own list — the server counted those too.
		const ours = ourBuckets.filter((b) => b === bucket).length;
		for (let i = 0; i < Math.max(0, count - ours); i += 1) {
			theirBuckets.push(bucket);
		}
	}
	// HOW MANY SEATS WE CANNOT NAME A TIER FOR — the count, not just the padding.
	//
	// This is the one number that says whether the tier half of the cap is worth
	// anything on this shift. `staffedBuckets` going missing (an older backend, a
	// stale cache, a server that stops sending the split) does not fail loudly: the
	// total still arrives, every seat gets padded with an anonymous `null`, and each
	// null lands in the "tiers the shift never named" bucket instead of the tier it
	// really took. The named quotas then read fully open and the screen offers a
	// Tier I seat another agency has already filled — the exact promise-then-409
	// this module exists to prevent, now with the cap silently switched off.
	//
	// It is NOT the same as a `null` in `ourBuckets`: that PR is genuinely untiered,
	// which is a fact, and the unnamed leftover is precisely where they belong. Only
	// a seat we know is taken but cannot attribute is unknown.
	const unknownBuckets = Math.max(0, theirs - theirBuckets.length);
	while (theirBuckets.length < theirs) theirBuckets.push(null);
	return {
		staffed: shift.staffedCount,
		buckets: [...ourBuckets, ...theirBuckets.slice(0, theirs)],
		unknownBuckets,
	};
}

/**
 * Open slots per shift = `quantity` minus the assignments still staffing it.
 * Shifts outside `targetDates`, unpublished/sealed shifts, and fully staffed
 * shifts are excluded.
 */
export function findOpenShifts(params: {
	shifts: Shift[];
	assignments: ShiftAssignment[];
	outletNameById: Map<string, string>;
	targetDates: readonly string[];
	/** PR tier by id — needed to know which BUCKET each staffed seat consumed. */
	tierByPrId?: Map<string, string | null>;
	/**
	 * The clock, injected rather than read, so this stays a pure function a test
	 * can pin to a fixed instant. Defaults to now for the app.
	 */
	now?: Date;
}): OpenShift[] {
	const {
		shifts,
		assignments,
		outletNameById,
		targetDates,
		tierByPrId,
		now = new Date(),
	} = params;
	const dates = new Set(targetDates);

	const staffedByShift = new Map<string, number>();
	const staffedBucketsByShift = new Map<string, (string | null)[]>();
	for (const a of assignments) {
		if (NON_STAFFING_STATUSES.includes(a.status)) continue;
		staffedByShift.set(a.shiftId, (staffedByShift.get(a.shiftId) ?? 0) + 1);
		staffedBucketsByShift.set(a.shiftId, [
			...(staffedBucketsByShift.get(a.shiftId) ?? []),
			bucketForPrTier(tierByPrId?.get(a.prId) ?? null),
		]);
	}
	// CROSS-AGENCY OCCUPANCY, TOTAL **AND** PER TIER. Applied after the loop so it
	// overwrites our own count instead of adding to it — see mergeCrossAgencyStaffing.
	//
	// The total alone was not enough: with the buckets left un-merged, every NAMED
	// tier on a shared shift read fully open to any agency that did not supply the
	// existing assignment, so the planner proposed a Tier I for a Tier I seat another
	// agency had already filled and each proposal 409'd at Confirm with no
	// explanation the user could act on. The headcount capped; the mix did not.
	for (const s of shifts) {
		const merged = mergeCrossAgencyStaffing(
			s,
			staffedBucketsByShift.get(s.id) ?? [],
		);
		staffedByShift.set(s.id, merged.staffed);
		staffedBucketsByShift.set(s.id, merged.buckets);
	}

	return (
		shifts
			.filter(
				(s) =>
					dates.has(s.shiftDate) &&
					ASSIGNABLE_SHIFT_STATUSES.includes(s.status) &&
					// A SHIFT THAT HAS ALREADY FINISHED IS NOT AN OPEN SLOT.
					//
					// Without this the banner went on advertising "1 PR for 1 open
					// slot · Sat, 22 Aug" at 16:56 for a shift that ran 14:10–15:00,
					// while the assign sheet beside it had dropped the same shift and
					// said "No shifts posted for this day". Two surfaces on one screen
					// disagreeing about whether work exists, and the one that was
					// wrong was the one inviting the agency to act.
					//
					// `hasShiftEnded` FAILS OPEN — an unparseable slot ("Late night")
					// returns false and the shift stays offered. That is deliberate and
					// matches the rest of the system: a window we cannot read must not
					// silently vanish from the picker.
					!hasShiftEnded(s.shiftDate, s.slot, now),
			)
			.map((s) => {
				// Mirrors the backend's `remainingByBucket`. A shift with no demand
				// rows (or rows summing to zero) is UNCAPPED — every pre-composer
				// shift is that shape, and capping them would strand the roster.
				const { asked, totalAsked } = askedByBucket(s.payTiers);
				const staffedBuckets = staffedBucketsByShift.get(s.id) ?? [];
				const remainingByBucket = new Map<string, number>();
				for (const [bucket, want] of asked) {
					remainingByBucket.set(
						bucket,
						Math.max(
							0,
							want - staffedBuckets.filter((b) => b === bucket).length,
						),
					);
				}
				const unnamedStaffed = staffedBuckets.filter(
					(b) => !b || !asked.has(b),
				).length;
				return {
					shiftId: s.id,
					outletId: s.outletId,
					outletName: outletNameById.get(s.outletId) ?? "Unknown outlet",
					shiftDate: s.shiftDate,
					slot: s.slot,
					eventName: s.eventName,
					openSlots: s.quantity - (staffedByShift.get(s.id) ?? 0),
					remainingByBucket,
					remainingUnnamed:
						totalAsked === 0
							? Math.max(0, s.quantity)
							: Math.max(0, s.quantity - totalAsked - unnamedStaffed),
					capped: totalAsked > 0,
				};
			})
			.filter((s) => s.openSlots > 0)
			// Listing order only — the fill rotation below deliberately does NOT
			// follow it, so no outlet gains priority from where its name sorts.
			.sort(
				(a, b) =>
					a.shiftDate.localeCompare(b.shiftDate) ||
					a.outletName.localeCompare(b.outletName),
			)
	);
}

/**
 * Proposes PR → open-shift pairings for `targetDates`, most suitable first.
 *
 * Suitability, per the agency's rule: active PRs only, never one already
 * working that date, ranked by tier (Tier I first) then by who holds the fewest
 * shifts that payroll week, so the work spreads instead of always landing on
 * the same few names. Nothing is written — the caller confirms the plan.
 *
 * No outlet is preferred: slots are filled by rotating across the outlets that
 * still need staff, so a scarce night thins every outlet equally rather than
 * fully staffing one and starving another.
 *
 * `weekShifts`/`weekAssignments` cover the whole payroll week (that is what the
 * fairness tie-break counts); `targetDates` narrows which dates get filled, so
 * widening the card from today to the full week is a change of that list alone.
 */
export function buildAutoAssignPlan(params: {
	weekShifts: Shift[];
	weekAssignments: ShiftAssignment[];
	prs: PrPersonnel[];
	outletNameById: Map<string, string>;
	targetDates: readonly string[];
	/**
	 * `prId -> Set<'YYYY-MM-DD'>` the PR marked unavailable on their own
	 * schedule. Optional so a caller that has not loaded it plans as before
	 * rather than crashing — but the planner is then proposing shifts the
	 * server will refuse, so every real caller passes it.
	 */
	blockedDatesByPr?: Map<string, Set<string>>;
	/**
	 * Per shift, the user ids the VENUE asked for by name (0131) — already
	 * agency-scoped by the server, so every id in here is this agency's to
	 * act on. Requested PRs are picked FIRST for their requesting shift.
	 */
	requestedPrIdsByShift?: ReadonlyMap<string, ReadonlySet<string>>;
	/**
	 * `outletId -> map pin`. Without it the planner cannot ask whether a PR could
	 * physically get from one venue to the next, and plans exactly as it did
	 * before — proposals the server will merely warn about, after the agency has
	 * confirmed them.
	 */
	outletPinById?: ReadonlyMap<string, VenuePin>;
}): AutoAssignPlan {
	const {
		weekShifts,
		weekAssignments,
		prs,
		outletNameById,
		targetDates,
		blockedDatesByPr,
		outletPinById,
	} = params;

	const openShifts = findOpenShifts({
		shifts: weekShifts,
		assignments: weekAssignments,
		outletNameById,
		targetDates,
		tierByPrId: new Map(prs.map((p) => [p.id, p.tier])),
	});
	const openSlotCount = openShifts.reduce((sum, s) => sum + s.openSlots, 0);

	// A PR is busy on a date if they hold a staffing assignment on a shift that
	// day; the same pass counts the week's shifts per PR for the tie-break.
	const shiftDateById = new Map(weekShifts.map((s) => [s.id, s.shiftDate]));
	const busyDatesByPr = new Map<string, Set<string>>();
	const weekCountByPr = new Map<string, number>();
	for (const a of weekAssignments) {
		if (NON_STAFFING_STATUSES.includes(a.status)) continue;
		const date = shiftDateById.get(a.shiftId) ?? a.shiftDate;
		if (!date) continue;
		const dates = busyDatesByPr.get(a.prId) ?? new Set<string>();
		dates.add(date);
		busyDatesByPr.set(a.prId, dates);
		weekCountByPr.set(a.prId, (weekCountByPr.get(a.prId) ?? 0) + 1);
	}

	// A day the PR blocked counts as busy for planning: the question every use
	// of `busyDatesByPr` below asks is "can this PR take a shift that date", and
	// the answer is no either way. Folded in here rather than added as a fourth
	// filter so the three consumers — the free-PR count, the pick, and the
	// anyFreeToday test that decides whether a shortfall is people or tier mix —
	// cannot drift apart. They did not all learn about tiers at the same time
	// once already.
	//
	// NOT counted into `weekCountByPr`: that drives the fairness tie-break, and
	// a PR who blocked Saturday has not worked a shift. Charging them one would
	// push them DOWN the queue for the days they are in fact available.
	if (blockedDatesByPr) {
		for (const [prId, dates] of blockedDatesByPr) {
			if (dates.size === 0) continue;
			const busy = busyDatesByPr.get(prId) ?? new Set<string>();
			for (const d of dates) busy.add(d);
			busyDatesByPr.set(prId, busy);
		}
	}

	// WHERE EACH PR ALREADY IS, on one continuous timeline.
	//
	// The date filter below already stops a PR taking two shifts on one DATE, so
	// what is left — and what nothing checked — is the seam between adjacent dates:
	// an overnight 22:00–04:00 at one venue and an 05:00 start at another are two
	// different `shiftDate`s and read as two free days.
	const shiftRowById = new Map(weekShifts.map((s) => [s.id, s]));
	const occupiedByPr = new Map<string, OccupiedWindow[]>();
	if (outletPinById) {
		for (const a of weekAssignments) {
			if (NON_STAFFING_STATUSES.includes(a.status)) continue;
			const row = shiftRowById.get(a.shiftId);
			if (!row) continue;
			const w = windowMinutes({
				dateIso: row.shiftDate,
				shift: row.slot ?? "",
			});
			if (!w) continue;
			occupiedByPr.set(a.prId, [
				...(occupiedByPr.get(a.prId) ?? []),
				{ outletId: row.outletId, start: w.start, end: w.end },
			]);
		}
	}

	/**
	 * True when this PR could not get to `target` in time.
	 *
	 * Fails OPEN at every unknown — no pins passed, no pin for either venue, an
	 * unparseable slot. A planner that refused to roster anyone because an outlet
	 * has no coordinates would turn one missing pin into an empty night.
	 */
	const travelBlocked = (prId: string, target: OpenShift): boolean => {
		if (!outletPinById) return false;
		const pin = outletPinById.get(target.outletId);
		if (!pin) return false;
		const w = windowMinutes({
			dateIso: target.shiftDate,
			shift: target.slot ?? "",
		});
		if (!w) return false;
		return cannotReach({
			shift: { ...pin, start: w.start, end: w.end },
			pinById: outletPinById,
			occupied: occupiedByPr.get(prId) ?? [],
		});
	};

	const activePrs = prs.filter((p) => p.status === "active");
	const freePrCount = activePrs.filter((p) =>
		targetDates.some((d) => !busyDatesByPr.get(p.id)?.has(d)),
	).length;

	// Fill one PR at a time, rotating across outlets: each turn goes to the
	// outlet that has been given the fewest PRs so far, so every outlet is
	// staffed once before any outlet is staffed twice. No outlet is ever
	// prioritised by name or by identity — when free PRs run short, the
	// shortfall is spread across outlets instead of emptying the last one.
	// Dates are still worked in calendar order.
	const plannedByPr = new Map<string, number>();
	const pairs: AutoAssignPair[] = [];
	let tierBlockedCount = 0;
	const dates = [...new Set(openShifts.map((s) => s.shiftDate))].sort();

	for (const date of dates) {
		const dayShifts = openShifts.filter((s) => s.shiftDate === date);
		const remainingByShift = new Map(
			dayShifts.map((s) => [s.shiftId, s.openSlots]),
		);
		// Mutable copies — the plan spends these as it fills, so two proposals
		// cannot both claim the last Tier I seat on one shift.
		const seatsLeft = new Map(
			dayShifts.map((s) => [
				s.shiftId,
				{
					byBucket: new Map(s.remainingByBucket),
					unnamed: s.remainingUnnamed,
					capped: s.capped,
				},
			]),
		);
		const assignedByOutlet = new Map<string, number>();
		const takenToday = new Set<string>();
		const daySlotCount = dayShifts.reduce((sum, s) => sum + s.openSlots, 0);

		// At most one iteration per open slot that day.
		for (let filled = 0; filled < daySlotCount; filled += 1) {
			const stillOpen = dayShifts.filter(
				(s) => (remainingByShift.get(s.shiftId) ?? 0) > 0,
			);
			if (stillOpen.length === 0) break;

			// Whose turn: the outlet with the fewest PRs from this run, then the
			// one still shortest of staff. Names only break a dead tie, so the
			// ordering stays deterministic without favouring anyone.
			const needByOutlet = new Map<string, number>();
			for (const s of stillOpen) {
				needByOutlet.set(
					s.outletId,
					(needByOutlet.get(s.outletId) ?? 0) +
						(remainingByShift.get(s.shiftId) ?? 0),
				);
			}
			const target = [...stillOpen].sort(
				(a, b) =>
					(assignedByOutlet.get(a.outletId) ?? 0) -
						(assignedByOutlet.get(b.outletId) ?? 0) ||
					(needByOutlet.get(b.outletId) ?? 0) -
						(needByOutlet.get(a.outletId) ?? 0) ||
					a.outletName.localeCompare(b.outletName) ||
					(remainingByShift.get(b.shiftId) ?? 0) -
						(remainingByShift.get(a.shiftId) ?? 0) ||
					a.shiftId.localeCompare(b.shiftId),
			)[0];

			const load = (id: string) =>
				(weekCountByPr.get(id) ?? 0) + (plannedByPr.get(id) ?? 0);
			// Only tiers the target shift still has a seat for. Filtering, not just
			// ranking: the API refuses an over-quota tier with a 409, so proposing
			// one would surface as a mystery failure at Confirm, one pair at a time.
			const seats = seatsLeft.get(target.shiftId);
			const fitsTarget = (tier: string | null) => {
				if (!seats?.capped) return true;
				const bucket = bucketForPrTier(tier);
				return bucket && seats.byBucket.has(bucket)
					? (seats.byBucket.get(bucket) ?? 0) > 0
					: seats.unnamed > 0;
			};
			// The venue named these people for THIS shift — they outrank every
			// generic ranking term below, because the ask is the whole point of
			// the request lane. Matched on either id column (0089: pr.id IS the
			// user id, userId preferred when present).
			const requestedHere = params.requestedPrIdsByShift?.get(target.shiftId);
			const isRequested = (p: PrPersonnel) =>
				!!requestedHere &&
				(requestedHere.has(p.userId ?? p.id) || requestedHere.has(p.id));
			const pick = activePrs
				.filter(
					(p) =>
						!takenToday.has(p.id) &&
						!busyDatesByPr.get(p.id)?.has(date) &&
						fitsTarget(p.tier) &&
						// Choosing someone who cannot make the trip when someone else can
						// is simply a worse plan. If nobody else is free the seat stays
						// open and is reported as a shortage — which the agency can still
						// fill by hand, and be warned about at that moment.
						!travelBlocked(p.id, target),
				)
				.sort(
					(a, b) =>
						Number(isRequested(b)) - Number(isRequested(a)) ||
						tierRank(a.tier) - tierRank(b.tier) ||
						load(a.id) - load(b.id) ||
						prDisplayName(a).localeCompare(prDisplayName(b)),
				)[0];
			// No PR fits this outlet's remaining mix. `continue`, not `break`: the
			// NEXT rotation turn goes to a different outlet, which may still have a
			// tier this PR pool can fill. Breaking here would abandon the whole
			// night because one venue ran out of Tier Is.
			if (!pick) {
				const exhausted = remainingByShift.get(target.shiftId) ?? 0;
				remainingByShift.set(target.shiftId, 0);
				if (exhausted === 0) break;
				// Those seats are open but unreachable. Counted separately from a
				// plain shortage of people: if any PR is free today and still none
				// fits, what blocks the seat is the tier mix, not the headcount.
				// The agency needs to hear the difference — one is solved by finding
				// staff, the other by editing the shift.
				const anyFreeToday = activePrs.some(
					(p) => !takenToday.has(p.id) && !busyDatesByPr.get(p.id)?.has(date),
				);
				if (anyFreeToday) tierBlockedCount += exhausted;
				continue;
			}

			// Spend the seat so the rest of this run sees it taken.
			if (seats?.capped) {
				const bucket = bucketForPrTier(pick.tier);
				if (bucket && seats.byBucket.has(bucket)) {
					seats.byBucket.set(bucket, (seats.byBucket.get(bucket) ?? 0) - 1);
				} else {
					seats.unnamed -= 1;
				}
			}

			takenToday.add(pick.id);
			plannedByPr.set(pick.id, (plannedByPr.get(pick.id) ?? 0) + 1);
			assignedByOutlet.set(
				target.outletId,
				(assignedByOutlet.get(target.outletId) ?? 0) + 1,
			);
			remainingByShift.set(
				target.shiftId,
				(remainingByShift.get(target.shiftId) ?? 0) - 1,
			);
			pairs.push({
				shiftId: target.shiftId,
				prId: pick.id,
				userId: pick.userId,
				prName: prDisplayName(pick),
				prTier: pick.tier,
				outletName: target.outletName,
				shiftDate: date,
				slot: target.slot,
				eventName: target.eventName,
				shiftsThisWeek: weekCountByPr.get(pick.id) ?? 0,
				requestedByVenue: isRequested(pick),
			});
		}
	}

	return {
		pairs,
		openSlotCount,
		freePrCount,
		unfilledCount: openSlotCount - pairs.length,
		tierBlockedCount,
	};
}

/** Why a proposed pair was dropped at confirm time. */
export type DropReason =
	| "shift-gone"
	| "shift-full"
	| "pr-busy"
	| "tier-full"
	| "travel-tight";

export interface ValidatedPairs {
	valid: AutoAssignPair[];
	dropped: { pair: AutoAssignPair; reason: DropReason }[];
}

export function dropReasonLabel(reason: DropReason): string {
	switch (reason) {
		case "shift-gone":
			return "shift no longer open";
		case "shift-full":
			return "shift already fully staffed";
		case "pr-busy":
			return "PR booked elsewhere";
		case "tier-full":
			return "that tier is already full on this shift";
		case "travel-tight":
			return "not enough time to travel from their other shift";
	}
}

/**
 * Re-checks a plan against freshly fetched rows, immediately before writing.
 *
 * The plan is built from cached queries, so a seat can be taken from the roster
 * (or by another agency user) while the preview sheet sits open. The server DOES
 * refuse an overstaffed shift, an over-quota tier and a clashing PR — but one row
 * at a time, as a 409 per pair, which reaches the user as a count of failures
 * rather than as a plan. This pass turns those into reasons BEFORE anything is
 * written, so the agency reads "that tier is already full" instead of watching
 * four assignments fail.
 *
 * Checks the same two rules the API checks, in the same order: total headcount,
 * then the tier mix. The tier half needs `tierByPrId` to know which BUCKET each
 * staffed seat consumed; without it the mix is skipped and only headcount binds
 * — which is what this function did for its whole life, and why a stale plan
 * could still send a pair straight into a `TierFullError`.
 */
export function validateAutoAssignPairs(params: {
	pairs: readonly AutoAssignPair[];
	shifts: Shift[];
	assignments: ShiftAssignment[];
	/** PR tier by id. Omit and the tier mix is not re-checked. */
	tierByPrId?: Map<string, string | null>;
	/**
	 * Venue pins. Omit and travel is not re-checked — which is the honest default,
	 * but every real caller passes them: the PLAN may have been built in the moment
	 * before the outlets query resolved, when the planner had no pins and could
	 * only fail open. This pass is the last chance to catch that.
	 */
	outletPinById?: ReadonlyMap<string, VenuePin>;
}): ValidatedPairs {
	const { pairs, shifts, assignments, tierByPrId, outletPinById } = params;

	const shiftById = new Map(shifts.map((s) => [s.id, s]));
	// Where each PR already is, from the FRESH rows — the same timeline the planner
	// builds, rebuilt here because a seat can be taken while the sheet sits open.
	const occupiedByPr = new Map<string, OccupiedWindow[]>();
	if (outletPinById) {
		for (const a of assignments) {
			if (NON_STAFFING_STATUSES.includes(a.status)) continue;
			const row = shiftById.get(a.shiftId);
			if (!row) continue;
			const w = windowMinutes({
				dateIso: row.shiftDate,
				shift: row.slot ?? "",
			});
			if (!w) continue;
			occupiedByPr.set(a.prId, [
				...(occupiedByPr.get(a.prId) ?? []),
				{ outletId: row.outletId, start: w.start, end: w.end },
			]);
		}
	}
	// Seeded from the shift AFTER the loop below — see the note in `findOpenShifts`.
	const staffedByShift = new Map<string, number>();
	const staffedBucketsByShift = new Map<string, (string | null)[]>();
	const busyDatesByPr = new Map<string, Set<string>>();
	for (const a of assignments) {
		if (NON_STAFFING_STATUSES.includes(a.status)) continue;
		staffedByShift.set(a.shiftId, (staffedByShift.get(a.shiftId) ?? 0) + 1);
		staffedBucketsByShift.set(a.shiftId, [
			...(staffedBucketsByShift.get(a.shiftId) ?? []),
			bucketForPrTier(tierByPrId?.get(a.prId) ?? null),
		]);
		const date = shiftById.get(a.shiftId)?.shiftDate ?? a.shiftDate;
		if (!date) continue;
		const dates = busyDatesByPr.get(a.prId) ?? new Set<string>();
		dates.add(date);
		busyDatesByPr.set(a.prId, dates);
	}
	// The server's cross-agency figures win here too — the total AND the buckets.
	// This is the last gate before the write, so it is where a shared shift filling
	// up should surface as a "shift-full" or "tier-full" drop the agency can read,
	// not as a 409 that looks like a fault. Merging only the total left the mix half
	// blind: the batch dropped nothing, and `TierFullError` came back per pair.
	for (const s of shifts) {
		const merged = mergeCrossAgencyStaffing(
			s,
			staffedBucketsByShift.get(s.id) ?? [],
		);
		staffedByShift.set(s.id, merged.staffed);
		staffedBucketsByShift.set(s.id, merged.buckets);
	}

	const valid: AutoAssignPair[] = [];
	const dropped: { pair: AutoAssignPair; reason: DropReason }[] = [];

	for (const pair of pairs) {
		const shift = shiftById.get(pair.shiftId);
		if (!shift || !ASSIGNABLE_SHIFT_STATUSES.includes(shift.status)) {
			dropped.push({ pair, reason: "shift-gone" });
			continue;
		}
		if (shift.quantity - (staffedByShift.get(shift.id) ?? 0) <= 0) {
			dropped.push({ pair, reason: "shift-full" });
			continue;
		}
		if (busyDatesByPr.get(pair.prId)?.has(shift.shiftDate)) {
			dropped.push({ pair, reason: "pr-busy" });
			continue;
		}
		// CAN THEY GET THERE? Checked after pr-busy so an overlap is reported as the
		// clash it is; what is left is the seam between adjacent dates, which the
		// date test above cannot see.
		const pin = outletPinById?.get(shift.outletId);
		const window = windowMinutes({
			dateIso: shift.shiftDate,
			shift: shift.slot ?? "",
		});
		if (
			outletPinById &&
			pin &&
			window &&
			cannotReach({
				shift: { ...pin, start: window.start, end: window.end },
				pinById: outletPinById,
				occupied: occupiedByPr.get(pair.prId) ?? [],
			})
		) {
			dropped.push({ pair, reason: "travel-tight" });
			continue;
		}
		// The mix, by the same rule the API applies. `shiftBlockedFor` is the one
		// implementation of it — sharing it is what keeps this pass and the assign
		// grid from disagreeing about the same shift.
		if (tierByPrId) {
			const blocked = shiftBlockedFor({
				shift,
				staffed: staffedByShift.get(shift.id) ?? 0,
				staffedTiers: staffedBucketsByShift.get(shift.id) ?? [],
				prTier: pair.prTier,
			});
			if (blocked?.kind === "tier-full") {
				dropped.push({ pair, reason: "tier-full" });
				continue;
			}
		}

		// Count the pair as taken so the rest of this batch sees it — the seat and
		// the BUCKET both, or two proposals could claim the last Tier I between
		// them and the second would only fail at the API.
		valid.push(pair);
		staffedByShift.set(shift.id, (staffedByShift.get(shift.id) ?? 0) + 1);
		staffedBucketsByShift.set(shift.id, [
			...(staffedBucketsByShift.get(shift.id) ?? []),
			bucketForPrTier(pair.prTier),
		]);
		const dates = busyDatesByPr.get(pair.prId) ?? new Set<string>();
		dates.add(shift.shiftDate);
		busyDatesByPr.set(pair.prId, dates);
	}

	return { valid, dropped };
}

/**
 * Why a shift cannot take this PR right now — `null` when it can.
 *
 * The planning grid and the API must agree about this, or the UI offers a
 * pairing the server refuses. Exported so the assign sheet greys out exactly
 * what `POST /shift-assignment` would reject, by the same two rules in the same
 * order: total headcount, then the tier mix.
 *
 * `staffed` and `staffedTiers` must be COUNTED from live assignments. Never pass
 * `shift.filled` — nothing in the backend increments that column, so it reads 0
 * on a fully-rostered shift, which is exactly how this sheet came to offer a 2/2
 * shift as "2 open".
 */
export type ShiftBlockReason =
	| { kind: "full"; staffed: number; quantity: number }
	/**
	 * `bucket` is a TIER LABEL ("Tier I"), which stays English in both languages
	 * because it is a product term. It is `null` when the PR's tier was never
	 * named by the shift, and the caller supplies its own "this tier" wording —
	 * that fallback used to be English prose baked in here, which put an
	 * untranslatable sentence fragment inside a pure planning function.
	 */
	| { kind: "tier-full"; bucket: string | null; asked: number }
	/**
	 * The shift itself takes nobody — a `draft` the outlet has not published, or a
	 * `sealed` shift whose payroll has closed. A fact about the SHIFT, so it is
	 * true with no PR selected, which is why the callers treat it like `full`.
	 */
	| { kind: "not-assignable"; status: Shift["status"] };

export function shiftBlockedFor(params: {
	shift: Shift;
	staffed: number;
	staffedTiers: (string | null)[];
	prTier: string | null;
}): ShiftBlockReason | null {
	const { shift, staffed, staffedTiers, prTier } = params;
	// FIRST, because it outranks both of the others: a draft that is also full is
	// not "fully staffed", it is unpublished, and telling the agency to look for
	// another shift would send them off to solve the wrong problem.
	if (!ASSIGNABLE_SHIFT_STATUSES.includes(shift.status)) {
		return { kind: "not-assignable", status: shift.status };
	}
	if (staffed >= shift.quantity) {
		return { kind: "full", staffed, quantity: shift.quantity };
	}

	const { asked, totalAsked } = askedByBucket(shift.payTiers);
	// No mix declared — only headcount binds (every pre-composer shift).
	if (totalAsked === 0) return null;

	const bucket = bucketForPrTier(prTier);
	if (bucket && asked.has(bucket)) {
		const want = asked.get(bucket) ?? 0;
		const have = staffedTiers.filter((t) => t === bucket).length;
		return have >= want ? { kind: "tier-full", bucket, asked: want } : null;
	}
	// A tier the shift never named competes for the unallocated leftover.
	const leftover = Math.max(0, shift.quantity - totalAsked);
	const have = staffedTiers.filter((t) => !t || !asked.has(t)).length;
	return have >= leftover
		? { kind: "tier-full", bucket, asked: leftover }
		: null;
}

/** Human label for a backend tier enum value ('tier_1' → 'Tier I'). */
export function tierLabel(tier: string | null): string {
	switch (tier) {
		case "tier_1":
			return "Tier I";
		case "tier_2":
			return "Tier II";
		case "tier_3":
			return "Tier III";
		case "tier_4":
			return "Tier IV";
		case "tier_5":
			return "Tier V";
		case "servant":
			return "Servant";
		case "commission_only":
			return "Commission only";
		default:
			return "No tier";
	}
}
