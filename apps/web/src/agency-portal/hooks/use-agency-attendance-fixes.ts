import { usePrPhotoById } from "@agency-portal/hooks/use-pr-photo";
import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { localDateIso } from "@agency-portal/lib/backend-shift-map";
import {
	GEOFENCE_METERS,
	type GpsTrackingRow,
} from "@agency-portal/lib/gps-locations";
import { shiftStartInstant } from "@agency-portal/lib/shift-window";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	type AttendanceFix,
	fetchAttendanceFixes,
} from "@/services/attendance-fix";

/**
 * How much of the device's self-reported accuracy may widen the fence, mirroring
 * `MAX_ACCURACY_BUFFER_M` in the backend's `check-in-geofence.ts`. The server
 * accepted or refused the stamp using this rule; recomputing "in range" with a
 * different one would let this panel contradict the decision that was actually
 * made at the door.
 */
const MAX_ACCURACY_BUFFER_M = 30;

/** A PR who stamped but whose position was never recorded. */
export interface AttendanceStampNoFix {
	assignmentId: string;
	prName: string;
	/** Unresolved photo reference; null when there is none. See `PrFaceBubble`. */
	prPhoto: string | null;
	at: string;
}

/** A PR who is rostered today and has not stamped at all yet. */
export interface AttendanceNotArrived {
	assignmentId: string;
	prId: string;
	prName: string;
	/** Unresolved photo reference; null when there is none. See `PrFaceBubble`. */
	prPhoto: string | null;
	slot: string | null;
	/**
	 * The instant this shift is due to start, ISO. Null for a label-only slot
	 * ("Late night"), which has no time to be due at.
	 *
	 * Carried so a row can say WHEN someone is expected rather than only that
	 * they have not arrived. Before that instant "not checked in" is not a
	 * finding — it is simply not their hour yet, and reading it as absence is
	 * what made a PR rostered later in the day look missing.
	 */
	dueAt: string | null;
	/**
	 * Another venue on this date where this same PR has a check-in and no
	 * check-out — where they still are. Null when there is none, and never this
	 * row's own outlet: naming the card back to the reader explains nothing.
	 *
	 * A PR working two venues in one day appears on two cards at once. Without
	 * this the second card reads as an unexplained absence instead of as someone
	 * who is on the floor somewhere else until their next slot.
	 */
	stillCheckedInAt: string | null;
}

export interface AttendanceOutletGroup {
	outlet: string;
	/** False when the venue has no pin — nothing was fenced, so nothing is "in range". */
	pinned: boolean;
	radiusM: number;
	/**
	 * Only rows with a REAL stored fix. A row without coordinates is never given
	 * an invented position just to appear on the map — that substitution is the
	 * whole class of bug this panel was rebuilt to avoid.
	 */
	mapped: GpsTrackingRow[];
	/** Newest stamp time among `mapped`, so the UI can date the whole card. */
	latestStampAt: string | null;
	noFix: AttendanceStampNoFix[];
	notArrived: AttendanceNotArrived[];
}

/** One date's feed, grouped by venue. The part that owes nothing to React. */
export interface AttendanceFixesShape {
	groups: AttendanceOutletGroup[];
	rostered: number;
	stamped: number;
	withFix: number;
	/** Counted only across pinned venues, where the question means anything. */
	inRange: number;
	/** True when at least one venue on today's roster has no pin. */
	hasUnpinnedVenue: boolean;
}

export interface UseAgencyAttendanceFixesResult extends AttendanceFixesShape {
	/** False for demo sessions — the caller falls back to its demo panel. */
	backed: boolean;
	isLoading: boolean;
}

/** One PR's newest stamps on this date, used to order rows across venues. */
interface PrStampIndex {
	/** Newest check-in with NO check-out — where they still are. */
	open: { outlet: string; at: string } | null;
	/** Newest check-in of any kind, closed or not. */
	any: { outlet: string; at: string } | null;
}

/**
 * Index every PR's newest stamps, by prId.
 *
 * Built over the WHOLE feed before anything is grouped, because the answer one
 * venue's card needs lives on a DIFFERENT venue's row. Two questions come out
 * of it: where a PR still is (`open`, for a rostered row that has not stamped)
 * and whether a stamped row has been overtaken (`any`, for a check-in that was
 * never closed while a later one exists somewhere else).
 */
function stampIndexByPr(fixes: AttendanceFix[]): Map<string, PrStampIndex> {
	const index = new Map<string, PrStampIndex>();
	for (const fix of fixes) {
		if (fix.checkIn === null) continue;
		const outlet = fix.outlet.name ?? "Unnamed venue";
		const stamp = { outlet, at: fix.checkIn.at };
		const entry = index.get(fix.prId) ?? { open: null, any: null };
		if (!entry.any || stamp.at > entry.any.at) entry.any = stamp;
		if (fix.checkOut === null && (!entry.open || stamp.at > entry.open.at)) {
			entry.open = stamp;
		}
		index.set(fix.prId, entry);
	}
	return index;
}

/**
 * Group one date's attendance feed by venue.
 *
 * Pure, and exported for its tests: which bucket a row lands in, when it is
 * due, and the cross-venue "still checked in at" clause are decisions about the
 * data, not rendering.
 */
export function buildAttendanceGroups(
	fixes: AttendanceFix[],
	prPhotoById: (prId: string, prName: string) => string | null,
): AttendanceFixesShape {
	const byOutlet = new Map<string, AttendanceOutletGroup>();
	const stamps = stampIndexByPr(fixes);

	for (const fix of fixes) {
		const prPhoto = prPhotoById(fix.prId, fix.prName);
		const outlet = fix.outlet.name ?? "Unnamed venue";
		const radiusM = fix.outlet.radiusM ?? GEOFENCE_METERS;
		const group = byOutlet.get(outlet) ?? {
			outlet,
			pinned: fix.outlet.pinned,
			radiusM,
			mapped: [],
			latestStampAt: null,
			noFix: [],
			notArrived: [],
		};

		const stamp = fix.checkIn;
		if (stamp === null) {
			const elsewhere = stamps.get(fix.prId)?.open?.outlet;
			group.notArrived.push({
				assignmentId: fix.assignmentId,
				prId: fix.prId,
				prName: fix.prName,
				prPhoto,
				slot: fix.slot,
				// `shift_date` can arrive as a timestamptz holding LOCAL midnight,
				// whose first ten characters are the PREVIOUS day. Normalizing first
				// is what stops a 12:00 start reading as having been due yesterday.
				dueAt:
					shiftStartInstant(
						localDateIso(fix.shiftDate),
						fix.slot,
					)?.toISOString() ?? null,
				stillCheckedInAt: elsewhere && elsewhere !== outlet ? elsewhere : null,
			});
		} else if (
			stamp.lat === null ||
			stamp.lng === null ||
			fix.outlet.lat === null ||
			fix.outlet.lng === null
		) {
			// Stamped, but there is no pair of points to draw. Either the device
			// sent no fix or the venue has no pin; both are real states and
			// neither justifies plotting a guess.
			group.noFix.push({
				assignmentId: fix.assignmentId,
				prName: fix.prName,
				prPhoto,
				at: stamp.at,
			});
		} else {
			const meters = stamp.distanceM ?? 0;
			const tolerance =
				radiusM + Math.min(stamp.accuracyM ?? 0, MAX_ACCURACY_BUFFER_M);
			// This check-in was never closed, and the same PR has since stamped
			// in at another venue. Nobody is in two places: this row is the stale
			// one, and saying which venue overtook it is the only thing here that
			// can rank two open check-ins. A CLOSED row is not marked — it ended
			// properly, and a later shift elsewhere is just the next shift.
			const newer = stamps.get(fix.prId)?.any;
			const overtakenBy =
				fix.checkOut === null &&
				newer &&
				newer.at > stamp.at &&
				newer.outlet !== outlet
					? newer.outlet
					: undefined;
			group.mapped.push({
				slotId: fix.assignmentId,
				prId: fix.prId,
				prName: fix.prName,
				prPhoto,
				outlet,
				status: "on-duty",
				meters,
				// Only meaningful on a pinned venue; the UI checks `pinned` before
				// wording this either way.
				inRange: fix.outlet.pinned && meters <= tolerance,
				prCoord: { lat: stamp.lat, lng: stamp.lng },
				outletCoord: { lat: fix.outlet.lat, lng: fix.outlet.lng },
				radiusM,
				accuracyM: stamp.accuracyM ?? undefined,
				outletUnpinned: !fix.outlet.pinned,
				// The hour every one of these rows was missing. The card header
				// carried only the group's LATEST stamp, which says nothing about
				// any individual row — and a row with a distance but no time reads
				// as a live position.
				checkInAt: stamp.at,
				checkOutAt: fix.checkOut?.at,
				sinceCheckedInAt: overtakenBy,
			});
			if (group.latestStampAt === null || stamp.at > group.latestStampAt) {
				group.latestStampAt = stamp.at;
			}
		}

		byOutlet.set(outlet, group);
	}

	const groups = [...byOutlet.values()].sort((a, b) =>
		a.outlet.localeCompare(b.outlet),
	);

	return {
		groups,
		rostered: fixes.length,
		stamped: fixes.filter((f) => f.checkIn !== null).length,
		withFix: groups.reduce((sum, g) => sum + g.mapped.length, 0),
		inRange: groups.reduce(
			(sum, g) =>
				sum + (g.pinned ? g.mapped.filter((r) => r.inRange).length : 0),
			0,
		),
		hasUnpinnedVenue: groups.some((g) => !g.pinned),
	};
}

/**
 * Where this agency's PRs stamped attendance on one date.
 *
 * Deliberately NOT a live-location feed. `shift_assignment` stores a position at
 * check-in and at check-out only — no table anywhere holds anything in between —
 * so the freshest fact available is where someone stood when they clocked in. The
 * stamp time rides along with every coordinate so the UI can say so.
 *
 * `meters` comes from the server's own recomputed `distanceM`, not from the
 * returned coordinates: if a venue's pin has been moved since the stamp, the
 * stored distance is what the geofence actually judged.
 */
export function useAgencyAttendanceFixes(
	dateIso?: string,
): UseAgencyAttendanceFixesResult {
	const { logout } = useAuth();
	const backed = getAgencyIdentity() !== null;
	// The attendance feed carries prId and prName but no photo. The agency's own
	// BACKEND roster already holds the resolved one, so the face costs a lookup
	// rather than a new backend field — and it must be the backend roster, not
	// the demo store, which is empty on exactly the sessions this panel serves.
	const prPhotoById = usePrPhotoById();

	const query = useQuery({
		queryKey: ["agency", "attendance-fixes", dateIso ?? "today"] as const,
		queryFn: () => fetchAttendanceFixes({ date: dateIso }, logout),
		enabled: backed,
		staleTime: 60_000,
	});

	const fixes = useMemo<AttendanceFix[]>(
		() => query.data?.data ?? [],
		[query.data],
	);

	return useMemo(
		() => ({
			backed,
			isLoading: query.isLoading,
			...buildAttendanceGroups(fixes, prPhotoById),
		}),
		[fixes, backed, query.isLoading, prPhotoById],
	);
}
