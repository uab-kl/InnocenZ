// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import { historyEmptyState, historyFiltersActive } from './history-empty-state';

/**
 * HISTORY'S EMPTY MESSAGE (28 Sep 2026 audit, seen live): with no filter set and
 * no shift yet this week, the Current-week tab printed "No shifts match these
 * filters" and a Reset button under the week card's own "No shifts in this
 * week". Only a list a FILTER emptied may say that.
 */

const NO_FILTER = { query: '', outlet: 'all', status: 'any', date: '' };

describe('historyEmptyState', () => {
  test('THE BUG: current week, nothing logged, no filter — no second message (the card says it)', () => {
    expect(
      historyEmptyState({ shownCount: 0, weekTab: 'current', hasAnyPayrollWeek: true, filtersActive: false }),
    ).toBe('none');
  });

  test('a filter that emptied the list is the one case Reset can fix', () => {
    expect(
      historyEmptyState({ shownCount: 0, weekTab: 'current', hasAnyPayrollWeek: true, filtersActive: true }),
    ).toBe('noShiftsMatch');
    expect(
      historyEmptyState({ shownCount: 0, weekTab: 'payroll', hasAnyPayrollWeek: true, filtersActive: true }),
    ).toBe('noShiftsMatch');
  });

  test('never issued a voucher: the payroll tab says so, filters or not', () => {
    expect(
      historyEmptyState({ shownCount: 0, weekTab: 'payroll', hasAnyPayrollWeek: false, filtersActive: false }),
    ).toBe('noPayrollWeeksYet');
    expect(
      historyEmptyState({ shownCount: 0, weekTab: 'payroll', hasAnyPayrollWeek: false, filtersActive: true }),
    ).toBe('noPayrollWeeksYet');
  });

  test('payroll weeks that carry no shift (a fee-only week) are not "no shifts match"', () => {
    expect(
      historyEmptyState({ shownCount: 0, weekTab: 'payroll', hasAnyPayrollWeek: true, filtersActive: false }),
    ).toBe('noPayrollShiftsYet');
  });

  test('anything shown: no empty message at all', () => {
    expect(
      historyEmptyState({ shownCount: 3, weekTab: 'payroll', hasAnyPayrollWeek: true, filtersActive: true }),
    ).toBe('none');
  });
});

describe('historyFiltersActive', () => {
  test('nothing set', () => {
    expect(historyFiltersActive(NO_FILTER)).toBe(false);
  });

  test('a search of spaces searches nothing, so it is not a filter', () => {
    expect(historyFiltersActive({ ...NO_FILTER, query: '   ' })).toBe(false);
  });

  test.each([
    ['a search', { query: 'velvet' }],
    ['an outlet', { outlet: 'Velvet' }],
    ['a status', { status: 'signed' }],
    ['a date', { date: '2026-09-28' }],
  ])('%s is', (_label, patch) => {
    expect(historyFiltersActive({ ...NO_FILTER, ...patch })).toBe(true);
  });
});
