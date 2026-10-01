import { describe, expect, it } from 'vitest';
import { addressPartsFromComponents, candidateFromPlace, candidateFromResult, searchLocations } from './geocode';
import type { GeocodeCandidate, GeocodeOutcome } from './geocode';

/**
 * A pin that moves without its address leaves the venue describing two
 * different places — so a candidate has to carry the address columns it would
 * write, not just coordinates.
 */
describe('addressPartsFromComponents', () => {
  const emHub = [
    { long_name: 'Kompleks Perindustrian EmHub', short_name: 'EmHub', types: ['premise'] },
    { long_name: 'Persiaran Surian', short_name: 'Persiaran Surian', types: ['route'] },
    { long_name: 'Kota Damansara', short_name: 'Kota Damansara', types: ['neighborhood', 'political'] },
    { long_name: 'Taman Sains Selangor', short_name: 'Taman Sains Selangor', types: ['sublocality', 'sublocality_level_1'] },
    { long_name: 'Petaling Jaya', short_name: 'PJ', types: ['locality', 'political'] },
    { long_name: 'Selangor', short_name: 'Sgr', types: ['administrative_area_level_1', 'political'] },
    { long_name: '47810', short_name: '47810', types: ['postal_code'] },
    { long_name: 'Malaysia', short_name: 'MY', types: ['country', 'political'] },
  ];
  const emHubFormatted =
    'Kompleks Perindustrian EmHub, Persiaran Surian, Seksyen 3, Taman Sains Selangor, 47810 Petaling Jaya, Selangor, Malaysia';

  it('maps a full Malaysian result onto the six outlet address columns', () => {
    const parts = addressPartsFromComponents(emHub, emHubFormatted);

    expect(parts).toEqual({
      addressLine1: 'Kompleks Perindustrian EmHub, Persiaran Surian',
      addressLine2: 'Seksyen 3, Taman Sains Selangor',
      city: 'Petaling Jaya',
      postcode: '47810',
      state: 'Selangor',
      country: 'Malaysia',
    });
  });

  it('keeps the parts of the match that no component type carries', () => {
    // "Level CP6" and "Blue Atrium" come back in no component Google documents;
    // rebuilding line 1 from premise + street silently loses both, so the
    // address saved would be thinner than the one the operator picked.
    const parts = addressPartsFromComponents(
      [
        { long_name: 'Jalan PJS 11/15', short_name: 'Jalan PJS 11/15', types: ['route'] },
        { long_name: 'Petaling Jaya', short_name: 'PJ', types: ['locality'] },
        { long_name: 'Selangor', short_name: 'Sgr', types: ['administrative_area_level_1'] },
        { long_name: '47500', short_name: '47500', types: ['postal_code'] },
        { long_name: 'Malaysia', short_name: 'MY', types: ['country'] },
      ],
      'Level CP6, Blue Atrium, Darul Ehsan, 3, Jalan PJS 11/15, Bandar Sunway, 47500 Petaling Jaya, Selangor, Malaysia',
    );

    expect(parts.addressLine1).toBe('Level CP6, Blue Atrium, Darul Ehsan, 3, Jalan PJS 11/15');
    expect(parts.addressLine2).toBe('Bandar Sunway');
    expect(parts.city).toBe('Petaling Jaya');
    expect(parts.postcode).toBe('47500');
  });

  it('never repeats the city, state, postcode or country on the street lines', () => {
    const parts = addressPartsFromComponents(emHub, emHubFormatted);

    expect(`${parts.addressLine1} ${parts.addressLine2}`).not.toContain('Petaling Jaya');
    expect(`${parts.addressLine1} ${parts.addressLine2}`).not.toContain('47810');
    expect(`${parts.addressLine1} ${parts.addressLine2}`).not.toContain('Malaysia');
  });

  it('keeps a street named after its own city — the tail is trimmed from the end, not filtered', () => {
    const parts = addressPartsFromComponents(
      [
        { long_name: 'Jalan Kuala Lumpur', short_name: 'Jalan Kuala Lumpur', types: ['route'] },
        { long_name: 'Kuala Lumpur', short_name: 'KL', types: ['locality'] },
        { long_name: 'Malaysia', short_name: 'MY', types: ['country'] },
      ],
      'Jalan Kuala Lumpur, Kuala Lumpur, Malaysia',
    );

    expect(parts.addressLine1).toBe('Jalan Kuala Lumpur');
    expect(parts.city).toBe('Kuala Lumpur');
  });

  it('reads the city from the district when Google returns no locality', () => {
    const parts = addressPartsFromComponents(
      [
        { long_name: 'Jalan Tun Razak', short_name: 'Jalan Tun Razak', types: ['route'] },
        { long_name: 'Petaling', short_name: 'Petaling', types: ['administrative_area_level_2'] },
      ],
      'Jalan Tun Razak, Petaling, Malaysia',
    );

    expect(parts.city).toBe('Petaling');
  });

  it('rebuilds the street line from components when there is no formatted address', () => {
    const parts = addressPartsFromComponents(
      [
        { long_name: 'Menara ABC', short_name: 'Menara ABC', types: ['premise'] },
        { long_name: '12', short_name: '12', types: ['street_number'] },
        { long_name: 'Jalan Ampang', short_name: 'Jalan Ampang', types: ['route'] },
      ],
      '',
    );

    expect(parts.addressLine1).toBe('Menara ABC, 12 Jalan Ampang');
    expect(parts.addressLine2).toBe('');
  });

  it('returns blanks — not undefined — when there are no components at all', () => {
    expect(addressPartsFromComponents(undefined, '')).toEqual({
      addressLine1: '',
      addressLine2: '',
      city: '',
      postcode: '',
      state: '',
      country: '',
    });
  });
});

/**
 * What Google really answered for UAB Emhub on 29 Sep 2026: the complex itself
 * (an establishment, 1.39 km from the suburb's centre) but with no street in
 * its address, flagged as a partial match. The card must be able to tell that
 * apart from a street-level answer before it offers to replace an address.
 */
describe('candidateFromResult', () => {
  const geometry = { location: { lat: 3.15, lng: 101.58 }, location_type: 'GEOMETRIC_CENTER' as const };
  const areaOnly = [
    { long_name: 'Kota Damansara', short_name: 'Kota Damansara', types: ['sublocality', 'sublocality_level_1', 'political'] },
    { long_name: 'Petaling Jaya', short_name: 'PJ', types: ['locality', 'political'] },
    { long_name: 'Selangor', short_name: 'Sgr', types: ['administrative_area_level_1', 'political'] },
    { long_name: '47810', short_name: '47810', types: ['postal_code'] },
    { long_name: 'Malaysia', short_name: 'MY', types: ['country', 'political'] },
  ];

  it('flags a named place whose address has no street, matched only in part', () => {
    const candidate = candidateFromResult({
      formatted_address: 'Kota Damansara, 47810 Petaling Jaya, Selangor, Malaysia',
      place_id: 'emhub',
      partial_match: true,
      types: ['establishment', 'point_of_interest'],
      address_components: areaOnly,
      geometry,
    });
    expect(candidate).toMatchObject({
      partialMatch: true,
      hasStreet: false,
      isPlace: true,
      precision: 'GEOMETRIC_CENTER',
    });
    expect(candidate.components.addressLine1).toBe('Kota Damansara');
  });

  it('reads a route or a premise as street level, and a missing partial_match as a full match', () => {
    for (const type of ['route', 'premise', 'street_number']) {
      const candidate = candidateFromResult({
        formatted_address: 'Persiaran Surian, 47810 Petaling Jaya, Selangor, Malaysia',
        place_id: type,
        address_components: [{ long_name: 'Persiaran Surian', short_name: 'Persiaran Surian', types: [type] }, ...areaOnly],
        geometry,
      });
      expect(candidate).toMatchObject({ partialMatch: false, hasStreet: true });
    }
  });

  it('treats a result with no components at all as having no street', () => {
    const candidate = candidateFromResult({ formatted_address: '', place_id: 'bare', geometry });
    expect(candidate.hasStreet).toBe(false);
  });

  it('reads a plain road or suburb as an address, not a named place', () => {
    for (const types of [['route'], ['postal_code'], ['sublocality', 'political'], undefined]) {
      const candidate = candidateFromResult({ formatted_address: 'x', place_id: 'r', types, geometry });
      expect(candidate.isPlace).toBe(false);
    }
  });
});

/** "1 Utama" as Places search answers it: a named mall with a street. */
describe('candidateFromPlace', () => {
  it('carries the place name, a PLACE precision and the street-level address', () => {
    const candidate = candidateFromPlace({
      id: 'one-utama',
      displayName: { text: '1 Utama Shopping Centre' },
      formattedAddress: '1, Lebuh Bandar Utama, Bandar Utama, 47800 Petaling Jaya, Selangor, Malaysia',
      location: { latitude: 3.1502, longitude: 101.6155 },
      addressComponents: [
        { longText: '1', shortText: '1', types: ['street_number'] },
        { longText: 'Lebuh Bandar Utama', shortText: 'Lebuh Bandar Utama', types: ['route'] },
        { longText: 'Bandar Utama', shortText: 'Bandar Utama', types: ['sublocality_level_1', 'sublocality', 'political'] },
        { longText: 'Petaling Jaya', shortText: 'Petaling Jaya', types: ['locality', 'political'] },
        { longText: 'Selangor', shortText: 'Selangor', types: ['administrative_area_level_1', 'political'] },
        { longText: '47800', shortText: '47800', types: ['postal_code'] },
        { longText: 'Malaysia', shortText: 'MY', types: ['country', 'political'] },
      ],
    });
    expect(candidate).toMatchObject({
      name: '1 Utama Shopping Centre',
      precision: 'PLACE',
      placeId: 'one-utama',
      partialMatch: false,
      hasStreet: true,
      lat: 3.1502,
      lng: 101.6155,
    });
    expect(candidate?.components).toMatchObject({ city: 'Petaling Jaya', postcode: '47800', state: 'Selangor', country: 'Malaysia' });
  });

  it('drops a place that has no location to pin', () => {
    expect(candidateFromPlace({ id: 'nowhere', displayName: { text: 'Nowhere' } })).toBeNull();
  });
});

describe('searchLocations', () => {
  const place = { formattedAddress: 'a place', lat: 1, lng: 2, precision: 'PLACE', placeId: 'p' } as GeocodeCandidate;
  const geocoded = { formattedAddress: 'an address', lat: 3, lng: 4, precision: 'ROOFTOP', placeId: 'g' } as GeocodeCandidate;
  const ok = (candidates: GeocodeCandidate[]): GeocodeOutcome => ({ ok: true, candidates });
  const fail = (reason: 'not_configured' | 'no_match' | 'upstream'): GeocodeOutcome => ({ ok: false, reason, message: reason });

  it('answers from Places when Places finds something, without asking the geocoder', async () => {
    let geocoderAsked = false;
    const out = await searchLocations('1 Utama', {
      searchPlaces: async () => ok([place]),
      geocodeAddress: async () => {
        geocoderAsked = true;
        return ok([geocoded]);
      },
    });
    expect(out).toEqual(ok([place]));
    expect(geocoderAsked).toBe(false);
  });

  it('falls back to the geocoder when Places is blocked or finds nothing', async () => {
    for (const reason of ['upstream', 'no_match'] as const) {
      const out = await searchLocations('Kompleks Perindustrian EmHub', {
        searchPlaces: async () => fail(reason),
        geocodeAddress: async () => ok([geocoded]),
      });
      expect(out).toEqual(ok([geocoded]));
    }
  });

  it('reports a missing key as-is, and an empty query without calling Google', async () => {
    const calls: string[] = [];
    const deps = {
      searchPlaces: async (q: string) => {
        calls.push(q);
        return fail('not_configured');
      },
      geocodeAddress: async () => ok([geocoded]),
    };
    expect(await searchLocations('1 Utama', deps)).toMatchObject({ ok: false, reason: 'not_configured' });
    expect(await searchLocations('   ', deps)).toMatchObject({ ok: false, reason: 'no_match' });
    expect(calls).toEqual(['1 Utama']);
  });
});
