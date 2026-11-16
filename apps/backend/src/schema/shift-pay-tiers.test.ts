import { describe, expect, it } from 'vitest';
import {
  COMMISSION_ONLY_HAS_NO_TIER,
  OUTLET_TIER_LABELS,
  TIER_ROW_NEEDS_LABEL,
  unknownTierLabelRefusal,
} from './outlet-workspace.schema';
import { CreateShiftSchema, UpdateShiftSchema } from './shift.schema';

/**
 * POST JOB'S PAY TIERS ARE THE RATE CARD'S ROWS, PER SHIFT — SO THE SAME TWO RULES.
 *
 * The resolver finds an override by its exact label and keeps the LAST matching
 * row, so a 'Tier 1' override priced nobody and two 'Tier II' rows priced by
 * query order. Unit tests on the parse alone: a write gate is never probed with
 * a write.
 */
const base = {
  outletId: '11111111-1111-4111-8111-111111111111',
  shiftDate: '2026-11-20',
};

/** What the web's `shiftPayTiersFromRows` sends: every composer column, once. */
const composerRows = () => [
  ...OUTLET_TIER_LABELS.map((tier, i) => ({
    kind: 'tier' as const,
    tier,
    wagePerHour: 500,
    drinkPct: 10,
    happyHourDrinkPct: null,
    tipPct: 15,
    otAfterHours: null,
    targetSalesRm: null,
    prCount: i === 0 ? 2 : 0,
    sortOrder: i,
  })),
  {
    kind: 'commission_only' as const,
    tier: null,
    wagePerHour: null,
    drinkPct: 80,
    happyHourDrinkPct: null,
    tipPct: 85,
    otAfterHours: null,
    targetSalesRm: null,
    prCount: 0,
    sortOrder: OUTLET_TIER_LABELS.length,
  },
];

const firstMessage = (body: unknown) =>
  CreateShiftSchema.safeParse({ ...base, ...(body as object) }).error?.issues[0]?.message;

describe('payTiers — labels the resolver can find', () => {
  it("accepts the composer's own rows unchanged", () => {
    const parsed = CreateShiftSchema.safeParse({ ...base, quantity: 2, payTiers: composerRows() });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.payTiers?.map((r) => r.tier)).toEqual([...OUTLET_TIER_LABELS, null]);
    // The output shape the repository writes is untouched: fixed(2) strings.
    expect(parsed.data?.payTiers?.[0]).toMatchObject({ wagePerHour: '500.00', drinkPct: '10.00' });
  });

  it.each([['Tier 1'], ['TIER I'], ['Tier I '], ['Tier VI']])('refuses the label %j', (tier) => {
    const rows: Record<string, unknown>[] = composerRows();
    rows[0] = { ...rows[0], tier };
    expect(firstMessage({ payTiers: rows })).toBe(unknownTierLabelRefusal(tier));
  });

  it('refuses a ranked row with no label', () => {
    expect(firstMessage({ payTiers: [{ kind: 'tier', tier: null, wagePerHour: 500 }] })).toBe(
      TIER_ROW_NEEDS_LABEL,
    );
    expect(firstMessage({ payTiers: [{ wagePerHour: 500 }] })).toBe(TIER_ROW_NEEDS_LABEL);
  });

  it('a commission-only row has no label', () => {
    expect(
      firstMessage({ payTiers: [{ kind: 'commission_only', tier: 'Tier I', drinkPct: 80 }] }),
    ).toBe(COMMISSION_ONLY_HAS_NO_TIER);
    // Omitted and null both arrive as null, as they always have.
    const parsed = CreateShiftSchema.parse({
      ...base,
      payTiers: [{ kind: 'commission_only', drinkPct: 80 }],
    });
    expect(parsed.payTiers?.[0]?.tier).toBeNull();
  });
});

describe('payTiers — one row per tier', () => {
  it('refuses a repeated tier', () => {
    const rows = [...composerRows(), { ...composerRows()[1], wagePerHour: 999 }];
    expect(firstMessage({ payTiers: rows })).toBe(
      "Tier II appears more than once in this job's pay tiers — keep one row per tier.",
    );
  });

  it('refuses a second commission-only row', () => {
    const rows = [...composerRows(), { kind: 'commission_only', tier: null, drinkPct: 50 }];
    expect(firstMessage({ payTiers: rows })).toBe(
      "The commission-only rate appears more than once in this job's pay tiers — keep one.",
    );
  });

  it('an edit is held to both rules, and a status-only edit to neither', () => {
    // The rules ride on the element and the array — `UpdateShiftSchema` is
    // `CreateShiftSchema.partial()`, which zod 4.4 would refuse to build from a
    // refined object, taking the backend down at import.
    expect(
      UpdateShiftSchema.safeParse({ payTiers: [{ kind: 'tier', tier: 'Tier 1' }] }).error?.issues[0]
        ?.message,
    ).toBe(unknownTierLabelRefusal('Tier 1'));
    expect(
      UpdateShiftSchema.safeParse({
        payTiers: [
          { kind: 'tier', tier: 'Tier I' },
          { kind: 'tier', tier: 'Tier I' },
        ],
      }).success,
    ).toBe(false);
    expect(UpdateShiftSchema.safeParse({ status: 'confirmed' }).success).toBe(true);
    expect(UpdateShiftSchema.parse({ payTiers: [] }).payTiers).toEqual([]);
  });
});

/**
 * A per-shift commission is the rate card's commission, so it carries the rate
 * card's 0-100 bound (Support Desk risk, 16 Nov 2026). Parse only — never a write.
 */
describe('per-shift commission percentages are 0-100', () => {
  const withFirstRow = (patch: Record<string, unknown>) => {
    const rows = composerRows();
    rows[0] = { ...rows[0], ...patch } as (typeof rows)[number];
    return { ...base, payTiers: rows };
  };

  it.each([
    ['drinkPct', 250],
    ['tipPct', 101],
    ['happyHourDrinkPct', 100.01],
    ['drinkPct', -1],
  ])('refuses %s = %s', (field, value) => {
    expect(CreateShiftSchema.safeParse(withFirstRow({ [field]: value })).success).toBe(false);
    expect(UpdateShiftSchema.safeParse(withFirstRow({ [field]: value })).success).toBe(false);
  });

  it('keeps 0 and 100 and a blank happy-hour rate', () => {
    for (const patch of [{ drinkPct: 0, tipPct: 100 }, { happyHourDrinkPct: null }, { happyHourDrinkPct: 100 }]) {
      expect(CreateShiftSchema.safeParse(withFirstRow(patch)).success).toBe(true);
    }
  });
});
