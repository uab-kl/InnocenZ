// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test as globals. This file imported them from VITEST, and
// `require`ing vitest from a CommonJS context throws at collection — so the
// suite reported "1 failed, 0 tests" and all 7 cases below, which guard the
// two-simultaneous-open-check-ins regression, had never run once.
import { pickActive, shiftDayKeys } from './pick-active-shift';
import type { ShiftAssignmentRecord } from './api';

/**
 * The live case (7 Sep 2026): Vicky held TWO open check-ins — UAB Emhub stamped
 * 11:10 and never closed, Velvet 23 stamped 11:31 — because nothing on the
 * server refused the second one. Check-In shows ONE shift, and `pickActive`
 * chose it with `.find`, which returns whichever row the API happened to list
 * first. That made the other one unreachable, so she could not check out of the
 * shift that was blocking every future check-in.
 *
 * The backend now refuses a second stamp, but rows written before that rule
 * exist and still have to be closable.
 */
const NONE = new Set<string>();
const TODAY = new Date();
const todayIso = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}-${String(TODAY.getDate()).padStart(2, '0')}`;

function row(over: Partial<ShiftAssignmentRecord>): ShiftAssignmentRecord {
  return {
    id: 'a1',
    status: 'confirmed',
    shiftDate: todayIso,
    slot: '11:30 - 12:00',
    checkInAt: null,
    checkOutAt: null,
    ...over,
  } as ShiftAssignmentRecord;
}

const emhub = row({
  id: 'a-emhub',
  slot: '11:30 - 12:00',
  checkInAt: `${todayIso}T03:10:00.536Z`,
});
const velvet = row({
  id: 'a-velvet',
  slot: '13:00 - 14:00',
  checkInAt: `${todayIso}T03:31:18.296Z`,
});

describe('pickActive · two open check-ins', () => {
  test('picks the OLDEST open stamp, whatever order the API returns', () => {
    // Both orders must agree, or the answer is array order and not a rule.
    expect(pickActive([emhub, velvet], NONE)?.id).toBe('a-emhub');
    expect(pickActive([velvet, emhub], NONE)?.id).toBe('a-emhub');
  });

  test('the forgotten stamp is the one that needs closing', () => {
    // Emhub's shift ended at 12:00; Velvet 23 runs 13:00-14:00. The stale row
    // is the blocker, so Check-In has to open on it.
    expect(pickActive([velvet, emhub], NONE)?.slot).toBe('11:30 - 12:00');
  });
});

describe('pickActive · the ordinary single open check-in is unchanged', () => {
  test('one open stamp is still picked', () => {
    expect(pickActive([velvet], NONE)?.id).toBe('a-velvet');
  });

  test('a closed row does not count as on duty', () => {
    const closed = row({
      id: 'a-closed',
      checkInAt: `${todayIso}T03:10:00.536Z`,
      checkOutAt: `${todayIso}T04:00:00.000Z`,
    });
    expect(pickActive([closed, velvet], NONE)?.id).toBe('a-velvet');
  });

  test('a dismissed row is skipped even while open', () => {
    expect(pickActive([emhub, velvet], new Set(['a-emhub']))?.id).toBe(
      'a-velvet',
    );
  });

  test('a cancelled row never wins, open stamp or not', () => {
    const cancelled = row({
      id: 'a-cancelled',
      status: 'cancelled',
      checkInAt: `${todayIso}T02:00:00.000Z`,
    });
    expect(pickActive([cancelled, velvet], NONE)?.id).toBe('a-velvet');
  });

  test("tomorrow's stray stamp does not hijack today", () => {
    const [y, m, d] = todayIso.split('-').map(Number);
    const tomorrow = new Date(y, m - 1, d + 1);
    const tomorrowIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    const future = row({
      id: 'a-tomorrow',
      shiftDate: tomorrowIso,
      checkInAt: `${todayIso}T01:00:00.000Z`,
    });
    expect(pickActive([future, velvet], NONE)?.id).toBe('a-velvet');
  });
});

describe('shiftDayKeys', () => {
  it('spans both days of a shift that crossed midnight', () => {
    // Checked in 22:30, still on duty at 01:10 the next morning.
    const keys = shiftDayKeys('2026-09-12T22:30:00+08:00', null, '2026-09-13');
    expect(keys).toEqual(['2026-09-12', '2026-09-13']);
  });

  it('stops at the check-out day, not the day after', () => {
    // A closed shift must not swallow the next night's receipts.
    const keys = shiftDayKeys(
      '2026-09-12T22:30:00+08:00',
      '2026-09-13T03:00:00+08:00',
      '2026-09-14',
    );
    expect(keys).toEqual(['2026-09-12', '2026-09-13']);
  });

  it('is just today when there is no check-in stamp', () => {
    expect(shiftDayKeys(null, null, '2026-09-13')).toEqual(['2026-09-13']);
  });

  it('is one day for a shift that did not cross midnight', () => {
    const keys = shiftDayKeys(
      '2026-09-13T19:00:00+08:00',
      '2026-09-13T23:00:00+08:00',
      '2026-09-13',
    );
    expect(keys).toEqual(['2026-09-13']);
  });

  it('caps the span so an impossible stamp cannot spin the loop', () => {
    // A check-out a year later is not a real shift; it must not enumerate 365 days.
    const keys = shiftDayKeys(
      '2026-01-01T20:00:00+08:00',
      '2027-01-01T02:00:00+08:00',
      '2027-01-01',
    );
    expect(keys).toHaveLength(4);
  });

  it('ignores a check-out that precedes the check-in', () => {
    const keys = shiftDayKeys(
      '2026-09-13T20:00:00+08:00',
      '2026-09-01T02:00:00+08:00',
      '2026-09-13',
    );
    expect(keys).toEqual(['2026-09-13']);
  });
});
