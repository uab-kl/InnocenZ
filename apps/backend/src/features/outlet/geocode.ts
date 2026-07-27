/**
 * Address -> map pin, via the Google Geocoding API.
 *
 * This is a CONVENIENCE for the operator dropping an outlet's pin: type the
 * venue's address, get candidate coordinates back, pick one. It deliberately
 * does not write anything. Saving a pin stays the job of
 * `PATCH /outlet/:id/geo-fence`, so there is exactly one code path that can
 * switch geofence enforcement on for a venue, and it is the one a human
 * confirms.
 *
 * Why that matters: the moment an outlet has lat/lng, every PR check-in at
 * that venue is hard-fenced (see shift-assignment/check-in-geofence.ts). A
 * geocoder that silently auto-saved a wrong rooftop could lock a whole night's
 * staff out of checking in. So the machine proposes; the human commits.
 *
 * Needs GOOGLE_MAPS_API_KEY, a SERVER key. The key in apps/mobile/app.json is
 * a client key restricted to the app's bundle id and will be rejected here.
 */
import { env } from '@/env';
import { logger } from '@/util/logger';

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

/** Google returns a rooftop/approximate hint; it is worth showing the operator. */
export type GeocodePrecision = 'ROOFTOP' | 'RANGE_INTERPOLATED' | 'GEOMETRIC_CENTER' | 'APPROXIMATE';

export interface GeocodeCandidate {
  formattedAddress: string;
  lat: number;
  lng: number;
  /** ROOFTOP is a real building; APPROXIMATE can be a whole suburb. */
  precision: GeocodePrecision;
  placeId: string;
}

export type GeocodeOutcome =
  | { ok: true; candidates: GeocodeCandidate[] }
  | { ok: false; reason: 'not_configured' | 'no_match' | 'upstream'; message: string };

/** Joins an outlet's stored address columns into one query string. */
export function addressQueryFromOutlet(outlet: {
  name?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postcode?: string | null;
  state?: string | null;
  country?: string | null;
}): string {
  return [
    outlet.name,
    outlet.addressLine1,
    outlet.addressLine2,
    outlet.postcode,
    outlet.state,
    outlet.country,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(', ');
}

export async function geocodeAddress(address: string): Promise<GeocodeOutcome> {
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    // Not an error the operator caused — say so plainly rather than 500.
    return {
      ok: false,
      reason: 'not_configured',
      message: 'Address lookup is not configured on this server (GOOGLE_MAPS_API_KEY is unset). Drop the pin on the map instead.',
    };
  }

  const query = address.trim();
  if (!query) {
    return { ok: false, reason: 'no_match', message: 'Enter an address to look up.' };
  }

  try {
    const url = `${GEOCODE_URL}?address=${encodeURIComponent(query)}&region=my&key=${encodeURIComponent(key)}`;
    // Never let a slow upstream hold an outlet request open indefinitely.
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      logger.error(`[geocodeAddress] Google responded ${res.status}`);
      return { ok: false, reason: 'upstream', message: 'Address lookup service is unavailable right now.' };
    }

    const body = (await res.json()) as {
      status: string;
      error_message?: string;
      results?: Array<{
        formatted_address: string;
        place_id: string;
        geometry: { location: { lat: number; lng: number }; location_type: GeocodePrecision };
      }>;
    };

    if (body.status === 'ZERO_RESULTS') {
      return { ok: false, reason: 'no_match', message: 'No location matched that address.' };
    }
    if (body.status !== 'OK') {
      // REQUEST_DENIED / OVER_QUERY_LIMIT — a server-side config problem, so it
      // is logged in full but not echoed to the caller.
      logger.error(`[geocodeAddress] Google status ${body.status}: ${body.error_message ?? ''}`);
      return { ok: false, reason: 'upstream', message: 'Address lookup service rejected the request.' };
    }

    const candidates: GeocodeCandidate[] = (body.results ?? []).slice(0, 5).map((r) => ({
      formattedAddress: r.formatted_address,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      precision: r.geometry.location_type,
      placeId: r.place_id,
    }));

    if (candidates.length === 0) {
      return { ok: false, reason: 'no_match', message: 'No location matched that address.' };
    }
    return { ok: true, candidates };
  } catch (error) {
    logger.error('[geocodeAddress] Error:', error);
    return { ok: false, reason: 'upstream', message: 'Address lookup failed. Drop the pin on the map instead.' };
  }
}
