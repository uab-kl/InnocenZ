import {
	findAgencyManagedPr,
	resolveAgencyPrPhoto,
} from "@agency-portal/lib/agency-demo";
import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import {
	GEOFENCE_METERS,
	type GpsTrackingRow,
} from "@agency-portal/lib/gps-locations";
import { useStore } from "@agency-portal/lib/store";
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
	prName: string;
	/** Unresolved photo reference; null when there is none. See `PrFaceBubble`. */
	prPhoto: string | null;
	slot: string | null;
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

export interface UseAgencyAttendanceFixesResult {
	/** False for demo sessions — the caller falls back to its demo panel. */
	backed: boolean;
	isLoading: boolean;
	groups: AttendanceOutletGroup[];
	rostered: number;
	stamped: number;
	withFix: number;
	/** Counted only across pinned venues, where the question means anything. */
	inRange: number;
	/** True when at least one venue on today's roster has no pin. */
	hasUnpinnedVenue: boolean;
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
	// roster already holds the resolved one, so the face costs a lookup rather
	// than a new backend field.
	const agencyPRs = useStore((s) => s.agencyPRs);

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

	return useMemo(() => {
		const byOutlet = new Map<string, AttendanceOutletGroup>();

		for (const fix of fixes) {
			const managed = findAgencyManagedPr(agencyPRs, fix.prId, fix.prName);
			const prPhoto = managed ? resolveAgencyPrPhoto(managed) : null;
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
				group.notArrived.push({
					assignmentId: fix.assignmentId,
					prName: fix.prName,
					prPhoto,
					slot: fix.slot,
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
			backed,
			isLoading: query.isLoading,
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
	}, [fixes, backed, query.isLoading, agencyPRs]);
}
