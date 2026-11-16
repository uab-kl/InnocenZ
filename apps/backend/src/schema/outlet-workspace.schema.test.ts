import { describe, expect, it } from 'vitest';
import { PR_TIER_TO_OUTLET_LABEL } from '@/features/shift-assignment/tier-demand';
import {
  COMMISSION_ONLY_HAS_NO_TIER,
  HAPPY_HOUR_NEEDS_BOTH,
  HAPPY_HOUR_SAME_TIME,
  OUTLET_TIER_LABELS,
  TIER_ROW_NEEDS_LABEL,
  TierRateSchema,
  UpsertOutletWorkspaceSchema,
  happyHourTimeRefusal,
  unknownTierLabelRefusal,
} from './outlet-workspace.schema';

/** The first refusal sentence — exactly what the controller answers 400 with. */
const firstMessage = (body: unknown): string | undefined =>
  UpsertOutletWorkspaceSchema.safeParse(body).error?.issues[0]?.message;

/** The card the web's `saveInputFromWorkspaceSettings` sends: 6 tiers + commission-only. */
const webCard = () => [
  ...OUTLET_TIER_LABELS.map((tier, i) => ({
    kind: 'tier' as const,
    tier,
    wagePerHour: 500 + i * 100,
    drinkPct: 10,
    happyHourDrinkPct: 5,
    tipPct: 15,
    otAfterHours: 6,
    targetSalesRm: 1000,
    sortOrder: i,
  })),
  {
    kind: 'commission_only' as const,
    tier: null,
    wagePerHour: null,
    drinkPct: 80,
    happyHourDrinkPct: 75,
    tipPct: 85,
    otAfterHours: null,
    targetSalesRm: null,
    sortOrder: OUTLET_TIER_LABELS.length,
  },
];

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
    // A valid label, so each refusal is the percentage's and not the label's.
    expect(() => TierRateSchema.parse({ tier: 'Tier I', drinkPct: -1 })).toThrow();
    expect(() => TierRateSchema.parse({ tier: 'Tier I', tipPct: 120 })).toThrow();
    expect(() =>
      TierRateSchema.parse({ tier: 'Tier I', happyHourDrinkPct: 150 }),
    ).toThrow();
  });

  it('keeps a null happy-hour percentage as null, not as zero', () => {
    // Null means "no separate happy-hour rate — use the normal one". Coercing it
    // to 0 would price every happy-hour drink at nothing.
    const parsed = TierRateSchema.parse({ tier: 'Tier I', happyHourDrinkPct: null });
    expect(parsed.happyHourDrinkPct).toBeNull();
  });
});

describe('a tier row must carry a label the pay resolver can find', () => {
  it('derives the six labels from PR_TIER_TO_OUTLET_LABEL — never a retyped copy', () => {
    expect([...OUTLET_TIER_LABELS]).toEqual(Object.values(PR_TIER_TO_OUTLET_LABEL));
    expect([...OUTLET_TIER_LABELS]).toEqual([
      'Tier I',
      'Tier II',
      'Tier III',
      'Tier IV',
      'Tier V',
      'Servant',
    ]);
  });

  it.each(OUTLET_TIER_LABELS.map((t) => [t]))('accepts the standard label %s', (tier) => {
    expect(TierRateSchema.safeParse({ kind: 'tier', tier }).success).toBe(true);
  });

  it.each([['Tier 1'], ['tier i'], ['Tier I '], ['Tier VI'], ['VIP']])(
    'refuses %j with a sentence naming the six',
    (tier) => {
      const parsed = TierRateSchema.safeParse({ kind: 'tier', tier, wagePerHour: 500 });
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.message).toBe(unknownTierLabelRefusal(tier));
      expect(parsed.error?.issues[0]?.message).toContain('Tier I, Tier II');
    },
  );

  it('refuses a ranked row with no label at all', () => {
    for (const tier of [null, undefined, '']) {
      const parsed = TierRateSchema.safeParse({ kind: 'tier', tier });
      expect(parsed.error?.issues[0]?.message).toBe(TIER_ROW_NEEDS_LABEL);
    }
    // `kind` defaults to 'tier', so an untagged row is held to the same rule.
    expect(TierRateSchema.safeParse({}).error?.issues[0]?.message).toBe(TIER_ROW_NEEDS_LABEL);
  });

  it('the commission-only row keeps its NULL tier, and refuses a label', () => {
    expect(TierRateSchema.safeParse({ kind: 'commission_only', tier: null }).success).toBe(true);
    expect(TierRateSchema.safeParse({ kind: 'commission_only' }).success).toBe(true);
    for (const tier of ['Tier I', '']) {
      const parsed = TierRateSchema.safeParse({ kind: 'commission_only', tier });
      expect(parsed.error?.issues[0]?.message).toBe(COMMISSION_ONLY_HAS_NO_TIER);
    }
  });

  it('the 400 the Workspace page shows is that sentence', () => {
    const card: Record<string, unknown>[] = webCard();
    card[1] = { ...card[1], tier: 'Tier 2' };
    expect(firstMessage({ tierRates: card })).toBe(unknownTierLabelRefusal('Tier 2'));
  });
});

describe('one row per tier on a rate card', () => {
  it("accepts the web's own card: six tiers and one commission-only row", () => {
    const parsed = UpsertOutletWorkspaceSchema.safeParse({ tierRates: webCard() });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.tierRates).toHaveLength(7);
  });

  it('refuses a repeated tier', () => {
    const card = [...webCard(), { kind: 'tier', tier: 'Tier II', wagePerHour: 999 }];
    expect(firstMessage({ tierRates: card })).toBe(
      'Tier II appears more than once on this rate card — keep one row per tier.',
    );
  });

  it('refuses a second commission-only row', () => {
    const card = [...webCard(), { kind: 'commission_only', tier: null, drinkPct: 50 }];
    expect(firstMessage({ tierRates: card })).toBe(
      'The commission-only rate appears more than once on this rate card — keep one.',
    );
  });

  it('a partial card is still fine — only REPEATS are refused, not gaps', () => {
    expect(
      UpsertOutletWorkspaceSchema.safeParse({
        tierRates: [{ kind: 'tier', tier: 'Tier I', wagePerHour: 500 }],
      }).success,
    ).toBe(true);
  });
});

describe('one item per id on the price list', () => {
  it('refuses a repeated slug, even when the names differ', () => {
    expect(
      firstMessage({
        drinkMenu: [
          { slug: 'cosmo', name: 'Cosmo', priceRm: 180, category: 'drink' },
          { slug: 'cosmo', name: 'Cosmo Royale', priceRm: 220, category: 'drink' },
        ],
      }),
    ).toBe('Two items on the price list share the id "cosmo" — give each item its own id.');
  });

  it('is an ID rule, not a name rule: one name in Drinks and Services is allowed', () => {
    expect(
      UpsertOutletWorkspaceSchema.safeParse({
        drinkMenu: [
          { slug: 'drink-1', name: 'Champagne', priceRm: 500, category: 'drink' },
          { slug: 'service-1', name: 'Champagne', priceRm: 50, category: 'service' },
          { slug: 'tips', name: 'Tips', priceRm: 0, category: 'tip' },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('happy hour is a 24-hour HH:MM pair, or blank', () => {
  it.each([
    ['21:00', '23:00'],
    ['20:00', '22:00'],
    ['22:00', '02:00'],
    ['00:00', '23:59'],
    ['', ''],
  ])('accepts %j - %j', (happyHourStart, happyHourEnd) => {
    const parsed = UpsertOutletWorkspaceSchema.safeParse({ happyHourStart, happyHourEnd });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.happyHourStart).toBe(happyHourStart);
    expect(parsed.data?.happyHourEnd).toBe(happyHourEnd);
  });

  it('stores what the phone accepts in one spelling: zero-padded and trimmed', () => {
    const parsed = UpsertOutletWorkspaceSchema.parse({
      happyHourStart: '9:00',
      happyHourEnd: ' 11:30 ',
    });
    expect(parsed.happyHourStart).toBe('09:00');
    expect(parsed.happyHourEnd).toBe('11:30');
  });

  it.each([['9pm'], ['21.00'], ['24:00'], ['21:60'], ['2100'], ['21:00:00'], ['21']])(
    'refuses %j with a sentence saying how to write it',
    (bad) => {
      expect(firstMessage({ happyHourStart: bad, happyHourEnd: '23:00' })).toBe(
        happyHourTimeRefusal('Happy hour start'),
      );
      expect(firstMessage({ happyHourStart: '21:00', happyHourEnd: bad })).toBe(
        happyHourTimeRefusal('Happy hour end'),
      );
    },
  );

  it('refuses one end without the other', () => {
    expect(firstMessage({ happyHourStart: '21:00', happyHourEnd: '' })).toBe(HAPPY_HOUR_NEEDS_BOTH);
    expect(firstMessage({ happyHourStart: '', happyHourEnd: '23:00' })).toBe(HAPPY_HOUR_NEEDS_BOTH);
  });

  it('refuses a window that starts and ends at the same minute', () => {
    expect(firstMessage({ happyHourStart: '21:00', happyHourEnd: '21:00' })).toBe(
      HAPPY_HOUR_SAME_TIME,
    );
    // Compared AFTER padding, so the two spellings of one time are one time.
    expect(firstMessage({ happyHourStart: '9:00', happyHourEnd: '09:00' })).toBe(
      HAPPY_HOUR_SAME_TIME,
    );
  });

  it('keeps "absent = leave it alone": one end sent alone is not judged here', () => {
    // The stored other end is not known to the parse — the PUT contract allows this.
    expect(UpsertOutletWorkspaceSchema.safeParse({ happyHourStart: '21:00' }).success).toBe(true);
    expect(UpsertOutletWorkspaceSchema.safeParse({ happyHourEnd: '' }).success).toBe(true);
  });
});
