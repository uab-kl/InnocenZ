// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test as globals.
import { pvLookupState } from './pv-lookup';

/*
 * PV DETAIL SHOWED LAST WEEK'S VOUCHER FOR AN ID IT COULD NOT FIND (29 Sep
 * 2026). These pin when it may show a voucher at all, and what it says when it
 * may not.
 */

const settled = {
  historyIds: ['pv-old', 'pv-closed'],
  historyFailed: false,
  // A PR on two rosters: one voucher per agency for last week.
  lastWeekIds: ['pv-lw-atlas', 'pv-lw-velvet'],
  lastWeekFailed: false,
};

describe('which voucher PV detail may show', () => {
  test.each(['pv-closed', 'pv-lw-velvet'])('%s is held by a loaded list → shown', (pvId) => {
    expect(pvLookupState({ ...settled, pvId })).toBe('found');
  });

  test('THE BUG: an id neither list holds is NOT FOUND — never last week’s voucher', () => {
    expect(pvLookupState({ ...settled, pvId: 'pv-gone' })).toBe('notFound');
  });

  test('found as soon as ONE list holds it, even while the other still loads', () => {
    expect(pvLookupState({ ...settled, pvId: 'pv-lw-atlas', historyIds: null })).toBe('found');
  });

  test('absent from a list that has not answered yet proves nothing — loading', () => {
    expect(pvLookupState({ ...settled, pvId: 'pv-gone', historyIds: null })).toBe('loading');
    expect(pvLookupState({ ...settled, pvId: 'pv-gone', lastWeekIds: null })).toBe('loading');
  });

  test('absent from a list that FAILED proves nothing either — unavailable, with a retry', () => {
    expect(pvLookupState({ ...settled, pvId: 'pv-gone', historyFailed: true })).toBe('unavailable');
    expect(pvLookupState({ ...settled, pvId: 'pv-gone', lastWeekFailed: true })).toBe('unavailable');
  });

  test('no vouchers anywhere yet (a new PR) → not found, not a forever spinner', () => {
    expect(
      pvLookupState({
        pvId: 'pv-x',
        historyIds: [],
        historyFailed: false,
        lastWeekIds: [],
        lastWeekFailed: false,
      }),
    ).toBe('notFound');
  });
});
