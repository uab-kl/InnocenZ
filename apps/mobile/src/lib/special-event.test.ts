// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test as globals.
import { translations } from '../i18n/translations';
import {
  eventKindLabel,
  eventPriceRows,
  specialEventName,
  specialEventSubtype,
  specialEventSubtypeLabel,
} from './special-event';

/*
 * WHICH SPECIAL NIGHT, IN WORDS (29 Sep 2026). Every PR screen printed a bare
 * "Special event" for a VIP night, a launch and "Other · Merdeka Celebration"
 * alike. The feed now carries the shift's own sub-type pair and its event
 * card's; these pin which one is shown, how, and the night's own prices.
 */

const EN = translations.en;
const ZH = translations.zh;

describe('the sub-type a special shift shows', () => {
  test("the shift's own pair wins — and is never mixed with the card's", () => {
    // Posted as a VIP night from a card that has since become "Other · Whisky".
    const shift = {
      eventKind: 'special',
      specialEventType: 'vip',
      customSpecialEventName: null,
      templateSpecialEventType: 'other',
      templateCustomEventName: 'Whisky tasting',
    };
    expect(specialEventSubtype(shift)).toEqual({ type: 'vip', customName: null });
    expect(specialEventSubtypeLabel(shift, EN)).toBe('VIP night');
  });

  test("a shift posted before 0167 falls back to its event card's pair", () => {
    const shift = {
      eventKind: 'special',
      specialEventType: null,
      templateSpecialEventType: 'other',
      templateCustomEventName: ' Merdeka Celebration ',
    };
    expect(specialEventSubtypeLabel(shift, EN)).toBe('Merdeka Celebration');
  });

  test('a normal shift has no sub-type, whatever a stale column still holds', () => {
    const shift = { eventKind: 'normal', specialEventType: 'vip', templateSpecialEventType: 'vip' };
    expect(specialEventSubtype(shift)).toBeNull();
    expect(eventKindLabel(shift, EN)).toBe('Normal shift');
  });

  test.each([
    ['vip', 'VIP night'],
    ['launch', 'Product launch'],
    ['private_table', 'Private table buyout'],
    ['brand_activation', 'Brand activation'],
    ['corporate', 'Corporate night'],
  ])('%s reads "%s" — and moves with the language', (type, english) => {
    const shift = { eventKind: 'special', specialEventType: type };
    expect(specialEventSubtypeLabel(shift, EN)).toBe(english);
    expect(specialEventSubtypeLabel(shift, ZH)).not.toBe(english);
  });

  test('an "Other" with no name, or a type this build does not know, says nothing rather than a raw code', () => {
    expect(specialEventSubtypeLabel({ eventKind: 'special', specialEventType: 'other' }, EN)).toBeNull();
    expect(
      specialEventSubtypeLabel({ eventKind: 'special', specialEventType: 'rooftop_party' }, EN),
    ).toBeNull();
    expect(eventKindLabel({ eventKind: 'special', specialEventType: 'rooftop_party' }, EN)).toBe(
      'Special event',
    );
  });

  test("the venue's typed name is its own text — never translated", () => {
    const shift = { eventKind: 'special', specialEventType: 'other', customSpecialEventName: 'Gin night' };
    expect(specialEventSubtypeLabel(shift, ZH)).toBe('Gin night');
  });
});

describe('what a card prints for the kind', () => {
  test('a special shift WITH a sub-type names it', () => {
    expect(
      eventKindLabel({ eventKind: 'special', eventName: 'Launch party', specialEventType: 'vip' }, EN),
    ).toBe('Special event · VIP night');
    expect(eventKindLabel({ eventKind: 'special', specialEventType: 'vip' }, ZH)).toBe(
      '特别活动 · VIP 之夜',
    );
  });

  test('a special shift with none is still a plain "Special event"', () => {
    expect(eventKindLabel({ eventKind: 'special' }, EN)).toBe('Special event');
  });

  test('the sub-type is not repeated when it only echoes the event name (the live Merdeka shift)', () => {
    const merdeka = {
      eventKind: 'special',
      eventName: 'Merdeka Celebration',
      templateSpecialEventType: 'other',
      templateCustomEventName: 'Merdeka Celebration',
    };
    expect(eventKindLabel(merdeka, EN)).toBe('Special event');
    // Same words in another case still count as the same words.
    expect(
      eventKindLabel({ eventKind: 'special', eventName: 'vip NIGHT', specialEventType: 'vip' }, EN),
    ).toBe('Special event');
  });

  test('a heading names the night, falling back to the kind', () => {
    expect(specialEventName({ eventKind: 'special', specialEventType: 'launch' }, EN)).toBe(
      'Product launch',
    );
    expect(specialEventName({ eventKind: 'special' }, EN)).toBe('Special event');
  });
});

describe("a special night's own prices — for display", () => {
  const venueMenu = [
    { id: 'cosmo', name: 'Cosmo', priceRm: '150.00', category: 'drink' },
    { id: 'donjulio', name: 'Donjulio', priceRm: '200.00', category: 'drink' },
    { id: 'havoc', name: 'Havoc', priceRm: '1000.00', category: 'service' },
  ];
  const eventMenu = [
    { id: 'cosmo', name: 'Cosmo', priceRm: '180.00', category: 'drink' },
    { id: 'donjulio', name: 'Donjulio', priceRm: '200.00', category: 'drink' },
    { id: 'vip-bottle', name: 'VIP bottle package', priceRm: '2000.00', category: 'drink' },
    { id: 'havoc', name: 'Havoc', priceRm: '1200.00', category: 'service' },
    { id: 'tips', name: 'Tips', priceRm: '50.00', category: 'tip' },
  ];
  // What /mine now sends on such a night (owner, 29 Sep 2026: "Use event prices"):
  // `drinkMenu` IS the event's list, so there is no everyday price to point at.
  const vipNight = { eventKind: 'special', drinkMenu: eventMenu, eventDrinkMenu: eventMenu };

  test("the Drinks page lists tonight's drinks at tonight's prices", () => {
    expect(eventPriceRows(vipNight, 'drinks')).toEqual([
      { id: 'cosmo', name: 'Cosmo', priceRm: 180 },
      { id: 'donjulio', name: 'Donjulio', priceRm: 200 },
      { id: 'vip-bottle', name: 'VIP bottle package', priceRm: 2000 },
    ]);
  });

  test('the Tips page takes service AND tip lines', () => {
    expect(eventPriceRows(vipNight, 'tips')?.map((r) => r.id)).toEqual(['havoc', 'tips']);
  });

  test('no drinks of its own → nothing on that page; it never borrows the other page', () => {
    const tipsOnly = { ...vipNight, eventDrinkMenu: [eventMenu[4]] };
    expect(eventPriceRows(tipsOnly, 'drinks')).toBeNull();
  });

  test('nothing to show: a normal shift, no own list, not known, or no shift at all', () => {
    expect(eventPriceRows({ ...vipNight, eventKind: 'normal' }, 'drinks')).toBeNull();
    expect(eventPriceRows({ ...vipNight, eventDrinkMenu: [] }, 'drinks')).toBeNull();
    // "Not known": no `eventDrinkMenu` at all, while `drinkMenu` still carries the
    // venue's list — which must not be borrowed. A named fixture, like `vipNight`.
    const venuePricedOnly = { eventKind: 'special', drinkMenu: venueMenu };
    expect(eventPriceRows(venuePricedOnly, 'drinks')).toBeNull();
    expect(eventPriceRows(null, 'drinks')).toBeNull();
  });
});
