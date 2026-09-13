import { describe, expect, it } from 'vitest';
import {
  TierRateSchema,
  UpsertOutletWorkspaceSchema,
} from './outlet-workspace.schema';

/**
 * The rate card is the one table this repo has already destroyed once: two
 * venues lost every tier row to a PUT that simply omitted `tierRates`, because
 * the schema defaulted it to `[]` and the repository deletes before it inserts.
 *
 * These are unit tests on the parse alone, on purpose. The rule here is that a
 * write gate is never probed with a write, and this gate guards the exact data
 * that was lost.
 */
describe('UpsertOutletWorkspaceSchema', () => {
  it('leaves an omitted list UNDEFINED, so the repository can skip it', () => {
    const parsed = UpsertOutletWorkspaceSchema.parse({ drinkPct: 12 });
    // The bug: these used to parse as `[]`, which the repository spends as
    // "delete every row and insert nothing".
    expect(parsed.tierRates).toBeUndefined();
    expect(parsed.drinkMenu).toBeUndefined();
  });

  it('still lets a caller CLEAR a list on purpose', () => {
    const parsed = UpsertOutletWorkspaceSchema.parse({ tierRates: [] });
    expect(parsed.tierRates).toEqual([]);
  });

  it('leaves omitted scalars undefined instead of zeroing them', () => {
    const parsed = UpsertOutletWorkspaceSchema.parse({ tierRates: [] });
    expect(parsed.drinkPct).toBeUndefined();
    expect(parsed.perDrinkRm).toBeUndefined();
    expect(parsed.happyHourStart).toBeUndefined();
  });

  it('refuses a negative percentage', () => {
    expect(() => UpsertOutletWorkspaceSchema.parse({ drinkPct: -5 })).toThrow();
    expect(() => UpsertOutletWorkspaceSchema.parse({ tipPct: -0.5 })).toThrow();
  });

  it('refuses a percentage over 100', () => {
    expect(() =>
      UpsertOutletWorkspaceSchema.parse({ drinkPct: 5000 }),
    ).toThrow();
    expect(() =>
      UpsertOutletWorkspaceSchema.parse({ happyHourDrinkDiscountPct: 101 }),
    ).toThrow();
  });

  it('refuses negative money', () => {
    expect(() =>
      UpsertOutletWorkspaceSchema.parse({ basePayPerHour: -1 }),
    ).toThrow();
    expect(() =>
      UpsertOutletWorkspaceSchema.parse({
        drinkMenu: [{ slug: 'x', name: 'X', priceRm: -10 }],
      }),
    ).toThrow();
  });

  it('accepts a whole honest card unchanged', () => {
    const parsed = UpsertOutletWorkspaceSchema.parse({
      basePayPerHour: 0,
      drinkPct: 10,
      tipPct: 15,
      otAfterHours: 6,
      perDrinkRm: 30,
      happyHourStart: '22:00',
      happyHourEnd: '02:00',
      happyHourDrinkDiscountPct: 20,
      tierRates: [
        { kind: 'tier', tier: 'Tier I', wagePerHour: 500, drinkPct: 10, tipPct: 15 },
      ],
      drinkMenu: [{ slug: 'lemon-drop', name: 'Lemon Drop', priceRm: 30 }],
    });
    expect(parsed.tierRates).toHaveLength(1);
    expect(parsed.drinkMenu?.[0]?.priceRm).toBe(30);
    expect(parsed.drinkPct).toBe(10);
  });
});

describe('TierRateSchema', () => {
  it('refuses a negative daily wage', () => {
    expect(() =>
      TierRateSchema.parse({ tier: 'Tier I', wagePerHour: -500 }),
    ).toThrow();
  });

  it('refuses a commission percentage outside 0-100', () => {
    expect(() => TierRateSchema.parse({ drinkPct: -1 })).toThrow();
    expect(() => TierRateSchema.parse({ tipPct: 120 })).toThrow();
    expect(() =>
      TierRateSchema.parse({ happyHourDrinkPct: 150 }),
    ).toThrow();
  });

  it('keeps a null happy-hour percentage as null, not as zero', () => {
    // Null means "no separate happy-hour rate — use the normal one". Coercing it
    // to 0 would price every happy-hour drink at nothing.
    const parsed = TierRateSchema.parse({ tier: 'Tier I', happyHourDrinkPct: null });
    expect(parsed.happyHourDrinkPct).toBeNull();
  });
});
