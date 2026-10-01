import { describe, expect, it } from 'vitest';
import {
  CreateShiftSchema,
  EVENT_DRINK_MENU_MAX,
  UpdateShiftSchema,
  normaliseSpecialEvent,
  type StoredSpecialEvent,
} from './shift.schema';

/**
 * POST JOB COLLECTED A SPECIAL NIGHT'S TYPE, NAME AND PRICES — AND DROPPED ALL
 * THREE (28 Sep 2026 audit; columns + `shift_drink_menu` added by 0167).
 *
 * Unit tests on the parse and the normaliser alone, on purpose: a write gate is
 * never probed with a write, and these decide what a post and an edit store.
 */
const base = {
  outletId: '11111111-1111-4111-8111-111111111111',
  shiftDate: '2026-10-03',
};

const cosmo = { slug: 'cosmo', name: 'Cosmo', priceRm: 180, category: 'drink' };
const tips = { slug: 'tips', name: 'Tips', priceRm: 50, category: 'tip' };

describe('the shift schema accepts the special night', () => {
  it('parses the type, the trimmed "Other" name and the event price list', () => {
    const parsed = CreateShiftSchema.parse({
      ...base,
      eventKind: 'special',
      specialEventType: 'other',
      customSpecialEventName: '  Whisky tasting  ',
      eventDrinkMenu: [cosmo, { slug: 'havoc', name: 'Havoc', priceRm: 1000 }],
    });
    expect(parsed.specialEventType).toBe('other');
    expect(parsed.customSpecialEventName).toBe('Whisky tasting');
    // Money leaves as fixed(2), like every other money field on a shift; an
    // untagged row is a service row, as it has always been on the Workspace.
    expect(parsed.eventDrinkMenu).toEqual([
      { slug: 'cosmo', name: 'Cosmo', priceRm: '180.00', category: 'drink', sortOrder: 0 },
      { slug: 'havoc', name: 'Havoc', priceRm: '1000.00', category: 'service', sortOrder: 0 },
    ]);
  });

  it("keeps a Workspace tips row as 'tip' — the composer copies it into every event list", () => {
    const parsed = CreateShiftSchema.parse({ ...base, eventKind: 'special', eventDrinkMenu: [tips] });
    expect(parsed.eventDrinkMenu?.[0]?.category).toBe('tip');
  });

  it('refuses a sub-type that is not one of the composer chips', () => {
    expect(CreateShiftSchema.safeParse({ ...base, specialEventType: 'rave' }).success).toBe(false);
  });

  it('refuses an "Other" name past the column width', () => {
    const tooLong = CreateShiftSchema.safeParse({ ...base, customSpecialEventName: 'x'.repeat(121) });
    expect(tooLong.success).toBe(false);
    // Measured AFTER trimming, so padding alone never refuses an honest name.
    const padded = CreateShiftSchema.safeParse({
      ...base,
      customSpecialEventName: `  ${'x'.repeat(120)}  `,
    });
    expect(padded.success).toBe(true);
  });

  it.each([
    ['a negative price', { ...cosmo, priceRm: -1 }],
    ['a blank name', { ...cosmo, name: '   ' }],
    ['a missing id', { ...cosmo, slug: '' }],
    ['a category the menu does not have', { ...cosmo, category: 'bottle' }],
    ['a price past what numeric(12,2) holds', { ...cosmo, priceRm: 1e10 }],
  ])('refuses %s', (_label, item) => {
    expect(
      CreateShiftSchema.safeParse({ ...base, eventKind: 'special', eventDrinkMenu: [item] }).success,
    ).toBe(false);
  });

  it(`caps one event's list at ${EVENT_DRINK_MENU_MAX} items`, () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ ...cosmo, slug: `d-${i}`, sortOrder: i }));
    expect(
      CreateShiftSchema.safeParse({ ...base, eventDrinkMenu: many(EVENT_DRINK_MENU_MAX) }).success,
    ).toBe(true);
    expect(
      CreateShiftSchema.safeParse({ ...base, eventDrinkMenu: many(EVENT_DRINK_MENU_MAX + 1) })
        .success,
    ).toBe(false);
  });

  it('an edit keeps its three states apart: omitted, cleared, replaced', () => {
    const omitted = UpdateShiftSchema.parse({ status: 'confirmed' });
    expect(omitted.eventDrinkMenu).toBeUndefined();
    expect(omitted.specialEventType).toBeUndefined();
    expect(omitted.customSpecialEventName).toBeUndefined();

    expect(UpdateShiftSchema.parse({ eventDrinkMenu: [] }).eventDrinkMenu).toEqual([]);
    expect(UpdateShiftSchema.parse({ specialEventType: null }).specialEventType).toBeNull();
  });
});

describe('normaliseSpecialEvent — on a post', () => {
  const menu = [
    { slug: 'cosmo', name: 'Cosmo', priceRm: '180.00', category: 'drink' as const, sortOrder: 0 },
  ];

  it('a special post keeps its type, and its prices for the repository to write', () => {
    expect(
      normaliseSpecialEvent({ eventKind: 'special', specialEventType: 'vip', eventDrinkMenu: menu }),
    ).toEqual({
      columns: { specialEventType: 'vip', customSpecialEventName: null },
      eventDrinkMenu: menu,
    });
  });

  it('a normal post stores nothing special, whatever the composer carried over', () => {
    for (const eventKind of ['normal', undefined] as const) {
      expect(
        normaliseSpecialEvent({
          eventKind,
          specialEventType: 'vip',
          customSpecialEventName: 'Stale',
          eventDrinkMenu: menu,
        }),
      ).toEqual({
        columns: { specialEventType: null, customSpecialEventName: null },
        eventDrinkMenu: undefined,
      });
    }
  });

  it('keeps the "Other" name only for "other"', () => {
    expect(
      normaliseSpecialEvent({
        eventKind: 'special',
        specialEventType: 'launch',
        customSpecialEventName: 'Left over from Other',
      }).columns,
    ).toEqual({ specialEventType: 'launch', customSpecialEventName: null });

    expect(
      normaliseSpecialEvent({
        eventKind: 'special',
        specialEventType: 'other',
        customSpecialEventName: '  Whisky tasting ',
      }).columns,
    ).toEqual({ specialEventType: 'other', customSpecialEventName: 'Whisky tasting' });
  });

  it('a blank "Other" name is stored as no name, never as an empty string', () => {
    expect(
      normaliseSpecialEvent({
        eventKind: 'special',
        specialEventType: 'other',
        customSpecialEventName: '',
      }).columns?.customSpecialEventName,
    ).toBeNull();
  });

  it('a special post with no price list writes none — it is priced from the Workspace', () => {
    expect(
      normaliseSpecialEvent({ eventKind: 'special', specialEventType: 'vip' }).eventDrinkMenu,
    ).toBeUndefined();
  });
});

describe('normaliseSpecialEvent — on an edit', () => {
  const storedOther: StoredSpecialEvent = {
    eventKind: 'special',
    specialEventType: 'other',
    customSpecialEventName: 'Whisky tasting',
  };
  const storedNormal: StoredSpecialEvent = {
    eventKind: 'normal',
    specialEventType: null,
    customSpecialEventName: null,
  };

  it('an edit that names none of the four writes none of them (a status change)', () => {
    expect(normaliseSpecialEvent({}, storedOther)).toEqual({});
  });

  it('turning a special night normal clears its type, its name and its prices', () => {
    expect(normaliseSpecialEvent({ eventKind: 'normal' }, storedOther)).toEqual({
      columns: { specialEventType: null, customSpecialEventName: null },
      eventDrinkMenu: [],
    });
  });

  it('an omitted field keeps what is stored', () => {
    // Only the price list changes; the type and the name stand.
    expect(normaliseSpecialEvent({ eventDrinkMenu: [] }, storedOther)).toEqual({
      columns: { specialEventType: 'other', customSpecialEventName: 'Whisky tasting' },
      eventDrinkMenu: [],
    });
    // Only the name changes; the stored 'other' keeps it.
    expect(
      normaliseSpecialEvent({ customSpecialEventName: 'Gin night' }, storedOther).columns,
    ).toEqual({ specialEventType: 'other', customSpecialEventName: 'Gin night' });
  });

  it('moving off "Other" drops the stored name with it', () => {
    expect(normaliseSpecialEvent({ specialEventType: 'vip' }, storedOther)).toEqual({
      columns: { specialEventType: 'vip', customSpecialEventName: null },
      eventDrinkMenu: undefined,
    });
  });

  it('a name sent for a type that is not "Other" is not stored', () => {
    expect(
      normaliseSpecialEvent(
        { customSpecialEventName: 'Gin night' },
        { ...storedOther, specialEventType: 'vip', customSpecialEventName: null },
      ).columns,
    ).toEqual({ specialEventType: 'vip', customSpecialEventName: null });
  });

  it('prices sent for a shift that stays normal are dropped — and anything stored is cleared', () => {
    const menu = [
      { slug: 'cosmo', name: 'Cosmo', priceRm: '180.00', category: 'drink' as const, sortOrder: 0 },
    ];
    expect(
      normaliseSpecialEvent({ eventDrinkMenu: menu, specialEventType: 'vip' }, storedNormal),
    ).toEqual({
      columns: { specialEventType: null, customSpecialEventName: null },
      eventDrinkMenu: [],
    });
  });

  it('null clears a stored type on purpose, and the prices stand', () => {
    expect(normaliseSpecialEvent({ specialEventType: null }, storedOther)).toEqual({
      columns: { specialEventType: null, customSpecialEventName: null },
      eventDrinkMenu: undefined,
    });
  });
});
