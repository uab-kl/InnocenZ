import { describe, expect, it } from 'vitest';
import {
  PenaltyRuleSchema,
  SaveAgencyPenaltyRulesSchema,
  penaltyRuleRefusal,
} from './agency-penalty-rule.schema';

/**
 * The penalty set is replaced WHOLE on every save (delete + insert), and its
 * rules turn into charges the Sunday job records automatically. These are tests
 * on the parse alone, on purpose: a write gate is never probed with a write.
 */

/** Exactly what the web editor sends (penaltyRulesSaveInput) for the live rows. */
const EDITOR_PAYLOAD = [
  { ruleType: 'min_shifts_per_week', enabled: true, fineRm: 50, minShiftsPerWeek: 3 },
  {
    ruleType: 'max_mc_per_month',
    enabled: true,
    fineRm: 0,
    maxMcPerMonth: 8,
    finePerExcessRm: 80,
  },
  {
    ruleType: 'late_per_week',
    enabled: true,
    fineRm: 30,
    maxLatePerWeek: 2,
    graceMinutes: 15,
  },
  {
    ruleType: 'cancellation',
    enabled: true,
    fineRm: 0,
    freeCancelHours: 24,
    shortNoticeHours: 2,
    shortNoticePct: 25,
    lateCancelPct: 50,
  },
];

function withRule(ruleType: string, patch: Record<string, unknown>) {
  return {
    penaltyRules: EDITOR_PAYLOAD.map((r) =>
      r.ruleType === ruleType ? { ...r, ...patch } : r,
    ),
  };
}

function refusal(body: unknown): string | undefined {
  const parsed = SaveAgencyPenaltyRulesSchema.safeParse(body);
  // The controller sends issues[0].message as the 400 sentence.
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
}

describe('SaveAgencyPenaltyRulesSchema — what still saves', () => {
  it('accepts the editor payload for the live rule set unchanged', () => {
    const parsed = SaveAgencyPenaltyRulesSchema.safeParse({
      penaltyRules: EDITOR_PAYLOAD,
    });
    expect(parsed.success).toBe(true);
  });

  it('still accepts an empty set (an agency enforcing nothing)', () => {
    expect(SaveAgencyPenaltyRulesSchema.safeParse({ penaltyRules: [] }).success).toBe(
      true,
    );
  });

  it('still refuses an omitted list instead of wiping every rule', () => {
    expect(SaveAgencyPenaltyRulesSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a blank grace — the server already reads it as 0 minutes', () => {
    expect(refusal(withRule('late_per_week', { graceMinutes: null }))).toBeUndefined();
  });

  it('accepts short notice EQUAL to free cancel (an empty short band, warned in the editor)', () => {
    expect(
      refusal(withRule('cancellation', { shortNoticeHours: 24, freeCancelHours: 24 })),
    ).toBeUndefined();
  });

  it('accepts the 0% and 100% edges of a cancellation charge', () => {
    expect(
      refusal(withRule('cancellation', { shortNoticePct: 0, lateCancelPct: 100 })),
    ).toBeUndefined();
  });

  /**
   * THE SKEPTIC'S CASE. The editor always sends all four rules and an emptied
   * box became 0, so an owner who switched lateness OFF with 0 left in it must
   * still be able to save the other three.
   */
  it('does not check a DISABLED rule — 0 lates, 150%, or a blank band all save while off', () => {
    expect(
      refusal(withRule('late_per_week', { enabled: false, maxLatePerWeek: 0 })),
    ).toBeUndefined();
    expect(
      refusal(
        withRule('cancellation', {
          enabled: false,
          lateCancelPct: 150,
          shortNoticeHours: 30,
          freeCancelHours: null,
        }),
      ),
    ).toBeUndefined();
    expect(
      refusal(withRule('min_shifts_per_week', { enabled: false, minShiftsPerWeek: null })),
    ).toBeUndefined();
  });
});

describe('SaveAgencyPenaltyRulesSchema — what an ENABLED rule may not carry', () => {
  it('refuses a late limit of 0, which would fine every rostered PR', () => {
    expect(refusal(withRule('late_per_week', { maxLatePerWeek: 0 }))).toBe(
      'Lateness per week: the late limit must be at least 1. A limit of 0 would count every rostered PR as late every week.',
    );
  });

  it('refuses a cancellation charge above 100% of the daily wage', () => {
    expect(refusal(withRule('cancellation', { lateCancelPct: 150 }))).toBe(
      "Shift cancellation: the late charge must be between 0 and 100% of the shift's daily wage.",
    );
    expect(refusal(withRule('cancellation', { shortNoticePct: 101 }))).toBe(
      "Shift cancellation: the short-notice charge must be between 0 and 100% of the shift's daily wage.",
    );
  });

  it('refuses negative numbers, naming the rule and the field', () => {
    expect(refusal(withRule('min_shifts_per_week', { fineRm: -5 }))).toBe(
      'Minimum shifts per week: the fine cannot be negative.',
    );
    expect(refusal(withRule('max_mc_per_month', { finePerExcessRm: -1 }))).toBe(
      'MC cap per month: the fine per extra MC cannot be negative.',
    );
    expect(refusal(withRule('late_per_week', { graceMinutes: -15 }))).toBe(
      'Lateness per week: the grace minutes cannot be negative.',
    );
    expect(refusal(withRule('cancellation', { shortNoticeHours: -2 }))).toBe(
      'Shift cancellation: the short-notice hours cannot be negative.',
    );
  });

  it('refuses an enabled rule with its own threshold blank', () => {
    expect(refusal(withRule('min_shifts_per_week', { minShiftsPerWeek: null }))).toBe(
      'Minimum shifts per week is switched on but has no value for the minimum shifts per week. Enter it, or switch the rule off.',
    );
    expect(refusal(withRule('max_mc_per_month', { maxMcPerMonth: undefined }))).toBe(
      'MC cap per month is switched on but has no value for the MC cap per month. Enter it, or switch the rule off.',
    );
    expect(refusal(withRule('late_per_week', { maxLatePerWeek: null }))).toBe(
      'Lateness per week is switched on but has no value for the late limit per week. Enter it, or switch the rule off.',
    );
  });

  /**
   * The half-filled cancellation row: the phone quoted 25% from its default 2h
   * while the server sealed the late band. It can no longer be saved enabled.
   */
  it('refuses an enabled cancellation rule missing any of its four bands', () => {
    for (const field of [
      'freeCancelHours',
      'shortNoticeHours',
      'shortNoticePct',
      'lateCancelPct',
    ]) {
      expect(refusal(withRule('cancellation', { [field]: null }))).toMatch(
        /^Shift cancellation is switched on but has no value for /,
      );
    }
  });

  it('refuses short notice LONGER than free cancel', () => {
    expect(
      refusal(withRule('cancellation', { shortNoticeHours: 30, freeCancelHours: 24 })),
    ).toBe(
      'Shift cancellation: short notice (30h) cannot be longer than free cancel (24h). Lower short notice or raise free cancel.',
    );
  });

  it('turns a number past the column into a 400 sentence, not a 500 from Postgres', () => {
    expect(refusal(withRule('min_shifts_per_week', { minShiftsPerWeek: 99_999_999_999 }))).toBe(
      'A penalty rule number is too large to store.',
    );
    // Storage limits hold whether or not the rule is on — the insert fails either way.
    expect(
      refusal(withRule('late_per_week', { enabled: false, fineRm: 1e12 })),
    ).toBe('A penalty rule number is too large to store.');
  });

  it('one refused rule refuses the whole set (the save replaces all four)', () => {
    const parsed = SaveAgencyPenaltyRulesSchema.safeParse(
      withRule('late_per_week', { maxLatePerWeek: 0 }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(['penaltyRules', 2]);
    }
  });
});

describe('PenaltyRuleSchema stays unrefined', () => {
  // zod 4 throws on .partial()/.pick()/.omit() of a refined object. The rules
  // live on the array so the per-rule object stays safe to derive from.
  it('can still be derived from without throwing', () => {
    expect(() => PenaltyRuleSchema.partial()).not.toThrow();
    expect(() => PenaltyRuleSchema.pick({ ruleType: true })).not.toThrow();
  });

  it('penaltyRuleRefusal answers null for a valid enabled rule', () => {
    expect(
      penaltyRuleRefusal(
        PenaltyRuleSchema.parse({
          ruleType: 'late_per_week',
          enabled: true,
          fineRm: 30,
          maxLatePerWeek: 1,
        }),
      ),
    ).toBeNull();
  });
});
