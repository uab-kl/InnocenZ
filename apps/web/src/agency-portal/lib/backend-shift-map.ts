import type {
	AgencyRosterSlot,
	OutletPrTier,
	RosterSlotStatus,
} from "@agency-portal/lib/agency-demo";
import { formatOutletDayLabel } from "@agency-portal/lib/agency-outlet-shifts";
import { parseShiftWindow } from "@agency-portal/lib/portal-sync";
import {
	isCommissionOnlyPayTier,
	outletTierForPostJobPayTier,
	type PostJobPayTierId,
	type PostJobPayTierRow,
	payTierDisplayOrder,
	postJobPayTierIdForOutletTier,
} from "@agency-portal/lib/post-job-pay-tiers";
import { shiftStartInstant } from "@agency-portal/lib/shift-window";
import type { ShiftRequest } from "@agency-portal/lib/store";
import type {
	CreateShiftInput,
	Shift,
	ShiftEventKind,
	ShiftPayTierDemand,
	ShiftPayTierInput,
} from "@/services/shift";
import type {
	ShiftAssignment,
	ShiftAssignmentStatus,
} from "@/services/shift-assignment";

// Backend shift/assignment rows -> the demo shapes the portal UI renders. Both
// portals read the same two endpoints, so the mapping lives here once: the
// agency roster grid builds AgencyRosterSlots, the outlet Today screen builds
// ShiftRequests, and both need the same window/status/payout parsing.

// A shift-assignment status doesn't fully overlap the demo's live roster
// statuses; map to the closest planning-view state.
export function rosterStatusFromAssignment(
	status: ShiftAssignmentStatus,
): RosterSlotStatus {
	switch (status) {
		case "assigned":
			// PRs don't accept/decline — they can only cancel per the cancellation
			// rules — so an assigned shift is effectively scheduled, not "awaiting
			// PR". See the pr-cannot-accept-decline domain rule.
			return "scheduled";
		case "confirmed":
		case "completed":
			return "scheduled";
		// MC/leave awaiting the agency decision — reads as a pending cell; the
		// roster page's Leave requests panel is where it gets approved/rejected.
		case "leave_pending":
			return "assignment-pending";
		case "no_show":
		case "cancelled":
		// Approved MC/leave = excused absence — off the plan like a cancel.
		case "leave_approved":
			return "unavailable";
		default:
			return "scheduled";
	}
}

// The backend shift `slot` is free text; only treat it as a time window when it
// actually looks like one, so label-only slots don't get fake times.
const TIME_WINDOW_RE = /\d{1,2}:\d{2}/;
// "8pm", "8 pm", "8:30pm", "20:00" — the forms an operator actually types.
const CLOCK_TOKEN_RE = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;

/** One end of a slot -> 24h "HH:MM", or null when it isn't a clock time. */
function toHhmm(token: string): string | null {
	const m = token.trim().match(CLOCK_TOKEN_RE);
	if (!m) return null;
	let hour = Number(m[1]);
	const minutes = m[2] ?? "00";
	const meridiem = m[3]?.toLowerCase();
	if (meridiem) {
		if (hour < 1 || hour > 12) return null;
		hour = hour % 12;
		if (meridiem === "pm") hour += 12;
	} else if (hour > 23) {
		return null;
	}
	if (Number(minutes) > 59) return null;
	return `${String(hour).padStart(2, "0")}:${minutes}`;
}

/**
 * The demo's time helpers expect "HH:MM - HH:MM"; the backend stores whatever
 * the outlet typed ("8pm - 2am"). Normalize at this boundary so the calendar
 * renders a real range instead of falling back to 12p–12p, and so the roster
 * window / estimated payout can be derived. Returns null for label-only slots
 * ("Late night"), which keep their text and get no fake times.
 */
export function normalizedSlotWindow(
	slot: string | null,
): { start: string; end: string } | null {
	if (!slot) return null;
	const parts = slot.split(/[—–-]/);
	if (parts.length !== 2) return null;
	const start = toHhmm(parts[0]);
	const end = toHhmm(parts[1]);
	return start && end ? { start, end } : null;
}

/** The slot as the demo shapes expect it — normalized when parseable. */
export function normalizedSlotLabel(slot: string | null): string {
	const window = normalizedSlotWindow(slot);
	return window ? `${window.start} - ${window.end}` : (slot ?? "");
}

export function shiftWindow(slot: string | null): {
	start: string;
	end: string;
} {
	const normalized = normalizedSlotWindow(slot);
	if (normalized) return normalized;
	if (slot && TIME_WINDOW_RE.test(slot)) {
		const { shiftStart, shiftEnd } = parseShiftWindow(slot);
		return { start: shiftStart, end: shiftEnd };
	}
	return { start: "", end: "" };
}

function minutesOf(hhmm: string): number | null {
	const [h, m] = hhmm.split(":").map(Number);
	if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
	return h * 60 + m;
}

// Estimated payout so the payout filter has something to compare: window hours
// (wrapping past midnight) times the shift's hourly rate. Undefined when the
// window or rate can't be parsed.
export function estPayoutFor(
	window: { start: string; end: string },
	payPerHour: string,
): number | undefined {
	const start = minutesOf(window.start);
	const end = minutesOf(window.end);
	const pay = Number(payPerHour);
	if (start == null || end == null || !Number.isFinite(pay)) return undefined;
	let mins = end - start;
	if (mins <= 0) mins += 24 * 60;
	return (mins / 60) * pay;
}

// numeric(12,2) columns arrive as strings; coerce defensively.
function num(value: string | null | undefined): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

/**
 * One assignment = one roster slot. `prNameById` is for callers that fetched the
 * PR directory (agency); outlet callers cannot read `/pr` and instead rely on
 * the `prName` the assignment list joins in. Demo-only fields (swaps, floor
 * metrics, pay tiers) are left unset until their backend features land.
 */
/**
 * Numeric columns arrive as strings (numeric/decimal) or numbers (integer), and
 * as null when unset. Anything that isn't a finite number becomes undefined, so
 * a missing pin reads as "no coordinate" instead of a silent 0,0 off Africa.
 */
function numOrUndefined(
	value: string | number | null | undefined,
): number | undefined {
	if (value === null || value === undefined || value === "") return undefined;
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
}

/**
 * Minutes after the scheduled start before a check-in counts as LATE.
 *
 * Deliberately the same five minutes as `WAGE_GRACE_MINUTES`
 * (apps/backend/src/features/shift-assignment/wage.ts:41), the owner's
 * "around 1-5 minutes". Two different graces for the same slip would let the
 * roster call a PR late for a shift the wage rule paid in full.
 */
export const ROSTER_LATE_GRACE_MINUTES = 5;

/**
 * Did this PR arrive late?
 *
 * Overnight-safe by construction: `shiftStartInstant` builds a real instant from
 * the shift's DATE plus its slot, so a 22:00 start is 22:00 that evening and
 * never 22:00 on some other day. Comparing a check-in timestamp against a bare
 * "HH:MM" would call every overnight arrival late.
 *
 * Returns undefined — not false — when there is nothing to judge: no check-in,
 * or a slot with no parseable window. The filter treats undefined as "not
 * late", and an unreadable slot must not accuse anyone.
 */
function lateFlagFor(
	shiftDate: string,
	slot: string | null | undefined,
	checkInAt: string | null | undefined,
): true | undefined {
	if (!checkInAt) return undefined;
	const start = shiftStartInstant(localDateIso(shiftDate), slot);
	if (!start) return undefined;
	const lateBy = new Date(checkInAt).getTime() - start.getTime();
	if (Number.isNaN(lateBy)) return undefined;
	return lateBy > ROSTER_LATE_GRACE_MINUTES * 60_000 ? true : undefined;
}

/**
 * The roster status a live view should show. `rosterStatusFromAssignment` maps
 * the stored enum for the planning grid; here the timestamps get the final say,
 * because a PR who has checked in and not checked out is on duty right now no
 * matter what the row's enum says.
 */
function liveRosterStatus(
	a: ShiftAssignment,
	// Kept in the signature so the call sites need no churn; the clock-ended
	// derivation they fed is gone (stamps end shifts, not clocks).
	_shiftDate?: string,
	_slot?: string | null,
): RosterSlotStatus {
	const working =
		!!a.checkInAt &&
		!a.checkOutAt &&
		a.status !== "cancelled" &&
		a.status !== "no_show" &&
		a.status !== "leave_approved";
	if (working) return "on-duty";
	const mapped = rosterStatusFromAssignment(a.status);
	// NO clock-derived "ended" any more (owner, 23 Aug 2026: "why show ended?
	// the pr still can check in"). The window passing does not resolve a
	// booking — stamps and decisions do: checked out reads Checked out (the
	// grid's stamp tone), cancelled/no-show read Off, and a booked slot with
	// no stamps stays SCHEDULED however late it gets, because a late check-in
	// is still allowed and the agency still owes this row a decision. The
	// clock-ended test lives on only in the shift pickers, where it decides
	// which CARD leads — never what a booking's state is.
	return mapped;
}

/**
 * shift_date arrives as a timestamptz holding LOCAL midnight — the JSON string
 * is "2026-07-28T16:00:00.000Z" for the local 29 Jul. Panels compare dateIso
 * against plain "YYYY-MM-DD" (today), so the raw string never matches and an
 * on-duty PR silently vanishes from the roster day view + live GPS panel.
 * Normalize to the viewer's calendar date; plain date strings pass through.
 */
function localDateIso(value: string): string {
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-CA");
}

export function rosterSlotsFromBackend(input: {
	shifts: Shift[];
	assignments: ShiftAssignment[];
	prNameById?: Map<string, string>;
	outletNameById?: Map<string, string>;
	/**
	 * The outlet's saved map pin + fence radius, keyed by outlet id. Read from
	 * the outlet row through the shift's FK — the coordinates are never stored
	 * on the assignment. Absent entries mean that outlet has not dropped a pin,
	 * which is exactly the case the backend leaves unfenced.
	 */
	outletGeoById?: Map<
		string,
		{ lat: string | null; lng: string | null; geoFenceRadius: number | null }
	>;
	/**
	 * Agency id -> name, so each slot can say WHO supplied its PR.
	 *
	 * Without it a slot carries only `shift_assignment.agency_id`, a uuid nothing
	 * on the client can translate — the portal's only id-to-name table is demo
	 * data. Every label therefore fell through to the demo literal "Atlas
	 * Agency", telling a venue that a real company, possibly one it has never
	 * worked with, had staffed its floor.
	 *
	 * Optional: a caller that cannot resolve names omits it, and a slot with no
	 * name renders none — the honest answer, and the one `rosterSlotAgencyName`
	 * now gives instead of reaching for the demo literal.
	 */
	agencyNameById?: Map<string, string>;
}): AgencyRosterSlot[] {
	const {
		shifts,
		assignments,
		prNameById,
		outletNameById,
		outletGeoById,
		agencyNameById,
	} = input;
	const shiftById = new Map(shifts.map((s) => [s.id, s]));

	const slots: AgencyRosterSlot[] = [];
	for (const a of assignments) {
		// Assignment's shift is outside the requested window — skip.
		const shift = shiftById.get(a.shiftId);
		if (!shift) continue;
		const window = shiftWindow(shift.slot);
		const outletGeo = outletGeoById?.get(shift.outletId);
		slots.push({
			id: a.id,
			prId: a.prId,
			prName: prNameById?.get(a.prId) ?? a.prName ?? "Unknown PR",
			outlet: outletNameById?.get(shift.outletId) ?? shift.outletId,
			date: localDateIso(shift.shiftDate),
			dateIso: localDateIso(shift.shiftDate),
			// Must match the ShiftRequest's `shift` exactly — the panels join roster
			// slots to a shift on this string.
			shift: normalizedSlotLabel(shift.slot) || (shift.eventName ?? ""),
			shiftStart: window.start,
			shiftEnd: window.end,
			estPayout: estPayoutFor(window, shift.payPerHour),
			// Stamped in and not yet out = genuinely on the floor. The status map
			// alone cannot see this (a "confirmed" row is scheduled until the PR
			// actually arrives), and the live GPS panel keys off "on-duty", so
			// without this a real check-in would never appear on the map.
			status: liveRosterStatus(a, shift.shiftDate, shift.slot),
			checkedInAt: a.checkInAt ?? undefined,
			checkedOutAt: a.checkOutAt ?? undefined,
			// Real, server-verified position — see the AgencyRosterSlot doc.
			checkInLat: numOrUndefined(a.checkInLat),
			checkInLng: numOrUndefined(a.checkInLng),
			checkInDistanceM: numOrUndefined(a.checkInDistanceM),
			checkInAccuracyM: numOrUndefined(a.checkInAccuracyM),
			outletLat: numOrUndefined(outletGeo?.lat),
			outletLng: numOrUndefined(outletGeo?.lng),
			outletGeoFenceRadiusM: numOrUndefined(outletGeo?.geoFenceRadius),
			noShowFlag: a.status === "no_show" ? true : undefined,
			// Real lateness, from the stamp the PR actually made. This was demo-only
			// until now, so the roster's "Late" filter silently matched nothing on
			// every real session.
			lateFlag: lateFlagFor(shift.shiftDate, shift.slot, a.checkInAt),
			cancelledAt: a.status === "cancelled" ? a.updatedAt : undefined,
			agencyId: a.agencyId,
			// The SUPPLIER of this PR, named. Resolved only when the caller could
			// supply the map; otherwise left undefined so the label renders nothing
			// rather than a demo company.
			agencyName: a.agencyId ? agencyNameById?.get(a.agencyId) : undefined,
		});
	}
	return slots;
}

/**
 * A backend shift -> the demo `ShiftRequest` the outlet Today cards render.
 * `prs` carries the real assignment PR ids so the detail panels can match them
 * against the roster slots built by `rosterSlotsFromBackend`.
 *
 * `date` is the demo's human label ('Tonight' / 'Tomorrow' / '21 Jul') while
 * `dateIso` carries the real date — the resolver prefers `dateIso`, so the label
 * is display only. Fields with no backend behind them (drink menus, tier rates,
 * per-shift floor counts, dress code, cut-loss state) are left unset so the
 * screens fall back to the outlet's Workspace settings and demo defaults.
 */
export function shiftRequestFromBackendShift(input: {
	shift: Shift;
	assignments: ShiftAssignment[];
	outletName: string;
	todayIso: string;
}): ShiftRequest {
	const { shift, assignments, outletName, todayIso } = input;
	const forShift = assignments.filter((a) => a.shiftId === shift.id);
	// Cancelled / no-show / leave-approved PRs are not staffing the floor
	// tonight (an approved MC/leave excuses the shift).
	const staffing = forShift.filter(
		(a) =>
			a.status !== "cancelled" &&
			a.status !== "no_show" &&
			a.status !== "leave_approved",
	);
	const label = formatOutletDayLabel(shift.shiftDate, todayIso);

	return {
		id: shift.id,
		outletName,
		// The demo calls today's night "Tonight"; formatOutletDayLabel says "Today".
		date: label === "Today" ? "Tonight" : label,
		dateIso: localDateIso(shift.shiftDate),
		// Same expression as the roster slot's `shift` — they are joined on it.
		shift: normalizedSlotLabel(shift.slot) || (shift.eventName ?? ""),
		quantity: shift.quantity,
		// The roster IS the count — there is no second opinion to fall back to.
		// This used to read `staffing.length > 0 ? staffing.length : shift.filled`,
		// which was never wrong (an empty roster and the dead `shift.filled` are
		// both 0) but implied that column is a usable backup. Nothing in the
		// backend has ever incremented it.
		filled: staffing.length,
		languages: shift.languages ?? "",
		// The venue's dress code, back from the shift row (0132). Undefined rather
		// than "" when absent: every reader gates on truthiness to decide whether
		// to draw the row at all, and an empty string would print an empty label.
		dressCode: shift.dressCode ?? undefined,
		event: shift.eventName ?? "Shift",
		eventKind: shift.eventKind,
		templateId: shift.templateId ?? undefined,
		templateCoverImage: shift.templateCoverImage ?? undefined,
		preferredRating: shift.preferredRating ?? 0,
		estimatedCost: num(shift.estimatedCost),
		liveSales: num(shift.liveSales),
		status: shift.status,
		prs: staffing.map((a) => a.prId),
		// Who the venue ASKED for — distinct from `prs` (who is booked). Rides
		// straight off the server response; empty array means nobody was named.
		requestedPrs: shift.requestedPrs ?? [],
		payPerHour: num(shift.payPerHour),
		// What the shift ASKED for, per tier. Without this every outlet screen fell
		// back to a synthesised ladder — see `payTierRowsFromShiftPayTiers`.
		payTierRows: payTierRowsFromShiftPayTiers(shift.payTiers),
		// Seats taken per tier, counted across every agency the shift was posted to.
		// The outlet cannot work this out for itself: it would have to know each
		// booked PR's tier, and a tier is a fact about that PR's membership of an
		// AGENCY — which is why this column read 0 while a PR was plainly on the shift.
		suppliedByTierBucket: shift.staffedBuckets,
	};
}

/**
 * The fields the reverse (write) mapper reads off a Post Job composer item. A
 * posted shift item is a superset of this — the remaining demo-only fields
 * (drink menus, dress code, star tiers, named PR ids) have no backend column and
 * are dropped here. The pay-tier rows ARE persisted, as `shift_pay_tier` rows.
 */
export interface OutletShiftPostItem {
	/** Named-PR picks resolved to (person, membership) pairs — see 0131. */
	requestedPrs?: { userId: string; agencyId: string }[];
	/** Canonical yyyy-MM-dd — the composer always sets this on a posted item. */
	dateIso: string;
	shift: string;
	quantity: number;
	languages: string;
	/** Resolved dress code — the picked option, or the venue's own "Other" text. */
	dressCode?: string;
	event: string;
	eventKind?: ShiftEventKind;
	/** Event template this shift was posted from (0128). */
	templateId?: string;
	preferredRating: number;
	estimatedCost: number;
	payPerHour: number;
	/** Per-tier rate + headcount rows the composer built (persisted as overrides). */
	payTierRows?: PostJobPayTierRow[];
}

// The backend's preferredRating is a 0–5 int; the composer's derived value can
// fall outside that when no star tier is chosen, so clamp at the boundary.
function clampRating(rating: number): number {
	if (!Number.isFinite(rating)) return 0;
	return Math.max(0, Math.min(5, Math.round(rating)));
}

function nonNegative(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Backend `shift_pay_tier` rows -> the composer rows every outlet screen reads.
 *
 * ⚠️ THE MISSING HALF. `shiftPayTiersFromRows` has always written these rows to the
 * backend; nothing ever read them back, so a shift fetched from the API arrived with
 * no `payTierRows`. Downstream that is not a blank — it is an INVENTION:
 * `resolveShiftTierRates` sees no rates and synthesises a ladder from a base tier,
 * which is why the shift panel showed drink/tip percentages (0, 1, 2, 3, 4) matching
 * neither the shift nor the venue's rate card, and a per-tier "requested" split the
 * shift never asked for — one row asking for 2 × Tier I drawn as seven tiers with
 * ones scattered across them.
 *
 * Only rows the shift actually declared come back. A shift with no overrides still
 * returns undefined, and the workspace card remains the honest fallback for it.
 */
export function payTierRowsFromShiftPayTiers(
	payTiers: ShiftPayTierDemand[] | undefined,
): PostJobPayTierRow[] | undefined {
	if (!payTiers?.length) return undefined;
	return payTiers.map((row, index) => {
		const commissionOnly = row.kind === "commission_only";
		// `commission_only` has no tier of its own; the composer keys it by its own
		// bucket id, which `postJobPayTierIdForOutletTier` cannot produce from a null.
		const payTierId = (
			commissionOnly
				? "commission_only"
				: postJobPayTierIdForOutletTier(row.tier as OutletPrTier)
		) as PostJobPayTierId;
		return {
			id: `${payTierId}-${index}`,
			payTierId,
			wagePerHour: Number(row.wagePerHour ?? 0),
			targetSalesRm:
				row.targetSalesRm === null || row.targetSalesRm === undefined
					? undefined
					: Number(row.targetSalesRm),
			drinkPct: Number(row.drinkPct ?? 0),
			tipPct: Number(row.tipPct ?? 0),
			prCount: row.prCount ?? 0,
		};
	});
}

/**
 * Post Job pay-tier rows -> the backend `payTiers` overrides. `tier` carries the
 * outlet label the PR rate resolver matches on ('Tier I'..'Servant');
 * commission-only has no label. The composer doesn't collect a per-shift
 * happy-hour % or OT rate, so those are left unset and fall back to the outlet
 * workspace defaults.
 *
 * EVERY composer row is persisted, including the ones asking for nobody
 * (18 Aug 2026). This used to filter `prCount > 0`, which quietly threw away a
 * rate the venue had typed: price Tier III at RM 750 while requesting none of
 * them, and the row never reached the database, so the panel later drew the
 * WORKSPACE rate and nothing said the number had gone. A zero row is a price the
 * shift declares for a tier it did not book — worth keeping, because it is what
 * that tier is worth if one is ever added.
 *
 * ⚠️ This is only safe alongside the demand rule it depends on: `askedByBucket`,
 * on both sides, ignores rows with `prCount <= 0`. Without that, a persisted zero
 * NAMES the tier with a quota of nought and no PR of it could ever be assigned —
 * a dropped rate traded for an unstaffable tier. Do not restore this filter
 * without also revisiting that rule.
 */
export function shiftPayTiersFromRows(
	rows: PostJobPayTierRow[],
): ShiftPayTierInput[] {
	return rows.map((row) => {
		const commissionOnly = isCommissionOnlyPayTier(row.payTierId);
		return {
			kind: commissionOnly ? "commission_only" : "tier",
			tier: outletTierForPostJobPayTier(row.payTierId),
			wagePerHour: commissionOnly ? null : row.wagePerHour,
			drinkPct: row.drinkPct,
			happyHourDrinkPct: null,
			tipPct: row.tipPct,
			otAfterHours: null,
			targetSalesRm: row.targetSalesRm ?? null,
			prCount: row.prCount,
			sortOrder: payTierDisplayOrder(row.payTierId),
		};
	});
}

/**
 * A Post Job composer item -> the backend `CreateShiftInput`. `outletId` comes
 * from the signed-in outlet's identity, never the item. A brand-new posted
 * shift starts with no live sales, so `liveSales` is always 0.
 *
 * `agencyIds` names which of the venue's APPROVED agencies should receive this
 * job (0124) — several may staff one shift. Still no singular `agencyId`: the
 * server resolves the fan-out from the outlet's approved links and intersects
 * this list with them, so nothing here can forge an invitation. Omitting it
 * means "every approved agency", which is exactly what the old single-agency
 * routing meant back when a venue could only have one.
 */
export function createShiftInputFromPost(
	item: OutletShiftPostItem,
	outletId: string,
	agencyIds?: string[],
): CreateShiftInput {
	// Persist the composer's per-tier overrides when it built any; omit the field
	// entirely otherwise, so the shift keeps the outlet's workspace rate card.
	const payTiers = item.payTierRows?.length
		? shiftPayTiersFromRows(item.payTierRows)
		: undefined;
	return {
		outletId,
		shiftDate: item.dateIso,
		slot: item.shift.trim() || undefined,
		eventName: item.event.trim() || undefined,
		eventKind: item.eventKind,
		templateId: item.templateId,
		languages: item.languages.trim() || undefined,
		// 0132. This mapper used to drop the dress code on the floor — the field
		// was collected, VALIDATED (posting refuses an "Other" with no text) and
		// then discarded, so three screens that already render it never drew a
		// row. Trimmed to the column's 60 rather than refused: the value has
		// already passed the composer's own limit, and a post that dies at the
		// server over a long dress code would lose the whole shift.
		dressCode: item.dressCode?.trim().slice(0, 60) || undefined,
		quantity: nonNegative(Math.round(item.quantity)),
		preferredRating: clampRating(item.preferredRating),
		payPerHour: nonNegative(item.payPerHour),
		estimatedCost: nonNegative(item.estimatedCost),
		liveSales: 0,
		...(payTiers && payTiers.length ? { payTiers } : {}),
		// Omitted rather than sent empty when nothing was chosen — an empty array
		// and an absent field mean the same thing to the server ("all approved"),
		// and sending the field only when it carries a real choice keeps the
		// request honest about whether the operator picked.
		...(agencyIds && agencyIds.length ? { agencyIds } : {}),
		// The named picks finally reach the backend (0131). This mapper used to
		// document them as "dropped here" — that sentence was the bug.
		...(item.requestedPrs && item.requestedPrs.length
			? { requestedPrs: item.requestedPrs }
			: {}),
	};
}
