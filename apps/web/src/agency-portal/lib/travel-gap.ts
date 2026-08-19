/**
 * Can a PR get from one venue to the next in the time the roster leaves them?
 *
 * ⚠️ **A MIRROR of `apps/backend/src/features/shift-assignment/travel-gap.ts`.**
 * The server is authoritative — it is what warns on an assignment that already
 * landed. This copy exists because the auto-assign PLANNER chooses between
 * candidates client-side, and a planner that cannot ask the question proposes
 * people who cannot make the trip; the agency then confirms a plan the server
 * merely grumbles about afterwards.
 *
 * The constants and the formula MUST move together with that file. This is the
 * same arrangement `auto-assign.ts` already has with the backend's tier buckets,
 * and it is checked the same way — a probe fires both implementations at the same
 * coordinate pairs and asserts they agree, so a drift is a failing test rather
 * than a roster nobody can explain.
 */

/** Straight-line metres → road metres. */
const ROAD_WINDING_FACTOR = 1.35;
/** Kuala Lumpur door-to-door, traffic and all. */
const AVERAGE_CITY_SPEED_KMH = 25;
/** Leaving one venue and getting into the next, independent of distance. */
const BOARDING_MINUTES = 15;
const ROUND_UP_TO_MINUTES = 5;
/** Past this the pin is likelier wrong than the trip is real. */
const MAX_TRAVEL_MINUTES = 180;

const EARTH_RADIUS_M = 6_371_008.8;

export interface VenuePin {
	outletId: string;
	lat: number | null;
	lng: number | null;
}

function toRad(deg: number): number {
	return (deg * Math.PI) / 180;
}

/** Great-circle metres (haversine) — the backend's `metresBetween`, verbatim. */
function metresBetween(
	a: { lat: number; lng: number },
	b: { lat: number; lng: number },
): number {
	const dLat = toRad(b.lat - a.lat);
	const dLng = toRad(b.lng - a.lng);
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Minutes to get from one venue to the other, or null when it cannot be known.
 *
 * Null is NOT zero. An outlet that never dropped its map pin produces null, and a
 * planner must treat that as "no opinion" — dropping candidates over an unknown
 * distance would quietly empty a roster for a data gap nobody can see. Zero is the
 * real answer for the SAME venue: staying put needs no travel.
 */
export function travelMinutesBetween(a: VenuePin, b: VenuePin): number | null {
	if (a.outletId === b.outletId) return 0;
	if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) {
		return null;
	}
	const roadMetres =
		metresBetween({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }) *
		ROAD_WINDING_FACTOR;
	const minutes =
		(roadMetres / 1000 / AVERAGE_CITY_SPEED_KMH) * 60 + BOARDING_MINUTES;
	const rounded =
		Math.ceil(minutes / ROUND_UP_TO_MINUTES) * ROUND_UP_TO_MINUTES;
	return Math.min(rounded, MAX_TRAVEL_MINUTES);
}

/** A shift the PR already holds, as absolute minutes on one timeline. */
export interface OccupiedWindow {
	outletId: string;
	start: number;
	end: number;
}

export interface ReachProblem {
	/** Minutes the trip needs. */
	needMinutes: number;
	/** Minutes the roster leaves for it. */
	haveMinutes: number;
	/** The venue they would be coming from (or going to). */
	otherOutletId: string;
}

/**
 * The WORST trip this shift would ask of a PR who already works `occupied`, or
 * null when every hop is comfortable. Worst = least slack, so a screen showing one
 * line names the tightest hop rather than whichever row was read first.
 *
 * Overlaps are NOT reported: they are refused by their own guard, and a candidate
 * flagged twice for two different reasons is a shortage nobody can diagnose.
 *
 * Unknown pins fall through as "fine" — every caller must fail OPEN. Refusing to
 * roster anyone because an outlet has no coordinates would turn one missing pin
 * into an empty night.
 */
export function reachProblem(params: {
	shift: { start: number; end: number } & VenuePin;
	pinById: ReadonlyMap<string, VenuePin>;
	occupied: readonly OccupiedWindow[];
}): ReachProblem | null {
	const { shift, pinById, occupied } = params;
	let worst: ReachProblem | null = null;
	for (const other of occupied) {
		const otherPin = pinById.get(other.outletId);
		if (!otherPin) continue;
		const need = travelMinutesBetween(shift, otherPin);
		if (need === null) continue;

		let have: number | null = null;
		if (other.end <= shift.start) have = shift.start - other.end;
		else if (shift.end <= other.start) have = other.start - shift.end;
		if (have === null) continue; // they overlap — a different guard's business
		if (have >= need) continue;

		const found = {
			needMinutes: need,
			haveMinutes: have,
			otherOutletId: other.outletId,
		};
		if (
			!worst ||
			found.haveMinutes - found.needMinutes <
				worst.haveMinutes - worst.needMinutes
		) {
			worst = found;
		}
	}
	return worst;
}

/**
 * The planner's yes/no form of {@link reachProblem}. Kept as its own name because
 * a caller that DECIDES something must not carry a payload it could branch on —
 * the same reason `blockedDatesByPr` and `blockedReasonsByPr` are separate maps.
 */
export function cannotReach(params: {
	shift: { start: number; end: number } & VenuePin;
	pinById: ReadonlyMap<string, VenuePin>;
	occupied: readonly OccupiedWindow[];
}): boolean {
	return reachProblem(params) !== null;
}
