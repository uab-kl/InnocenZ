import { describe, expect, it } from 'vitest';
import {
  CreateMemberSubscriptionSchema,
  UpdateMemberSubscriptionSchema,
} from './member-subscription.schema';
import { CreateOutletTransactionSchema } from './outlet-transaction.schema';
import { CreateOutletSchema, UpdateGeoFenceSchema, UpdateOutletSchema } from './outlet.schema';

/**
 * Two input rules, tested at the parse (12 Nov 2026) — both doors are admin or
 * owner writes, and this project does not probe a write gate with a write.
 *
 *  - CURRENCY is MYR only. A free 1-8 character code would be copied onto every
 *    invoice a lane raises and summed into totals the screens print as RM.
 *  - A PIN is two numbers. `PUT /outlet/:id` and `POST /outlet` accepted half a
 *    pin, moving a venue's check-in fence somewhere nobody chose.
 *
 * Importing outlet.schema at all is part of the test: under zod 4 a `.partial()`
 * of a refined object throws AT IMPORT, which would take the backend down.
 */

const subscription = {
  subscriberType: 'outlet',
  subscriberId: '5b1f0d8e-7c1a-4a55-9d33-0a6f3c2e9b10',
  subscriberName: 'Velvet 23',
  planName: 'Pro',
  amount: 299,
};
const transaction = {
  outletId: '5b1f0d8e-7c1a-4a55-9d33-0a6f3c2e9b10',
  outletName: 'Velvet 23',
  amount: 120,
};

describe('currency — MYR only, normalised', () => {
  it.each([
    ['member_subscription create', (c?: unknown) => CreateMemberSubscriptionSchema.safeParse({ ...subscription, currency: c })],
    ['outlet_transaction create', (c?: unknown) => CreateOutletTransactionSchema.safeParse({ ...transaction, currency: c })],
  ])('%s: defaults to MYR, forgives case and spaces, refuses anything else', (_name, parse) => {
    expect(parse(undefined).data?.currency).toBe('MYR');
    expect(parse('MYR').data?.currency).toBe('MYR');
    expect(parse(' myr ').data?.currency).toBe('MYR');
    for (const bad of ['RM', 'USD', 'SGD', '', 'MYRR', 5]) {
      const out = parse(bad);
      expect(out.success).toBe(false);
      expect(out.error?.issues[0]?.message).toMatch(/Currency must be MYR/);
    }
  });

  it('an EDIT that does not mention currency leaves it alone — no default rewrites it', () => {
    const parsed = UpdateMemberSubscriptionSchema.parse({ planName: 'Plus' });
    expect('currency' in parsed).toBe(false);
    expect(UpdateMemberSubscriptionSchema.parse({ currency: 'myr' }).currency).toBe('MYR');
    expect(UpdateMemberSubscriptionSchema.safeParse({ currency: 'USD' }).success).toBe(false);
  });
});

describe('outlet pin — latitude and longitude together', () => {
  const create = { packageId: '9e2a7c44-1d0b-4f6e-8a21-3c5d7e9f0b12', name: 'Emhub Testing' };

  it('PUT /outlet/:id: half a pin is a 400 that says why', () => {
    for (const half of [{ lat: 3.16 }, { lng: 101.57 }]) {
      const out = UpdateOutletSchema.safeParse(half);
      expect(out.success).toBe(false);
      expect(out.error?.issues[0]?.message).toMatch(/latitude and longitude together/);
    }
  });

  it('PUT /outlet/:id: both, or neither, still saves — the web edit sends neither', () => {
    expect(UpdateOutletSchema.safeParse({ lat: 3.16, lng: 101.57 }).success).toBe(true);
    expect(UpdateOutletSchema.safeParse({ name: 'Emhub', addressLine1: 'Persiaran Surian' }).success).toBe(true);
    expect(UpdateOutletSchema.safeParse({}).success).toBe(true);
  });

  it('PUT /outlet/:id keeps its no-default radius (the 50 m regression stays fixed)', () => {
    const parsed = UpdateOutletSchema.parse({ name: 'Emhub' });
    expect(parsed.geoFenceRadius).toBeUndefined();
  });

  it('POST /outlet: half a pin refused; none, or a full pin, accepted with the 50 m default', () => {
    expect(CreateOutletSchema.safeParse({ ...create, lat: 3.16 }).success).toBe(false);
    expect(CreateOutletSchema.parse(create).geoFenceRadius).toBe(50);
    expect(CreateOutletSchema.safeParse({ ...create, lat: 3.16, lng: 101.57 }).success).toBe(true);
  });

  it('(0, 0) is refused on every door, the pin card included', () => {
    const zero = { lat: 0, lng: 0 };
    for (const out of [
      UpdateOutletSchema.safeParse(zero),
      CreateOutletSchema.safeParse({ ...create, ...zero }),
      UpdateGeoFenceSchema.safeParse(zero),
    ]) {
      expect(out.success).toBe(false);
      expect(out.error?.issues[0]?.message).toMatch(/not a venue/);
    }
    // One zero on its own is a real coordinate (the equator / the prime meridian).
    expect(UpdateGeoFenceSchema.safeParse({ lat: 0, lng: 101.57 }).success).toBe(true);
  });

  it('a swapped Malaysian pair is still refused by the ranges, as before', () => {
    expect(UpdateGeoFenceSchema.safeParse({ lat: 101.57, lng: 3.16 }).success).toBe(false);
    expect(UpdateOutletSchema.safeParse({ lat: 101.57, lng: 3.16 }).success).toBe(false);
  });

  it('the pin card still saves a normal pin and radius', () => {
    expect(UpdateGeoFenceSchema.parse({ lat: 3.16, lng: 101.57, geoFenceRadius: 120 })).toEqual({
      lat: 3.16,
      lng: 101.57,
      geoFenceRadius: 120,
    });
  });
});
