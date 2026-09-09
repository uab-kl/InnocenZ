import { describe, expect, it } from 'vitest';
import { addressPartsFromComponents } from './geocode';

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
