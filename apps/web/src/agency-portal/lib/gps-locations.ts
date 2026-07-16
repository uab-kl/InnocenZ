import type {
  AgencyManagedPR,
  AgencyRosterSlot,
} from '@agency-portal/lib/agency-demo';
import { resolveRosterPrName } from '@agency-portal/lib/agency-demo';

export interface GeoCoord {
  lat: number;
  lng: number;
}

export const OUTLET_GPS: Record<string, GeoCoord & { address: string }> = {
  'Velvet 23': { lat: 3.1478, lng: 101.7005, address: 'Bukit Bintang, KL' },
  Mermate: { lat: 3.158, lng: 101.714, address: 'Changkat, KL' },
  'Bear Lounge': { lat: 3.139, lng: 101.686, address: 'Bangsar, KL' },
  'Onyx KL': { lat: 3.152, lng: 101.708, address: 'KLCC, KL' },
  'Urban Soul': { lat: 3.145, lng: 101.695, address: 'Pavilion, KL' },
};

export const PLACE_GPS: Record<string, GeoCoord> = {
  KL: { lat: 3.139, lng: 101.687 },
  PJ: { lat: 3.1073, lng: 101.6067 },
  'Shah Alam': { lat: 3.0733, lng: 101.5185 },
  'Mont Kiara': { lat: 3.1725, lng: 101.6508 },
};

export const GEOFENCE_METERS = 50;

export function resolveOutletGps(
  outlet: string,
): GeoCoord & { address: string } {
  const trimmed = outlet.trim();
  if (OUTLET_GPS[trimmed]) return OUTLET_GPS[trimmed];
  const withoutKl = trimmed.replace(/\s+KL$/i, '').trim();
  if (OUTLET_GPS[withoutKl]) return OUTLET_GPS[withoutKl];
  return OUTLET_GPS['Velvet 23'];
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
  const withoutKl = trimmed.replace(/\s+KL$/i, '').trim();
  return OUTLET_GPS[withoutKl] ? withoutKl : trimmed;
}

export interface GpsTrackingRow {
  slotId: string;
  prId: string;
  prName: string;
  outlet: string;
  status: 'on-duty' | 'en-route';
  meters: number;
  inRange: boolean;
  gpsFallback?: boolean;
  prCoord: GeoCoord;
  outletCoord: GeoCoord;
}

export interface GpsMapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function hashSeed(id: string): number {
  return id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
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
  if (meters < 1000) return `${meters.toLocaleString('en-MY')} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export type PrCheckInGpsPhase = 'booked' | 'en-route';

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
  const { prId, outlet, phase, homePlace = 'KL', gpsFallback = false } = opts;
  const outletCoord = OUTLET_GPS[outlet] ?? OUTLET_GPS['Velvet 23'];
  const home = PLACE_GPS[homePlace] ?? PLACE_GPS.KL;

  let prCoord: GeoCoord;
  if (phase === 'en-route') {
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
  if (inRange) return { left: '50%', top: '50%' };
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
  const scale = TILE_SIZE * Math.pow(2, zoom);
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
  const scale = TILE_SIZE * Math.pow(2, zoom);
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
  const n = Math.pow(2, zoom);
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

export function buildGpsTrackingRows(
  roster: AgencyRosterSlot[],
  agencyPRs: AgencyManagedPR[],
  dateIso: string,
  prCheckInMeta?: { gpsFallback?: boolean },
  activePrId?: string,
): GpsTrackingRow[] {
  const slots = roster.filter(
    (s) => s.dateIso === dateIso && s.status === 'on-duty' && !!s.checkedInAt,
  );

  return slots.map((slot) => {
    const outletCoord = OUTLET_GPS[slot.outlet] ?? OUTLET_GPS['Velvet 23'];
    const prCoord = coordOnDutyAtOutlet(outletCoord, slot.prId);
    const meters = metersBetween(prCoord, outletCoord);
    const status = 'on-duty' as const;

    const gpsFallback =
      activePrId === slot.prId && prCheckInMeta?.gpsFallback === true;

    return {
      slotId: slot.id,
      prId: slot.prId,
      prName: resolveRosterPrName(slot.prId, slot.prName, agencyPRs),
      outlet: slot.outlet,
      status,
      meters: gpsFallback ? Math.max(meters, 120) : meters,
      inRange: gpsFallback ? false : meters <= GEOFENCE_METERS,
      gpsFallback,
      prCoord,
      outletCoord,
    };
  });
}

export function uniqueOutletPins(
  rows: GpsTrackingRow[],
): { outlet: string; coord: GeoCoord }[] {
  const seen = new Set<string>();
  const pins: { outlet: string; coord: GeoCoord }[] = [];
  for (const row of rows) {
    if (seen.has(row.outlet)) continue;
    seen.add(row.outlet);
    pins.push({ outlet: row.outlet, coord: row.outletCoord });
  }
  return pins;
}

export function gpsMapBounds(rows: GpsTrackingRow[]): GpsMapBounds {
  const coords = rows.flatMap((r) => [r.prCoord, r.outletCoord]);
  if (coords.length === 0) {
    const v = OUTLET_GPS['Velvet 23'];
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

/** Geofence diameter in screen px — matches map zoom (no shrink cap) */
export function geofenceDiameterPx(zoom: number, lat = 3.15): number {
  const metersPerPixel =
    (156543.03 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  return (GEOFENCE_METERS * 2) / metersPerPixel;
}
