import type {
	AgencyManagedPR,
	AgencyRosterSlot,
} from "@agency-portal/lib/agency-demo";
import {
	findAgencyManagedPr,
	resolveAgencyPrPhoto,
	resolveRosterPrName,
} from "@agency-portal/lib/agency-demo";

export interface GeoCoord {
	lat: number;
	lng: number;
}

export const OUTLET_GPS: Record<string, GeoCoord & { address: string }> = {
	"Velvet 23": { lat: 3.1478, lng: 101.7005, address: "Bukit Bintang, KL" },
	Mermate: { lat: 3.158, lng: 101.714, address: "Changkat, KL" },
	"Bear Lounge": { lat: 3.139, lng: 101.686, address: "Bangsar, KL" },
	"Onyx KL": { lat: 3.152, lng: 101.708, address: "KLCC, KL" },
	"Urban Soul": { lat: 3.145, lng: 101.695, address: "Pavilion, KL" },
};

export const PLACE_GPS: Record<string, GeoCoord> = {
	KL: { lat: 3.139, lng: 101.687 },
	PJ: { lat: 3.1073, lng: 101.6067 },
	"Shah Alam": { lat: 3.0733, lng: 101.5185 },
	"Mont Kiara": { lat: 3.1725, lng: 101.6508 },
};

export const GEOFENCE_METERS = 50;

export function resolveOutletGps(
	outlet: string,
): GeoCoord & { address: string } {
	const trimmed = outlet.trim();
	if (OUTLET_GPS[trimmed]) return OUTLET_GPS[trimmed];
	const withoutKl = trimmed.replace(/\s+KL$/i, "").trim();
	if (OUTLET_GPS[withoutKl]) return OUTLET_GPS[withoutKl];
	return OUTLET_GPS["Velvet 23"];
}

export function checkWithinOutletGeofence(
	outlet: string,
	prCoord: GeoCoord,
	geofenceMeters = GEOFENCE_METERS,
): {
	ok: boolean;
	meters: number;
	geofenceMeters: number;
	outlet: string;
	outletCoord: GeoCoord;
	prCoord: GeoCoord;
} {
	const outletGps = resolveOutletGps(outlet);
	const outletCoord = { lat: outletGps.lat, lng: outletGps.lng };
	const meters = metersBetween(prCoord, outletCoord);
	return {
		ok: meters <= geofenceMeters,
		meters,
		geofenceMeters,
		outlet: trimmedOutletLabel(outlet),
		outletCoord,
		prCoord,
	};
}

function trimmedOutletLabel(outlet: string): string {
	const trimmed = outlet.trim();
	if (OUTLET_GPS[trimmed]) return trimmed;
	const withoutKl = trimmed.replace(/\s+KL$/i, "").trim();
	return OUTLET_GPS[withoutKl] ? withoutKl : trimmed;
}

export interface GpsTrackingRow {
	slotId: string;
	prId: string;
	prName: string;
	/**
	 * The PR's own photo, UNRESOLVED — the consumer runs it through
	 * `prPhotoSrc`. Null when the roster row matches no managed PR, or that PR
	 * has no photo on file; the panels fall back to the name's initial.
	 */
	prPhoto: string | null;
	outlet: string;
	status: "on-duty" | "en-route";
	meters: number;
	inRange: boolean;
	gpsFallback?: boolean;
	prCoord: GeoCoord;
	outletCoord: GeoCoord;
	/**
	 * True when `prCoord` is NOT a real device fix — no GPS was stored for this
	 * stamp, so the position is the demo ring around the venue. Nothing that
	 * reads as evidence (distance, in/out of fence) should be presented as fact
	 * on an estimated row; the UI labels them instead.
	 */
	estimated?: boolean;
	/** The outlet's own fence radius in metres — 50 only when it has none set. */
	radiusM: number;
	/** The device's self-reported confidence radius at the stamp, when stored. */
	accuracyM?: number;
	/**
	 * True when the venue has no saved pin, so `outletCoord` is a stand-in. The
	 * backend leaves these outlets unfenced, and so does this panel.
	 */
	outletUnpinned?: boolean;
	/**
	 * When this position was stamped, ISO. Optional because the demo generator
	 * has no real stamps behind its rows; the backed panel always sets it.
	 *
	 * A distance with no time is the bug this exists to close: one PR can hold
	 * rows at two venues on one date, and without the hour there is nothing on
	 * either row to say which of them is current.
	 */
	checkInAt?: string;
	/** When they checked out, ISO. Absent while the check-in is still open. */
	checkOutAt?: string;
	/**
	 * A venue where this PR stamped in LATER, set only on a row whose own
	 * check-out never happened. That pair — still open here, already in
	 * somewhere else — is the only honest way to order two open check-ins, and
	 * it is what tells the reader which card has gone stale.
	 */
	sinceCheckedInAt?: string;
}

export interface GpsMapBounds {
	minLat: number;
	maxLat: number;
	minLng: number;
	maxLng: number;
}

function hashSeed(id: string): number {
	return id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
}

/** Deterministic offset in meters from a point */
function offsetMeters(
	origin: GeoCoord,
	seed: string,
	distMeters: number,
	angleDeg?: number,
): GeoCoord {
	const h = hashSeed(seed);
	const angle = ((angleDeg ?? h % 360) * Math.PI) / 180;
	const dLat = (distMeters / 111_320) * Math.cos(angle);
	const dLng =
		(distMeters / (111_320 * Math.cos((origin.lat * Math.PI) / 180))) *
		Math.sin(angle);
	return { lat: origin.lat + dLat, lng: origin.lng + dLng };
}

/** On-duty PRs — ring around venue so pins don't stack (demo: checked in at floor) */
function coordOnDutyAtOutlet(outlet: GeoCoord, seed: string): GeoCoord {
	const h = hashSeed(seed);
	const angle = (h % 72) * 5;
	const dist = 14 + (h % 22);
	return offsetMeters(outlet, seed, dist, angle);
}

/** En-route PRs — still outside geofence, heading to venue */
function coordEnRouteToOutlet(
	outlet: GeoCoord,
	home: GeoCoord,
	seed: string,
): GeoCoord {
	const bearing =
		(Math.atan2(home.lng - outlet.lng, home.lat - outlet.lat) * 180) / Math.PI +
		180;
	const h = hashSeed(seed);
	const dist = 120 + (h % 380);
	return offsetMeters(outlet, seed, dist, bearing + ((h % 40) - 20));
}

export function formatDistanceMeters(meters: number): string {
	if (meters < 1000) return `${meters.toLocaleString("en-MY")} m`;
	return `${(meters / 1000).toFixed(1)} km`;
}

export type PrCheckInGpsPhase = "booked" | "en-route";

export function computePrCheckInGpsState(opts: {
	prId: string;
	outlet: string;
	phase: PrCheckInGpsPhase;
	homePlace?: string;
	gpsFallback?: boolean;
}): {
	meters: number;
	inRange: boolean;
	outletCoord: GeoCoord;
	prCoord: GeoCoord;
	geofenceMeters: number;
} {
	const { prId, outlet, phase, homePlace = "KL", gpsFallback = false } = opts;
	const outletCoord = OUTLET_GPS[outlet] ?? OUTLET_GPS["Velvet 23"];
	const home = PLACE_GPS[homePlace] ?? PLACE_GPS.KL;

	let prCoord: GeoCoord;
	if (phase === "en-route") {
		prCoord = coordEnRouteToOutlet(outletCoord, home, prId);
	} else {
		prCoord = home;
	}

	let meters = metersBetween(prCoord, outletCoord);
	if (gpsFallback) {
		meters = Math.max(meters, GEOFENCE_METERS + 70);
	}

	return {
		meters,
		inRange: !gpsFallback && meters <= GEOFENCE_METERS,
		outletCoord,
		prCoord,
		geofenceMeters: GEOFENCE_METERS,
	};
}

/** Mini-map ping offset from venue center (percent) */
export function prGpsPingOffset(
	meters: number,
	inRange: boolean,
	seed: string,
): { left: string; top: string } {
	if (inRange) return { left: "50%", top: "50%" };
	const maxDisplay = 420;
	const ratio = Math.min(meters / maxDisplay, 0.88);
	const angle = 38 + (hashSeed(seed) % 50);
	const rad = (angle * Math.PI) / 180;
	const r = ratio * 38;
	return {
		left: `${50 + r * Math.cos(rad)}%`,
		top: `${50 - r * Math.sin(rad)}%`,
	};
}

export function metersBetween(a: GeoCoord, b: GeoCoord): number {
	const km =
		Math.sqrt(
			(a.lat - b.lat) ** 2 +
				((a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180)) ** 2,
		) * 111.32;
	return Math.round(km * 1000);
}

const TILE_SIZE = 256;

/** Web Mercator — pixel position at zoom (top-left of world = 0,0) */
export function mercatorPixel(
	coord: GeoCoord,
	zoom: number,
): { x: number; y: number } {
	const scale = TILE_SIZE * 2 ** zoom;
	const x = ((coord.lng + 180) / 360) * scale;
	const sinLat = Math.sin((coord.lat * Math.PI) / 180);
	const y =
		(0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
	return { x, y };
}

export function mercatorToCoord(
	px: { x: number; y: number },
	zoom: number,
): GeoCoord {
	const scale = TILE_SIZE * 2 ** zoom;
	const lng = (px.x / scale) * 360 - 180;
	const lat =
		(Math.atan(Math.sinh(Math.PI - (2 * Math.PI * px.y) / scale)) * 180) /
		Math.PI;
	return { lat, lng };
}

/** Shift map center after a screen-space drag (dx/dy = pointer delta in px) */
export function panCenterByPixels(
	center: GeoCoord,
	zoom: number,
	dx: number,
	dy: number,
): GeoCoord {
	const c = mercatorPixel(center, zoom);
	return mercatorToCoord({ x: c.x - dx, y: c.y - dy }, zoom);
}

export function boundsCenter(bounds: GpsMapBounds): GeoCoord {
	return {
		lat: (bounds.minLat + bounds.maxLat) / 2,
		lng: (bounds.minLng + bounds.maxLng) / 2,
	};
}

/** Pick zoom so all bounds fit in viewport with padding */
export function pickMapZoom(
	bounds: GpsMapBounds,
	width: number,
	height: number,
): number {
	const pad = 1.35;
	for (let z = 18; z >= 11; z--) {
		const nw = mercatorPixel({ lat: bounds.maxLat, lng: bounds.minLng }, z);
		const se = mercatorPixel({ lat: bounds.minLat, lng: bounds.maxLng }, z);
		if ((se.x - nw.x) * pad <= width && (se.y - nw.y) * pad <= height) return z;
	}
	return 13;
}

export function coordToViewport(
	coord: GeoCoord,
	center: GeoCoord,
	zoom: number,
	width: number,
	height: number,
): { x: number; y: number } {
	const c = mercatorPixel(center, zoom);
	const p = mercatorPixel(coord, zoom);
	return {
		x: width / 2 + (p.x - c.x),
		y: height / 2 + (p.y - c.y),
	};
}

export interface MapTilePlacement {
	x: number;
	y: number;
	z: number;
	left: number;
	top: number;
}

export function tileRange(
	center: GeoCoord,
	zoom: number,
	width: number,
	height: number,
): MapTilePlacement[] {
	const c = mercatorPixel(center, zoom);
	const leftWorld = c.x - width / 2;
	const topWorld = c.y - height / 2;
	const x0 = Math.floor(leftWorld / TILE_SIZE);
	const y0 = Math.floor(topWorld / TILE_SIZE);
	const x1 = Math.floor((leftWorld + width) / TILE_SIZE);
	const y1 = Math.floor((topWorld + height) / TILE_SIZE);
	const tiles: MapTilePlacement[] = [];
	const n = 2 ** zoom;
	for (let x = x0; x <= x1; x++) {
		for (let y = y0; y <= y1; y++) {
			if (x < 0 || y < 0 || x >= n || y >= n) continue;
			tiles.push({
				x,
				y,
				z: zoom,
				left: x * TILE_SIZE - leftWorld,
				top: y * TILE_SIZE - topWorld,
			});
		}
	}
	return tiles;
}

function boundsFromCoords(coords: GeoCoord[], pad = 0.0018): GpsMapBounds {
	const lats = coords.map((c) => c.lat);
	const lngs = coords.map((c) => c.lng);
	return {
		minLat: Math.min(...lats) - pad,
		maxLat: Math.max(...lats) + pad,
		minLng: Math.min(...lngs) - pad,
		maxLng: Math.max(...lngs) + pad,
	};
}

/**
 * Today's live GPS rows for the agency map.
 *
 * Both coordinates here are REAL wherever real data exists: the venue comes
 * from the outlet's own saved pin, and the PR dot comes from the fix the
 * phone sent at check-in, which the backend already verified against that pin
 * and stored. The distance shown is the backend's own haversine result — the
 * number the fence was actually judged on — not a second, slightly different
 * measurement taken here.
 *
 * The hash-seeded ring below survives for exactly one reason: demo roster
 * slots, and rows stamped before geofencing shipped, have no fix at all. Those
 * rows are flagged `estimated` so the panel can say so rather than let an
 * invented dot pass for evidence. Do not extend that path to real slots.
 */
export function buildGpsTrackingRows(
	roster: AgencyRosterSlot[],
	agencyPRs: AgencyManagedPR[],
	dateIso: string,
	prCheckInMeta?: { gpsFallback?: boolean },
	activePrId?: string,
): GpsTrackingRow[] {
	const slots = roster.filter(
		(s) => s.dateIso === dateIso && s.status === "on-duty" && !!s.checkedInAt,
	);

	return slots.map((slot) => {
		// The outlet's saved pin wins outright. OUTLET_GPS only answers for the
		// five demo venues, and a real outlet that has dropped a pin never reaches
		// it — that table is a demo seed, not a location source.
		const pinned = slot.outletLat != null && slot.outletLng != null;
		const outletCoord: GeoCoord = pinned
			? { lat: slot.outletLat as number, lng: slot.outletLng as number }
			: (OUTLET_GPS[slot.outlet] ?? OUTLET_GPS["Velvet 23"]);

		// The venue's own fence, not a global constant. GEOFENCE_METERS is only the
		// default an outlet inherits when it has never set one.
		const radiusM = slot.outletGeoFenceRadiusM ?? GEOFENCE_METERS;

		const hasFix = slot.checkInLat != null && slot.checkInLng != null;
		const prCoord: GeoCoord = hasFix
			? { lat: slot.checkInLat as number, lng: slot.checkInLng as number }
			: coordOnDutyAtOutlet(outletCoord, slot.prId);

		// Prefer the server's stored distance: it is what the fence was decided on,
		// and recomputing it here with a different formula would let the panel
		// disagree with the decision it is reporting.
		const meters =
			hasFix && slot.checkInDistanceM != null
				? slot.checkInDistanceM
				: metersBetween(prCoord, outletCoord);

		const gpsFallback =
			activePrId === slot.prId && prCheckInMeta?.gpsFallback === true;

		// Same record the name already comes from, so the face and the name on a
		// row can never belong to two different people.
		const managed = findAgencyManagedPr(agencyPRs, slot.prId, slot.prName);

		return {
			slotId: slot.id,
			prId: slot.prId,
			prName: resolveRosterPrName(slot.prId, slot.prName, agencyPRs),
			prPhoto: managed ? resolveAgencyPrPhoto(managed) : null,
			outlet: slot.outlet,
			status: "on-duty" as const,
			meters: gpsFallback ? Math.max(meters, 120) : meters,
			// An unpinned venue is not fenced anywhere in the system, so this cannot
			// claim the PR is out of range — there is no range to be out of.
			inRange: gpsFallback ? false : !pinned || meters <= radiusM,
			gpsFallback,
			estimated: !hasFix,
			radiusM,
			accuracyM: slot.checkInAccuracyM,
			outletUnpinned: !pinned,
			prCoord,
			outletCoord,
		};
	});
}

export function uniqueOutletPins(
	rows: GpsTrackingRow[],
): { outlet: string; coord: GeoCoord; radiusM: number; unpinned: boolean }[] {
	const seen = new Set<string>();
	const pins: {
		outlet: string;
		coord: GeoCoord;
		radiusM: number;
		unpinned: boolean;
	}[] = [];
	for (const row of rows) {
		if (seen.has(row.outlet)) continue;
		seen.add(row.outlet);
		// Radius travels with the pin so the drawn circle is the fence the server
		// actually enforces for THIS venue, not a fixed 50 m everywhere.
		pins.push({
			outlet: row.outlet,
			coord: row.outletCoord,
			radiusM: row.radiusM,
			unpinned: !!row.outletUnpinned,
		});
	}
	return pins;
}

export function gpsMapBounds(rows: GpsTrackingRow[]): GpsMapBounds {
	const coords = rows.flatMap((r) => [r.prCoord, r.outletCoord]);
	if (coords.length === 0) {
		const v = OUTLET_GPS["Velvet 23"];
		return {
			minLat: v.lat - 0.01,
			maxLat: v.lat + 0.01,
			minLng: v.lng - 0.01,
			maxLng: v.lng + 0.01,
		};
	}
	return boundsFromCoords(coords);
}

export function mapsUrlForCoord(coord: GeoCoord): string {
	return `https://www.google.com/maps?q=${coord.lat},${coord.lng}`;
}

export function mapsDirectionsUrl(from: GeoCoord, to: GeoCoord): string {
	return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}`;
}

/**
 * Geofence diameter in screen px — matches map zoom (no shrink cap). Takes the
 * outlet's own radius so the drawn circle is the real fence; the default is
 * only for callers that have no outlet in hand.
 */
export function geofenceDiameterPx(
	zoom: number,
	lat = 3.15,
	radiusM = GEOFENCE_METERS,
): number {
	const metersPerPixel =
		(156543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
	return (radiusM * 2) / metersPerPixel;
}
