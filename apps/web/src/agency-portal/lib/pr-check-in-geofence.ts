import {
	checkWithinOutletGeofence,
	formatDistanceMeters,
	GEOFENCE_METERS,
	type GeoCoord,
} from "@agency-portal/lib/gps-locations";

export type GeofenceBlockReason =
	| "out_of_range"
	| "permission_denied"
	| "position_unavailable"
	| "timeout"
	| "geolocation_unsupported";

export type GeofenceCheckResult =
	| {
			ok: true;
			meters: number;
			geofenceMeters: number;
			outlet: string;
			outletCoord: GeoCoord;
			prCoord: GeoCoord;
	  }
	| {
			ok: false;
			reason: GeofenceBlockReason;
			meters?: number;
			geofenceMeters: number;
			outlet: string;
			outletCoord?: GeoCoord;
			prCoord?: GeoCoord;
	  };

export const DEMO_RELAX_CHECK_IN_GEOFENCE = true;

export function geofenceBlockMessage(
	result: Extract<GeofenceCheckResult, { ok: false }>,
): string {
	switch (result.reason) {
		case "out_of_range":
			return `You are ${formatDistanceMeters(result.meters ?? 0)} from ${result.outlet}. Check in is only allowed within ${result.geofenceMeters}m.`;
		case "permission_denied":
			return "Location permission denied — enable GPS to check in at the outlet.";
		case "timeout":
			return "Could not get a GPS fix in time — move closer to the outlet and try again.";
		case "geolocation_unsupported":
			return "This device does not support GPS — check in requires location access.";
		default:
			return "Could not read your location — enable GPS and try again.";
	}
}

export function geofenceReminderMessage(
	result: Extract<GeofenceCheckResult, { ok: false }>,
): string {
	if (result.reason === "out_of_range") {
		return `Reminder: you are ${formatDistanceMeters(result.meters ?? 0)} from ${result.outlet}. At the venue, check-in is only allowed within ${result.geofenceMeters}m.`;
	}
	return `Reminder: check-in at ${result.outlet} requires GPS within ${result.geofenceMeters}m of the outlet.`;
}

export function readDevicePosition(timeoutMs = 12_000): Promise<GeoCoord> {
	return new Promise((resolve, reject) => {
		if (typeof navigator === "undefined" || !navigator.geolocation) {
			reject(Object.assign(new Error("geolocation_unsupported"), { code: 0 }));
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
			(err) => reject(err),
			{ enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
		);
	});
}

function mapGeolocationError(
	outlet: string,
	err: unknown,
	geofenceMeters = GEOFENCE_METERS,
): GeofenceCheckResult {
	const geoErr = err as GeolocationPositionError | undefined;
	if (geoErr?.code === 1) {
		return { ok: false, reason: "permission_denied", outlet, geofenceMeters };
	}
	if (geoErr?.code === 3) {
		return { ok: false, reason: "timeout", outlet, geofenceMeters };
	}
	if (
		geoErr?.code === 0 ||
		(err instanceof Error && err.message === "geolocation_unsupported")
	) {
		return {
			ok: false,
			reason: "geolocation_unsupported",
			outlet,
			geofenceMeters,
		};
	}
	return { ok: false, reason: "position_unavailable", outlet, geofenceMeters };
}

/** Read device GPS and verify the PR is within the outlet geofence before check-in. */
export async function verifyCheckInGeofence(
	outlet: string,
	geofenceMeters = GEOFENCE_METERS,
): Promise<GeofenceCheckResult> {
	const outletLabel =
		outlet
			.trim()
			.replace(/\s+KL$/i, "")
			.trim() || outlet.trim();

	try {
		const prCoord = await readDevicePosition();
		const check = checkWithinOutletGeofence(outlet, prCoord, geofenceMeters);
		if (!check.ok) {
			return { ok: false, reason: "out_of_range", ...check };
		}
		return { ok: true, ...check };
	} catch (err) {
		return mapGeolocationError(outletLabel, err, geofenceMeters);
	}
}
