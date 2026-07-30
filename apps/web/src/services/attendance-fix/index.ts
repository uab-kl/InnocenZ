import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

/**
 * One attendance stamp and where the device was standing when it was taken.
 *
 * `at` travels with every coordinate on purpose. These are snapshots from
 * check-in and check-out — the system stores nothing in between — so a position
 * shown without its time reads as a current location, which it is not.
 *
 * `lat`/`lng` are null when the stamp exists but no fix was stored: rows that
 * predate the geofence columns, or a venue with no pin. `distanceM` is the
 * server's own recomputed metres from the venue pin, never a distance the phone
 * claimed, so prefer it over recomputing from the coordinates.
 */
export interface AttendanceStamp {
	at: string;
	lat: number | null;
	lng: number | null;
	distanceM: number | null;
	accuracyM: number | null;
}

export interface AttendanceFixOutlet {
	id: string;
	name: string | null;
	lat: number | null;
	lng: number | null;
	/** The venue's own fence radius. Null when it has never been set. */
	radiusM: number | null;
	/**
	 * False means the venue has no saved pin, so check-in there ran with no
	 * location check at all. "In range" is meaningless on those rows and must not
	 * be rendered as either pass or fail.
	 */
	pinned: boolean;
}

/**
 * A rostered PR on one date, with whatever attendance positions exist for them.
 *
 * Three states arrive distinctly and none is a guess:
 *   - `checkIn === null`            not stamped yet
 *   - `checkIn` set, its lat null   stamped, no location recorded
 *   - `checkIn` set with lat/lng    stamped with a real fix
 */
export interface AttendanceFix {
	assignmentId: string;
	prId: string;
	prName: string;
	/**
	 * The assignment's lifecycle status. Left as a string rather than a local
	 * union: the enum lives in the backend model, and a hand-copied union here
	 * would silently miss a value the day one is added.
	 */
	status: string;
	shiftDate: string;
	slot: string | null;
	outlet: AttendanceFixOutlet;
	checkIn: AttendanceStamp | null;
	checkOut: AttendanceStamp | null;
}

export interface AttendanceFixesApiResponse {
	success: boolean;
	message: string;
	data: AttendanceFix[];
}

/**
 * Attendance positions for the caller's own agency on one date.
 *
 * No `agencyId` param: the controller resolves the caller's agency server-side
 * and ignores anything the client sends, so passing one would only suggest this
 * filter is what enforces scope. `date` defaults to the server's today.
 */
export async function fetchAttendanceFixes(
	params: { date?: string },
	onRefreshFail: () => void,
): Promise<AttendanceFixesApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({ date: params.date });
	const response = await client.get<AttendanceFixesApiResponse>(
		`/shift-assignment/attendance-fixes${queryString}`,
	);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
	};
}
