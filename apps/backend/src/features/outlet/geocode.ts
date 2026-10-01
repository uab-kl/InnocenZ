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
export type GeocodePrecision =
  | 'ROOFTOP'
  | 'RANGE_INTERPOLATED'
  | 'GEOMETRIC_CENTER'
  | 'APPROXIMATE'
  /** A named Google Maps place from Places search, which reports no location_type. */
  | 'PLACE';

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
  /** Google matched only PART of the query (its own `partial_match`). */
  partialMatch: boolean;
  /**
   * Does Google's address for this place name a street at all? A named place
   * can come back with no street — "Kompleks Perindustrian EmHub, Persiaran
   * Surian, Seksyen 3…" answers "Kota Damansara, 47810 Petaling Jaya": the pin
   * is the complex, but its address is thinner than the one the operator typed.
   */
  hasStreet: boolean;
  /**
   * Google knows this match as a named place (an establishment or point of
   * interest), not just an address. "Emhub" is one although its listing has
   * no street, so its GEOMETRIC_CENTER is that place's own pin, not a block's.
   */
  isPlace: boolean;
  /** The place's own name ("1 Utama Shopping Centre") — Places search only. */
  name?: string;
}

/** Result types that make a match a named place rather than an address. */
const PLACE_TYPES = ['establishment', 'point_of_interest'];

/** Component types that put a match at street level or finer. */
const STREET_TYPES = ['street_number', 'route', 'premise', 'subpremise', 'street_address'];

/** One Google geocoding result, as the geocode API's `results[]` carries it. */
export interface GoogleGeocodeResult {
  formatted_address: string;
  place_id: string;
  partial_match?: boolean;
  types?: string[];
  address_components?: GoogleAddressComponent[];
  geometry: { location: { lat: number; lng: number }; location_type: GeocodePrecision };
}

/** One Google result -> the candidate the operator picks from. */
export function candidateFromResult(result: GoogleGeocodeResult): GeocodeCandidate {
  return {
    formattedAddress: result.formatted_address,
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    precision: result.geometry.location_type,
    placeId: result.place_id,
    components: addressPartsFromComponents(result.address_components, result.formatted_address),
    partialMatch: result.partial_match === true,
    isPlace: (result.types ?? []).some((type) => PLACE_TYPES.includes(type)),
    hasStreet: (result.address_components ?? []).some((component) =>
      component.types.some((type) => STREET_TYPES.includes(type)),
    ),
  };
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
      results?: GoogleGeocodeResult[];
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

    const candidates: GeocodeCandidate[] = (body.results ?? []).slice(0, 5).map(candidateFromResult);

    if (candidates.length === 0) {
      return { ok: false, reason: 'no_match', message: 'No location matched that address.' };
    }
    return { ok: true, candidates };
  } catch (error) {
    logger.error('[geocodeAddress] Error:', error);
    return { ok: false, reason: 'upstream', message: 'Address lookup failed. Drop the pin on the map instead.' };
  }
}

// ─── Places search: the several places a name can mean ─────────────────────

const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.addressComponents',
].join(',');

/** One place as Places API (New) Text Search returns it — the fields asked for. */
export interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  addressComponents?: Array<{ longText: string; shortText: string; types: string[] }>;
}

/** One Places result -> a candidate; null for a place with no location. */
export function candidateFromPlace(place: GooglePlace): GeocodeCandidate | null {
  if (!place.location) return null;
  const components: GoogleAddressComponent[] = (place.addressComponents ?? []).map((part) => ({
    long_name: part.longText,
    short_name: part.shortText,
    types: part.types,
  }));
  const formattedAddress = place.formattedAddress ?? '';
  return {
    formattedAddress,
    lat: place.location.latitude,
    lng: place.location.longitude,
    precision: 'PLACE',
    placeId: place.id,
    components: addressPartsFromComponents(components, formattedAddress),
    partialMatch: false,
    isPlace: true,
    hasStreet: components.some((part) => part.types.some((type) => STREET_TYPES.includes(type))),
    name: place.displayName?.text?.trim() || undefined,
  };
}

/** Logged once per process: a blocked API is config, not a per-request fault. */
let placesBlockedLogged = false;

/**
 * Named places matching free text — the list Google Maps itself would offer.
 *
 * The Geocoding API answers ONE best match: "1 Utama", "Sunway Pyramid" and
 * UAB Emhub's own address each came back as a single result (29 Sep 2026), so
 * an operator could never choose between the places a name can mean. Needs
 * "Places API (New)" enabled for GOOGLE_MAPS_API_KEY; until it is, Google
 * answers 403 and `searchLocations` falls back to the geocoder.
 */
export async function searchPlaces(query: string): Promise<GeocodeOutcome> {
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return {
      ok: false,
      reason: 'not_configured',
      message: 'Address lookup is not configured on this server (GOOGLE_MAPS_API_KEY is unset). Drop the pin on the map instead.',
    };
  }
  try {
    const res = await fetch(PLACES_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': PLACES_FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, regionCode: 'MY', languageCode: 'en', pageSize: 5 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      if (res.status !== 403) {
        logger.error(`[searchPlaces] Google responded ${res.status}`);
      } else if (!placesBlockedLogged) {
        placesBlockedLogged = true;
        logger.warn(
          '[searchPlaces] Places API (New) is not enabled for GOOGLE_MAPS_API_KEY — address search falls back to the Geocoding API, which offers one match',
        );
      }
      return { ok: false, reason: 'upstream', message: 'Place search is unavailable right now.' };
    }
    const body = (await res.json()) as { places?: GooglePlace[] };
    const candidates = (body.places ?? [])
      .map(candidateFromPlace)
      .filter((candidate): candidate is GeocodeCandidate => candidate !== null)
      .slice(0, 5);
    if (candidates.length === 0) {
      return { ok: false, reason: 'no_match', message: 'No location matched that address.' };
    }
    return { ok: true, candidates };
  } catch (error) {
    logger.error('[searchPlaces] Error:', error);
    return { ok: false, reason: 'upstream', message: 'Place search failed.' };
  }
}

/**
 * An operator's typed search: the places Google Maps knows by that name first,
 * then the Geocoding API's single best match when Places is unavailable or
 * finds nothing. A missing key is reported as-is — the geocoder needs it too.
 */
export async function searchLocations(
  query: string,
  deps: {
    searchPlaces: (query: string) => Promise<GeocodeOutcome>;
    geocodeAddress: (address: string) => Promise<GeocodeOutcome>;
  } = { searchPlaces, geocodeAddress },
): Promise<GeocodeOutcome> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { ok: false, reason: 'no_match', message: 'Enter an address to look up.' };
  }
  const places = await deps.searchPlaces(trimmed);
  if (places.ok || places.reason === 'not_configured') return places;
  return deps.geocodeAddress(trimmed);
}
