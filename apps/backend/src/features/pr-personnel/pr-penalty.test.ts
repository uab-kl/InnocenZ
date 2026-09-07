import { describe, expect, test } from 'vitest';
import type { AgencyPenaltyRule } from '@/features/agency/agency-penalty-rule.model';
import { evaluatePrPenalties, type PrAttendanceWindow } from './pr-penalty';

/**
 * The minimum-shifts rule, and the sentence it writes.
 *
 * Both halves matter and both were reported by the owner on 7 Sep 2026: the
 * GUARD (a PR who was never given three shifts cannot be fined for not working
 * three) and the DETAIL (the row has to say how many they were given, or an
 * agency reading it cannot tell a fair fine from an unfair one).
 */
const minShiftsRule = (over: Partial<AgencyPenaltyRule> = {}): AgencyPenaltyRule =>
  ({
    ruleType: 'min_shifts_per_week',
    enabled: true,
    fineRm: '50.00',
    minShiftsPerWeek: 3,
    maxMcPerMonth: null,
    finePerExcessRm: null,
    maxLatePerWeek: null,
    graceMinutes: null,
    ...over,
  }) as AgencyPenaltyRule;

const window = (over: Partial<PrAttendanceWindow> = {}): PrAttendanceWindow => ({
  assignedThisWeek: 3,
  excusedThisWeek: 0,
  paidCancellationsThisWeek: 0,
  shiftsThisWeek: 1,
  lateThisWeek: 0,
  mcThisMonth: 0,
  ...over,
});

describe('minimum shifts per week', () => {
  test('fines a PR who had three chances and worked one', () => {
    // Vicky's real 30 Aug - 05 Sep week.
    const { breaches, totalFineCents } = evaluatePrPenalties(window(), [minShiftsRule()]);
    expect(breaches).toHaveLength(1);
    expect(totalFineCents).toBe(5000);
  });

  /*
   * THE OPPORTUNITY LEADS THE SENTENCE.
   *
   * Not cosmetic, and not merely "include the number": the panel renders this
   * detail in a `truncate` span with the full text only behind a hover title,
   * so a number appended to the END is invisible — which is exactly how the
   * first attempt at this fix shipped and changed nothing on screen. Asserting
   * the ORDER is what stops it regressing into something that reads correctly
   * in a test and says nothing in the UI.
   */
  test('leads with how many shifts were OFFERED, before the ellipsis can eat it', () => {
    const { breaches } = evaluatePrPenalties(window(), [minShiftsRule()]);
    expect(breaches[0]!.detail).toBe('3 offered · 1 of 3 worked');
    expect(breaches[0]!.detail.startsWith('3 offered')).toBe(true);
  });

  test('counts the opportunity net of excused and paid-cancelled shifts', () => {
    // 5 assigned, 1 excused, 1 paid off => 3 real chances, still a breach.
    const { breaches } = evaluatePrPenalties(
      window({ assignedThisWeek: 5, excusedThisWeek: 1, paidCancellationsThisWeek: 1 }),
      [minShiftsRule()],
    );
    expect(breaches[0]!.detail).toBe('3 offered · 1 of 3 worked');
  });

  test('says nothing when the PR was never given three shifts', () => {
    // The guard the owner asked after: you cannot work shifts you were never
    // given, so there is no breach to report and no sentence to write.
    expect(evaluatePrPenalties(window({ assignedThisWeek: 2 }), [minShiftsRule()]).breaches).toEqual(
      [],
    );
  });

  test('approved leave cannot be turned into a fine', () => {
    // Assigned 3, but the agency excused one of them: two real chances left.
    expect(evaluatePrPenalties(window({ excusedThisWeek: 1 }), [minShiftsRule()]).breaches).toEqual(
      [],
    );
  });

  test('hitting the minimum exactly is compliance, not a breach', () => {
    expect(evaluatePrPenalties(window({ shiftsThisWeek: 3 }), [minShiftsRule()]).breaches).toEqual(
      [],
    );
  });

  /*
   * OWNER'S CALL, 7 Sep 2026: "a weekly minimum should be satisfiable in a
   * single day as 3 shifts in a day still translates to 3 shifts in a week".
   *
   * So the rule counts ASSIGNMENTS and never distinct days. This test exists to
   * stop a well-meaning future change to `assigned_this_week` from quietly
   * making a busy single day stop counting.
   */
  test('three shifts in one day are three shifts in the week', () => {
    const oneBusyDay = window({ assignedThisWeek: 3, shiftsThisWeek: 3 });
    expect(evaluatePrPenalties(oneBusyDay, [minShiftsRule()]).breaches).toEqual([]);
  });

  test('a disabled rule fines nobody', () => {
    expect(evaluatePrPenalties(window(), [minShiftsRule({ enabled: false })]).breaches).toEqual([]);
  });

  test('an unreadable fine is a zero-fine breach, never a crash', () => {
    const { breaches, totalFineCents } = evaluatePrPenalties(window(), [
      minShiftsRule({ fineRm: 'not a number' }),
    ]);
    expect(breaches).toHaveLength(1);
    expect(totalFineCents).toBe(0);
  });
});
