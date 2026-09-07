import { describe, expect, test } from 'vitest';
import { pickActive } from './pick-active-shift';
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
