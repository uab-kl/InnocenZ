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

/**
 * The six address columns an outlet row stores, as this candidate would write
 * them.
 *
 * A candidate used to carry coordinates only, so committing one found from a
 * typed address moved the pin and left `address_line_1` describing the OLD
 * venue — the two then named different places, and nothing on screen said
 * which one the fence was measuring from. Carrying the address the pin came
 * from is what lets one save keep both halves in step.
 */
export interface GeocodeAddressParts {
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  state: string;
  country: string;
}

/** One entry of Google's `address_components` array. */
interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

export interface GeocodeCandidate {
  formattedAddress: string;
  lat: number;
  lng: number;
  /** ROOFTOP is a real building; APPROXIMATE can be a whole suburb. */
  precision: GeocodePrecision;
  placeId: string;
  /** The same place, split into the outlet's address columns. */
  components: GeocodeAddressParts;
}

/** Non-empty parts, comma-joined — Google's own order, no invented words. */
function joinParts(parts: Array<string | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(', ');
}

const lower = (value: string) => value.trim().toLowerCase();

/**
 * `formatted_address` minus the tail the structured columns already carry.
 *
 * Trimming from the END only, and stopping at the first segment that does not
 * match: a street legitimately named after its city ("Jalan Kuala Lumpur")
 * must survive, and it would not if this filtered the whole list.
 */
function streetSegments(
  formattedAddress: string,
  tail: { city: string; state: string; postcode: string; country: string },
): string[] {
  const known = new Set(
    [
      tail.country,
      tail.state,
      tail.city,
      tail.postcode,
      // Google prints the pair as one segment: "47810 Petaling Jaya".
      `${tail.postcode} ${tail.city}`,
    ]
      .map((part) => lower(part))
      .filter(Boolean),
  );

  const segments = formattedAddress
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);
  let end = segments.length;
  while (end > 0 && known.has(lower(segments[end - 1] as string))) end -= 1;
  return segments.slice(0, end);
}

/**
 * One geocoded match -> the outlet's six address columns.
 *
 * City / postcode / state / country come from the COMPONENTS, which are the
 * only reliable way to tell a suburb from a city — a positional split of the
 * formatted string puts one in the other's column as often as not.
 *
 * Lines 1 and 2 come from the formatted string instead, precisely because it
 * is what the operator just read on the candidate card. Rebuilding them from
 * `premise` + `street_number` + `route` silently drops everything Google
 * carries in component types nobody enumerated — a floor, an atrium, a wing —
 * so the address saved would be thinner than the one they picked. The split
 * point is the route: everything up to the street goes on line 1, the rest
 * (the taman, the section) on line 2.
 */
export function addressPartsFromComponents(
  components: GoogleAddressComponent[] | undefined,
  formattedAddress: string,
): GeocodeAddressParts {
  const list = components ?? [];
  const pick = (type: string): string =>
    list.find((component) => component.types.includes(type))?.long_name.trim() ?? '';

  const city =
    pick('locality') || pick('administrative_area_level_2') || pick('sublocality_level_1');
  const state = pick('administrative_area_level_1');
  const postcode = pick('postal_code');
  const country = pick('country');

  const head = streetSegments(formattedAddress, { city, state, postcode, country });
  const route = pick('route');
  const routeAt = route
    ? head.findIndex((segment) => lower(segment).includes(lower(route)))
    : -1;
  const split = routeAt >= 0 ? routeAt + 1 : 1;

  // No formatted address to read (an empty or unparseable match) — rebuild the
  // street line from whatever components did come back rather than saving "".
  const fallback = joinParts([
    pick('premise') || pick('establishment') || pick('point_of_interest'),
    pick('subpremise'),
    [pick('street_number'), route].filter(Boolean).join(' '),
  ]);

  return {
    addressLine1: head.slice(0, split).join(', ') || fallback,
    addressLine2: head.length > split ? head.slice(split).join(', ') : '',
    city,
    postcode,
    state,
    country,
  };
}

export type GeocodeOutcome =
  | { ok: true; candidates: GeocodeCandidate[] }
  | { ok: false; reason: 'not_configured' | 'no_match' | 'upstream'; message: string };

/** Joins an outlet's stored address columns into one query string. */
export function addressQueryFromOutlet(outlet: {
  name?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postcode?: string | null;
  state?: string | null;
  country?: string | null;
}): string {
  return [
    outlet.name,
    outlet.addressLine1,
    outlet.addressLine2,
    outlet.city,
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
        address_components?: GoogleAddressComponent[];
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
      components: addressPartsFromComponents(r.address_components, r.formatted_address),
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
